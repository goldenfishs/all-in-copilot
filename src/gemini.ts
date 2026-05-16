import * as vscode from 'vscode';
import type { ResolvedModelConfig } from './types';
import { collectToolResultText, inputPartToText, isToolResultPart } from './messageParts';
import {
  estimateMessagesTokenCount,
  estimateTextTokenCount,
  mergeTokenUsage,
  reportCopilotTokenUsage,
  type TokenUsage,
} from './usage';

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export function buildGeminiHeaders(model: ResolvedModelConfig, apiKey: string): Record<string, string> {
  return {
    'x-goog-api-key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...model.headers,
  };
}

export function buildGeminiGenerateContentUrl(baseUrl: string, modelId: string, stream: boolean): string {
  const url = normalizeGeminiBaseUrl(baseUrl);
  const modelPath = normalizeGeminiModelPath(modelId);
  const method = stream ? 'streamGenerateContent' : 'generateContent';
  url.pathname = joinPath(url.pathname, `/${modelPath}:${method}`);
  url.search = '';
  url.hash = '';
  if (stream) {
    url.searchParams.set('alt', 'sse');
  }
  return url.toString();
}

export function buildGeminiModelsUrl(baseUrl: string): string {
  const url = normalizeGeminiBaseUrl(baseUrl);
  url.pathname = joinPath(url.pathname, '/models');
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function buildGeminiRequest(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
): Record<string, unknown> {
  const converted = convertMessages(messages);
  const request: Record<string, unknown> = {
    contents: converted.contents,
    generationConfig: {
      maxOutputTokens: model.maxOutputTokens,
    },
  };

  if (converted.systemText) {
    request.systemInstruction = {
      role: 'user',
      parts: [{ text: converted.systemText }],
    };
  }

  const generationConfig = request.generationConfig as Record<string, unknown>;
  if (model.temperature !== undefined && model.temperature !== null) {
    generationConfig.temperature = model.temperature;
  }
  if (model.topP !== undefined && model.topP !== null) {
    generationConfig.topP = model.topP;
  }

  const tools = convertTools(options);
  if (model.toolCalling && tools.length > 0) {
    request.tools = [{ functionDeclarations: tools }];
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

export async function processGeminiStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const emittedToolCalls = new Set<string>();
  const stats = {
    textTokens: 0,
    usageReported: false,
    usage: undefined as TokenUsage | undefined,
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
          processGeminiChunk(JSON.parse(data) as Record<string, unknown>, emittedToolCalls, progress, stats);
        } catch {
          // Ignore malformed keepalive/event fragments.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (stats.usage) {
    stats.usageReported = reportCopilotTokenUsage(progress, stats.usage, 'gemini-stream');
  } else {
    stats.usageReported = reportCopilotTokenUsage(progress, {
      promptTokens: estimateMessagesTokenCount(messages),
      completionTokens: stats.textTokens,
    }, 'gemini-estimated');
  }
}

function convertMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
  systemText?: string;
  contents: GeminiContent[];
} {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  const toolNames = new Map<string, string>();

  for (const message of messages) {
    const role = mapRole(message);
    const parts: GeminiPart[] = [];

    for (const part of message.content ?? []) {
      if (part instanceof vscode.LanguageModelTextPart) {
        if (part.value) {
          parts.push({ text: part.value });
        }
        continue;
      }

      if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/')) {
        parts.push({
          inlineData: {
            mimeType: part.mimeType,
            data: Buffer.from(part.data).toString('base64'),
          },
        });
        continue;
      }

      if (part instanceof vscode.LanguageModelToolCallPart) {
        toolNames.set(part.callId, part.name);
        parts.push({
          functionCall: {
            name: part.name,
            args: parseJsonObject(stringifyJson(part.input ?? {})),
          },
        });
        continue;
      }

      if (isToolResultPart(part)) {
        parts.push({
          functionResponse: {
            name: toolNames.get(part.callId) || part.callId || 'tool_result',
            response: {
              result: collectToolResultText(part.content),
            },
          },
        });
        continue;
      }

      const fallbackText = inputPartToText(part);
      if (fallbackText) {
        parts.push({ text: fallbackText });
      }
    }

    if (role === 'system') {
      const text = parts.map((part) => part.text ?? '').join('').trim();
      if (text) {
        systemParts.push(text);
      }
      continue;
    }

    if (parts.length > 0) {
      contents.push({
        role: role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }
  }

  return {
    systemText: systemParts.join('\n\n') || undefined,
    contents: mergeAdjacentContents(contents),
  };
}

function convertTools(options: vscode.ProvideLanguageModelChatResponseOptions): Array<Record<string, unknown>> {
  return (options.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: stripUnsupportedSchemaKeys(tool.inputSchema ?? { type: 'object', properties: {} }),
  }));
}

function processGeminiChunk(
  chunk: Record<string, unknown>,
  emittedToolCalls: Set<string>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  stats: { textTokens: number; usageReported: boolean; usage?: TokenUsage },
): void {
  const usage = readGeminiUsage(chunk.usageMetadata ?? chunk.usage_metadata ?? chunk.usage);
  if (usage) {
    stats.usage = mergeTokenUsage(stats.usage, usage);
  }

  const candidates = Array.isArray(chunk.candidates) ? chunk.candidates : [];
  const candidate = readRecord(candidates[0]);
  const content = readRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];

  for (const rawPart of parts) {
    const part = readRecord(rawPart);
    if (!part) {
      continue;
    }

    if (typeof part.text === 'string' && part.text.length > 0) {
      progress.report(new vscode.LanguageModelTextPart(part.text));
      stats.textTokens += estimateTextTokenCount(part.text);
    }

    const functionCall = readRecord(part.functionCall);
    const name = readString(functionCall?.name);
    if (!name) {
      continue;
    }
    const signature = stringifyJson(functionCall);
    if (emittedToolCalls.has(signature)) {
      continue;
    }
    emittedToolCalls.add(signature);
    progress.report(new vscode.LanguageModelToolCallPart(
      createToolCallId(),
      name,
      parseJsonObject(stringifyJson(functionCall?.args ?? {})),
    ));
  }
}

function normalizeGeminiBaseUrl(baseUrl: string): URL {
  const raw = baseUrl.trim() || 'https://generativelanguage.googleapis.com';
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  let pathname = url.pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/models$/i, '');
  pathname = pathname.replace(/\/openai$/i, '');

  if (!/\/v1(?:beta)?$/i.test(pathname)) {
    pathname = joinPath(pathname || '/', '/v1beta');
  }

  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url;
}

function normalizeGeminiModelPath(modelId: string): string {
  const value = modelId.trim().replace(/^\/+/, '');
  if (value.startsWith('models/') || value.startsWith('tunedModels/')) {
    return value;
  }
  return `models/${encodeURIComponent(value || 'gemini-2.5-flash')}`;
}

function joinPath(left: string, right: string): string {
  const a = left.endsWith('/') ? left.slice(0, -1) : left;
  const b = right.startsWith('/') ? right : `/${right}`;
  return `${a || ''}${b}`;
}

function mergeAdjacentContents(contents: GeminiContent[]): GeminiContent[] {
  const merged: GeminiContent[] = [];
  for (const content of contents) {
    const previous = merged.at(-1);
    if (previous?.role === content.role) {
      previous.parts.push(...content.parts);
    } else {
      merged.push({ role: content.role, parts: [...content.parts] });
    }
  }
  return merged;
}

function stripUnsupportedSchemaKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedSchemaKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum' || key === 'enumDescriptions') {
      continue;
    }
    out[key] = stripUnsupportedSchemaKeys(entry);
  }
  return out;
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readGeminiUsage(value: unknown): TokenUsage | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }

  const promptTokens =
    readNumber(record.promptTokenCount) ??
    readNumber(record.prompt_tokens) ??
    readNumber(record.input_tokens);
  const completionTokens =
    readNumber(record.candidatesTokenCount) ??
    readNumber(record.completion_tokens) ??
    readNumber(record.output_tokens);
  const thoughtsTokens = readNumber(record.thoughtsTokenCount) ?? 0;
  const totalTokens =
    readNumber(record.totalTokenCount) ??
    readNumber(record.total_tokens) ??
    ((promptTokens ?? 0) + (completionTokens ?? 0) + thoughtsTokens || undefined);
  const cachedTokens =
    readNumber(record.cachedContentTokenCount) ??
    readNumber(record.cached_tokens);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens: (completionTokens ?? 0) + thoughtsTokens,
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
