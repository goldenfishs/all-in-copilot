import * as vscode from 'vscode';
import type { ResolvedModelConfig } from './types';

interface ResponsesToolBuffer {
  callId?: string;
  name?: string;
  arguments: string;
  emitted?: boolean;
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
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolBuffers = new Map<string, ResponsesToolBuffer>();
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
          processResponsesEvent(JSON.parse(data) as Record<string, unknown>, toolBuffers, progress);
        } catch {
          // Ignore malformed stream fragments; providers often mix keepalive data with SSE.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  flushToolBuffers(toolBuffers, progress);
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
      }
    }

    const text = textParts.join('').trim();
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
): void {
  const type = readString(event.type) ?? readString(event.event);

  if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
    progress.report(new vscode.LanguageModelTextPart(event.delta));
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

function isToolResultPart(value: unknown): value is { callId: string; content?: readonly unknown[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.callId === 'string' && 'content' in record;
}

function collectToolResultText(parts?: readonly unknown[]): string {
  return (parts ?? []).map((part) => {
    if (part instanceof vscode.LanguageModelTextPart) {
      return part.value;
    }
    if (typeof part === 'string') {
      return part;
    }
    return stringifyJson(part);
  }).join('');
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
