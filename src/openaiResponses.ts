import * as vscode from 'vscode';
import type { ResolvedModelConfig } from './types';
import { collectToolResultText, inputPartToText, isToolResultPart, joinPartTexts } from './messageParts';
import {
  estimateMessagesTokenCount,
  estimateTextTokenCount,
  mergeTokenUsage,
  reportCopilotTokenUsage,
  type TokenUsage,
} from './usage';

interface ResponsesToolBuffer {
  callId?: string;
  name?: string;
  arguments: string;
  emitted?: boolean;
}

interface ResponsesStreamStats {
  textTokens: number;
  usageReported: boolean;
  usage?: TokenUsage;
}

export function buildOpenAIResponsesRequest(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
): Record<string, unknown> {
  const converted = convertMessages(messages);
  const request: Record<string, unknown> = {
    model: model.id,
    input: converted.input,
    stream: true,
    max_output_tokens: model.maxOutputTokens,
  };

  if (converted.instructions) {
    request.instructions = converted.instructions;
  }

  if (model.temperature !== undefined && model.temperature !== null) {
    request.temperature = model.temperature;
  }

  if (model.topP !== undefined && model.topP !== null) {
    request.top_p = model.topP;
  }

  const reasoningEffort = getReasoningEffort(model, options);
  if (reasoningEffort) {
    request.reasoning = { effort: reasoningEffort };
  }

  const tools = convertTools(options);
  if (model.toolCalling && tools.length > 0) {
    request.tools = tools;
  }

  if (model.extra) {
    for (const [key, value] of Object.entries(model.extra)) {
      if (value !== undefined) {
        request[key] = value;
      }
    }
  }

  return request;
}

export function buildOpenAIResponsesHeaders(
  model: ResolvedModelConfig,
  apiKey: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...model.headers,
  };
}

export async function processOpenAIResponsesStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolBuffers = new Map<string, ResponsesToolBuffer>();
  const stats: ResponsesStreamStats = {
    textTokens: 0,
    usageReported: false,
  };
  let buffer = '';

  try {
    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const data = trimmed.slice('data:'.length).trim();
        if (!data || data === '[DONE]') {
          continue;
        }

        try {
          processResponsesEvent(JSON.parse(data) as Record<string, unknown>, toolBuffers, progress, stats);
        } catch {
          // Ignore malformed stream fragments; providers often mix keepalive data with SSE.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  flushToolBuffers(toolBuffers, progress);
  if (stats.usage) {
    stats.usageReported = reportCopilotTokenUsage(progress, stats.usage, 'openai-responses-stream');
  } else {
    stats.usageReported = reportCopilotTokenUsage(progress, {
      promptTokens: estimateMessagesTokenCount(messages),
      completionTokens: stats.textTokens,
    }, 'openai-responses-estimated');
  }
}

function convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
  instructions?: string;
  input: Array<Record<string, unknown>>;
} {
  const instructions: string[] = [];
  const input: Array<Record<string, unknown>> = [];
  const toolNames = new Map<string, string>();

  for (const message of messages) {
    const role = mapRole(message);
    const textParts: string[] = [];
    const imageParts: vscode.LanguageModelDataPart[] = [];
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    const toolResults: Array<{ callId: string; output: string }> = [];

    for (const part of message.content ?? []) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
        continue;
      }

      if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) {
        imageParts.push(part);
        continue;
      }

      if (part instanceof vscode.LanguageModelToolCallPart) {
        const id = part.callId || createToolCallId();
        toolCalls.push({
          id,
          name: part.name,
          arguments: stringifyJson(part.input ?? {}),
        });
        toolNames.set(id, part.name);
        continue;
      }

      if (isToolResultPart(part)) {
        toolResults.push({
          callId: part.callId,
          output: collectToolResultText(part.content),
        });
        continue;
      }

      const fallbackText = inputPartToText(part);
      if (fallbackText) {
        textParts.push(fallbackText);
      }
    }

    const text = joinPartTexts(textParts);
    if (role === 'system') {
      if (text) {
        instructions.push(text);
      }
      continue;
    }

    if (role === 'assistant') {
      if (text) {
        input.push({
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text }],
        });
      }

      for (const toolCall of toolCalls) {
        input.push({
          type: 'function_call',
          id: `fc_${toolCall.id}`,
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          status: 'completed',
        });
      }
    }

    for (const toolResult of toolResults) {
      if (!toolResult.callId) {
        continue;
      }
      input.push({
        type: 'function_call_output',
        id: `fco_${toolResult.callId}`,
        call_id: toolResult.callId,
        output: toolResult.output,
        status: 'completed',
      });
      toolNames.delete(toolResult.callId);
    }

    if (role === 'user') {
      const content: Array<Record<string, unknown>> = [];
      if (text) {
        content.push({ type: 'input_text', text });
      }
      for (const image of imageParts) {
        content.push({
          type: 'input_image',
          image_url: createDataUrl(image),
          detail: 'auto',
        });
      }
      if (content.length > 0) {
        input.push({
          type: 'message',
          role: 'user',
          status: 'completed',
          content,
        });
      }
    }
  }

  return {
    instructions: instructions.join('\n\n') || undefined,
    input,
  };
}

function convertTools(options: vscode.ProvideLanguageModelChatResponseOptions): Array<Record<string, unknown>> {
  return (options.tools ?? []).map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ?? { type: 'object', properties: {} },
  }));
}

function processResponsesEvent(
  event: Record<string, unknown>,
  toolBuffers: Map<string, ResponsesToolBuffer>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  stats: ResponsesStreamStats,
): void {
  const type = readString(event.type) ?? readString(event.event);
  const usage = readResponsesUsage(event.usage ?? readRecord(event.response)?.usage);
  if (usage) {
    stats.usage = mergeTokenUsage(stats.usage, usage);
  }

  if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
    progress.report(new vscode.LanguageModelTextPart(event.delta));
    stats.textTokens += estimateTextTokenCount(event.delta);
    return;
  }

  if (type === 'response.function_call_arguments.delta') {
    const key = toolEventKey(event);
    const buffer = toolBuffers.get(key) ?? { arguments: '' };
    if (typeof event.delta === 'string') {
      buffer.arguments += event.delta;
    }
    toolBuffers.set(key, buffer);
    return;
  }

  const item = readRecord(event.item);
  if ((type === 'response.output_item.added' || type === 'response.output_item.done') && item?.type === 'function_call') {
    const key = toolEventKey(event, item);
    const buffer = toolBuffers.get(key) ?? { arguments: '' };
    buffer.callId = readString(item.call_id) ?? readString(item.id) ?? buffer.callId;
    buffer.name = readString(item.name) ?? buffer.name;
    const args = readString(item.arguments);
    if (args !== undefined) {
      buffer.arguments = args;
    }
    toolBuffers.set(key, buffer);
    if (type === 'response.output_item.done') {
      emitToolBuffer(key, buffer, toolBuffers, progress);
    }
    return;
  }

  if (type === 'response.function_call_arguments.done') {
    const key = toolEventKey(event);
    const buffer = toolBuffers.get(key);
    if (!buffer) {
      return;
    }
    if (typeof event.arguments === 'string') {
      buffer.arguments = event.arguments;
    }
    emitToolBuffer(key, buffer, toolBuffers, progress);
  }
}

function toolEventKey(event: Record<string, unknown>, item?: Record<string, unknown>): string {
  return (typeof event.output_index === 'number' ? String(event.output_index) : undefined) ??
    readString(event.item_id) ??
    readString(item?.id) ??
    readString(item?.call_id) ??
    readString(event.call_id) ??
    '0';
}

function flushToolBuffers(
  toolBuffers: Map<string, ResponsesToolBuffer>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
): void {
  for (const [key, buffer] of Array.from(toolBuffers.entries())) {
    emitToolBuffer(key, buffer, toolBuffers, progress);
  }
}

function emitToolBuffer(
  key: string,
  buffer: ResponsesToolBuffer,
  toolBuffers: Map<string, ResponsesToolBuffer>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
): void {
  if (buffer.emitted || !buffer.name) {
    return;
  }
  progress.report(new vscode.LanguageModelToolCallPart(
    buffer.callId || createToolCallId(),
    buffer.name,
    parseJsonObject(buffer.arguments),
  ));
  buffer.emitted = true;
  toolBuffers.set(key, buffer);
}

function getReasoningEffort(
  model: ResolvedModelConfig,
  options: vscode.ProvideLanguageModelChatResponseOptions,
): string | undefined {
  const modelOptions = options.modelOptions as Record<string, unknown> | undefined;
  const configured = typeof modelOptions?.reasoningEffort === 'string' ? modelOptions.reasoningEffort : undefined;
  return configured || model.reasoningEffort;
}

function mapRole(message: vscode.LanguageModelChatRequestMessage): 'user' | 'assistant' | 'system' {
  if (message.role === vscode.LanguageModelChatMessageRole.User) {
    return 'user';
  }
  if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }
  return 'system';
}

function createDataUrl(part: vscode.LanguageModelDataPart): string {
  return `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readResponsesUsage(value: unknown): TokenUsage | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }

  const inputDetails = readRecord(record.input_tokens_details);
  const promptTokens =
    readNumber(record.input_tokens) ??
    readNumber(record.prompt_tokens);
  const completionTokens =
    readNumber(record.output_tokens) ??
    readNumber(record.completion_tokens);
  const totalTokens =
    readNumber(record.total_tokens) ??
    ((promptTokens ?? 0) + (completionTokens ?? 0) || undefined);
  const cachedTokens =
    readNumber(inputDetails?.cached_tokens) ??
    readNumber(inputDetails?.cache_read_input_tokens);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
  };
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
