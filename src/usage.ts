import * as vscode from 'vscode';
import { logger } from './logger';
import { dataPartToText, inputPartToText } from './messageParts';

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
}

const COPILOT_USAGE_DATA_PART_MIME = 'usage';

export function reportCopilotTokenUsage(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  usage: TokenUsage,
  source: string,
): boolean {
  const promptTokens = normalizeTokenCount(usage.promptTokens) ?? 0;
  const completionTokens = normalizeTokenCount(usage.completionTokens) ?? 0;
  const totalTokens = normalizeTokenCount(usage.totalTokens) ?? promptTokens + completionTokens;
  const cachedTokens = normalizeTokenCount(usage.cachedTokens) ?? 0;

  if (promptTokens <= 0 && completionTokens <= 0 && totalTokens <= 0) {
    return false;
  }

  const data = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: Math.max(totalTokens, promptTokens + completionTokens),
    prompt_tokens_details: {
      cached_tokens: cachedTokens,
    },
  };

  progress.report(new vscode.LanguageModelDataPart(
    new TextEncoder().encode(JSON.stringify(data)),
    COPILOT_USAGE_DATA_PART_MIME,
  ));
  logger.debug('Reported token usage to Copilot.', { source, ...data });
  return true;
}

export function mergeTokenUsage(current: TokenUsage | undefined, update: TokenUsage): TokenUsage {
  return {
    promptTokens: pickLatestTokenCount(current?.promptTokens, update.promptTokens),
    completionTokens: pickLatestTokenCount(current?.completionTokens, update.completionTokens),
    totalTokens: pickLatestTokenCount(current?.totalTokens, update.totalTokens),
    cachedTokens: pickLatestTokenCount(current?.cachedTokens, update.cachedTokens),
  };
}

export function estimateMessagesTokenCount(messages: readonly vscode.LanguageModelChatRequestMessage[]): number {
  const total = messages.reduce((sum, message) => sum + estimateMessageTokenCount(message), 0);
  return Math.max(1, total);
}

export function estimateMessageTokenCount(message: vscode.LanguageModelChatRequestMessage): number {
  let tokens = estimateTextTokenCount(roleName(message.role));
  if (message.name) {
    tokens += estimateTextTokenCount(message.name);
  }
  for (const part of message.content ?? []) {
    tokens += estimatePartTokenCount(part);
  }
  return Math.max(1, tokens);
}

export function estimateTextTokenCount(value: string): number {
  if (!value) {
    return 0;
  }

  let ascii = 0;
  let cjk = 0;
  let other = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      cjk += 1;
    } else if (code <= 0x7f) {
      ascii += 1;
    } else {
      other += 1;
    }
  }

  return Math.max(1, Math.ceil(ascii / 4) + Math.ceil(cjk * 0.8) + Math.ceil(other / 2));
}

export function estimateJsonTokenCount(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === 'string') {
    return estimateTextTokenCount(value);
  }

  try {
    return estimateTextTokenCount(JSON.stringify(value));
  } catch {
    return 1;
  }
}

function estimatePartTokenCount(part: unknown): number {
  if (part instanceof vscode.LanguageModelTextPart) {
    return estimateTextTokenCount(part.value);
  }

  if (part instanceof vscode.LanguageModelToolCallPart) {
    return estimateTextTokenCount(part.name) +
      estimateTextTokenCount(part.callId) +
      estimateJsonTokenCount(part.input);
  }

  if (part instanceof vscode.LanguageModelToolResultPart) {
    return estimateTextTokenCount(part.callId) +
      part.content.reduce<number>((sum, entry) => sum + estimatePartTokenCount(entry), 0);
  }

  if (part instanceof vscode.LanguageModelDataPart) {
    if (part.mimeType.startsWith('text/') || part.mimeType === 'application/json') {
      return estimateTextTokenCount(dataPartToText(part));
    }
    if (part.mimeType.startsWith('image/')) {
      return Math.max(85, Math.ceil(part.data.byteLength / 1536));
    }
    return Math.max(1, Math.ceil(part.data.byteLength / 3));
  }

  return estimateTextTokenCount(inputPartToText(part)) || estimateJsonTokenCount(part);
}

function normalizeTokenCount(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function pickLatestTokenCount(current: number | undefined, update: number | undefined): number | undefined {
  return normalizeTokenCount(update) ?? normalizeTokenCount(current);
}

function roleName(role: vscode.LanguageModelChatMessageRole): string {
  if (role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }
  if (role === vscode.LanguageModelChatMessageRole.User) {
    return 'user';
  }
  return 'system';
}
