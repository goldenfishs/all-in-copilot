import * as vscode from 'vscode';
import type { ResolvedModelConfig } from './types';
import { collectToolResultText, inputPartToText, isToolResultPart } from './messageParts';
import { logger } from './logger';
import {
  estimateMessagesTokenCount,
  estimateTextTokenCount,
  mergeTokenUsage,
  reportCopilotTokenUsage,
  type TokenUsage,
} from './usage';

interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: object;
  tool_use_id?: string;
  content?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: object;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  stream: true;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
  top_p?: number;
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  [key: string]: unknown;
}

export function buildAnthropicRequest(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
): AnthropicRequest {
  const converted = convertMessages(messages);
  const request: AnthropicRequest = {
    model: model.id,
    max_tokens: model.maxOutputTokens,
    stream: true,
    messages: converted.messages,
  };

  if (converted.system) {
    request.system = converted.system;
  }

  if (model.temperature !== undefined && model.temperature !== null) {
    request.temperature = model.temperature;
  }

  if (model.topP !== undefined && model.topP !== null) {
    request.top_p = model.topP;
  }

  const thinkingBudget = normalizeThinkingBudget(model.thinkingBudgetTokens);
  if (thinkingBudget !== undefined) {
    request.thinking = {
      type: 'enabled',
      budget_tokens: thinkingBudget,
    };
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

function normalizeThinkingBudget(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(1024, Math.floor(value));
}

export function buildAnthropicHeaders(
  model: ResolvedModelConfig,
  apiKey: string,
): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...model.headers,
  };
}

export async function processAnthropicStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolBuffers = new Map<number, { id: string; name: string; input: string }>();
  const stats = {
    textTokens: 0,
    usageReported: false,
    usage: undefined as TokenUsage | undefined,
  };

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

        processAnthropicEvent(JSON.parse(data) as Record<string, unknown>, toolBuffers, progress, stats);
      }
    }
  } finally {
    reader.releaseLock();
  }

  flushToolBuffers(toolBuffers, progress);
  if (stats.usage) {
    stats.usageReported = reportCopilotTokenUsage(progress, stats.usage, 'anthropic-stream');
  } else {
    stats.usageReported = reportCopilotTokenUsage(progress, {
      promptTokens: estimateMessagesTokenCount(messages),
      completionTokens: stats.textTokens,
    }, 'anthropic-estimated');
  }
}

function convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  for (const message of messages) {
    const role = mapRole(message);
    const content = convertContent(message.content ?? []);

    if (role === 'system') {
      const text = contentToText(content);
      if (text) {
        systemParts.push(text);
      }
      continue;
    }

    out.push({
      role,
      content: content.length === 1 && content[0].type === 'text' ? content[0].text ?? '' : content,
    });
  }

  return {
    system: systemParts.join('\n\n') || undefined,
    messages: mergeAdjacentMessages(out),
  };
}

function convertContent(parts: readonly unknown[]): AnthropicContentBlock[] {
  const content: AnthropicContentBlock[] = [];

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      if (part.value) {
        content.push({ type: 'text', text: part.value });
      }
      continue;
    }

    if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mimeType,
          data: Buffer.from(part.data).toString('base64'),
        },
      });
      continue;
    }

    if (part instanceof vscode.LanguageModelToolCallPart) {
      content.push({
        type: 'tool_use',
        id: part.callId,
        name: part.name,
        input: part.input,
      });
      continue;
    }

    if (isToolResultPart(part)) {
      content.push({
        type: 'tool_result',
        tool_use_id: part.callId,
        content: collectToolResultText(part.content),
      });
      continue;
    }

    const fallbackText = inputPartToText(part);
    if (fallbackText) {
      content.push({ type: 'text', text: fallbackText });
    }
  }

  return content.length > 0 ? content : [{ type: 'text', text: '' }];
}

function convertTools(options: vscode.ProvideLanguageModelChatResponseOptions): AnthropicTool[] {
  return (options.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema ?? { type: 'object', properties: {} },
  }));
}

function processAnthropicEvent(
  event: Record<string, unknown>,
  toolBuffers: Map<number, { id: string; name: string; input: string }>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  stats: { textTokens: number; usageReported: boolean; usage?: TokenUsage },
): void {
  const type = event.type;
  const rawMessage = readRecord(event.message);
  const usage = readAnthropicUsage(event.usage ?? rawMessage?.usage);
  if (usage) {
    stats.usage = mergeTokenUsage(stats.usage, usage);
  }

  // Debug: log event types and usage presence for troubleshooting
  if (type === 'message_start' || type === 'message_delta' || type === 'content_block_start') {
    const hasUsage = usage !== undefined;
    const hasMessageUsage = rawMessage?.usage !== undefined;
    logger.debug('Anthropic event', {
      type,
      hasUsage,
      hasMessageUsage,
      eventKeys: Object.keys(event),
      messageKeys: rawMessage ? Object.keys(rawMessage) : [],
    });
  }

  if (type === 'content_block_start') {
    const index = typeof event.index === 'number' ? event.index : 0;
    const block = event.content_block as Record<string, unknown> | undefined;
    if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
      toolBuffers.set(index, {
        id: block.id,
        name: block.name,
        input: '',
      });
    }
    return;
  }

  if (type === 'content_block_delta') {
    const index = typeof event.index === 'number' ? event.index : 0;
    const delta = event.delta as Record<string, unknown> | undefined;
    if (!delta) {
      return;
    }

    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
      progress.report(new vscode.LanguageModelTextPart(delta.text));
      stats.textTokens += estimateTextTokenCount(delta.text);
      return;
    }

    if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
      const buffer = toolBuffers.get(index);
      if (buffer) {
        buffer.input += delta.partial_json;
      }
    }
    return;
  }

  if (type === 'content_block_stop') {
    flushToolBuffers(toolBuffers, progress);
  }
}

function flushToolBuffers(
  toolBuffers: Map<number, { id: string; name: string; input: string }>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
): void {
  for (const [index, buffer] of Array.from(toolBuffers.entries())) {
    progress.report(new vscode.LanguageModelToolCallPart(
      buffer.id,
      buffer.name,
      parseJsonObject(buffer.input),
    ));
    toolBuffers.delete(index);
  }
}

function mergeAdjacentMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  const merged: AnthropicMessage[] = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role) {
      previous.content = mergeContent(previous.content, message.content);
    } else {
      merged.push(message);
    }
  }
  return merged;
}

function mergeContent(
  a: string | AnthropicContentBlock[],
  b: string | AnthropicContentBlock[],
): AnthropicContentBlock[] {
  const normalize = (value: string | AnthropicContentBlock[]): AnthropicContentBlock[] =>
    typeof value === 'string' ? [{ type: 'text', text: value }] : value;
  return [...normalize(a), ...normalize(b)];
}

function contentToText(content: AnthropicContentBlock[]): string {
  return content.map((part) => part.type === 'text' ? part.text ?? '' : '').join('').trim();
}

function mapRole(message: vscode.LanguageModelChatRequestMessage): 'user' | 'assistant' | 'system' {
  if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }
  if (message.role === vscode.LanguageModelChatMessageRole.User) {
    return 'user';
  }
  return 'system';
}

function readAnthropicUsage(value: unknown): TokenUsage | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }

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
    readNumber(record.cache_read_input_tokens) ??
    readNumber(record.cached_tokens);

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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
