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
  let total = 2; // priming tokens for assistant turn
  for (const message of messages) {
    total += estimateMessageTokenCount(message);
  }
  return Math.max(1, total);
}

export function estimateMessageTokenCount(message: vscode.LanguageModelChatRequestMessage): number {
  let tokens = 4; // role + framing overhead

  for (const part of message.content ?? []) {
    tokens += estimatePartTokenCount(part);
  }
  return Math.max(1, tokens);
}

const CJK = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g;
const WORD = /[A-Za-z0-9_]+/g;

/**
 * Improved heuristic tokenizer.
 * - CJK characters (~1 token each)
 * - ASCII word characters (~1 token per ~3 chars, BPE-style)
 * - everything else (punctuation, whitespace, control) at ~1 token per 6 chars.
 */
export function estimateTextTokenCount(value: string): number {
  if (!value) {
    return 0;
  }

  const cjkMatches = value.match(CJK);
  const cjk = cjkMatches?.length ?? 0;

  let words = 0;
  let wordChars = 0;
  for (const match of value.matchAll(WORD)) {
    words += 1;
    wordChars += match[0].length;
  }

  const otherChars = value.length - cjk - wordChars;
  const wordTokens = words + Math.ceil(Math.max(0, wordChars - words) / 3);
  const otherTokens = Math.ceil(Math.max(0, otherChars) / 6);

  return Math.max(1, cjk + wordTokens + otherTokens);
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
    let tokens = estimateTextTokenCount(part.name);
    try {
      tokens += estimateTextTokenCount(JSON.stringify(part.input ?? {}));
    } catch {
      tokens += 16;
    }
    tokens += 4; // tool call framing overhead
    return tokens;
  }

  if (part instanceof vscode.LanguageModelToolResultPart) {
    let tokens = 0;
    for (const inner of part.content ?? []) {
      if (inner instanceof vscode.LanguageModelTextPart) {
        tokens += estimateTextTokenCount(inner.value);
      } else {
        tokens += 8;
      }
    }
    tokens += 4; // tool result framing overhead
    return tokens;
  }

  if (part instanceof vscode.LanguageModelDataPart) {
    if (part.mimeType.startsWith('text/') || part.mimeType === 'application/json') {
      return estimateTextTokenCount(dataPartToText(part));
    }
    if (part.mimeType.startsWith('image/')) {
      // Vision models tokenize images as fixed-size patches
      return Math.max(85, Math.ceil(part.data.byteLength / 64));
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
