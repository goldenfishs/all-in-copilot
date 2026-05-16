import * as vscode from 'vscode';

export interface ToolResultLike {
  callId: string;
  content?: readonly unknown[];
}

export function isToolResultPart(value: unknown): value is ToolResultLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.callId === 'string' && 'content' in record;
}

export function collectToolResultText(parts?: readonly unknown[]): string {
  return joinPartTexts((parts ?? []).map((part) => inputPartToText(part)));
}

export function inputPartToText(part: unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) {
    return part.value;
  }

  if (part instanceof vscode.LanguageModelDataPart) {
    return dataPartToText(part);
  }

  if (part instanceof vscode.LanguageModelToolResultPart || isToolResultPart(part)) {
    return collectToolResultText(part.content);
  }

  if (part instanceof vscode.LanguageModelToolCallPart) {
    return '';
  }

  if (isPromptTsxPart(part)) {
    return unknownValueToText(part.value);
  }

  if (typeof part === 'string') {
    return part;
  }

  return unknownValueToText(part);
}

export function dataPartToText(part: vscode.LanguageModelDataPart): string {
  if (part.mimeType.startsWith('image/')) {
    return '';
  }

  const decoded = decodeUtf8(part.data);
  if (decoded && isLikelyText(decoded)) {
    return decoded;
  }

  return `[Attachment omitted: ${part.mimeType || 'application/octet-stream'}, ${part.data.byteLength} bytes]`;
}

export function joinPartTexts(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function summarizeMessageParts(messages: readonly vscode.LanguageModelChatRequestMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => ({
    role: roleName(message.role),
    partCount: message.content.length,
    parts: message.content.map((part) => ({
      kind: partKind(part),
      textChars: inputPartToText(part).length,
    })),
  }));
}

function isPromptTsxPart(value: unknown): value is vscode.LanguageModelPromptTsxPart {
  return value instanceof vscode.LanguageModelPromptTsxPart;
}

function unknownValueToText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  const stringLeaves = collectStringLeaves(value, new WeakSet<object>(), 0);
  const substantialLeaves = stringLeaves.filter((entry) => entry.trim().length > 0);
  if (substantialLeaves.some((entry) => entry.length > 12 || entry.includes('\n'))) {
    return joinPartTexts(dedupe(substantialLeaves));
  }

  return safeJsonStringify(value);
}

function collectStringLeaves(value: unknown, seen: WeakSet<object>, depth: number): string[] {
  if (depth > 20 || value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (typeof value !== 'object') {
    return [];
  }

  if (value instanceof Uint8Array) {
    const decoded = decodeUtf8(value);
    return decoded && isLikelyText(decoded) ? [decoded] : [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringLeaves(entry, seen, depth + 1));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (key === 'data' && entry instanceof Uint8Array) {
      return collectStringLeaves(entry, seen, depth + 1);
    }
    return collectStringLeaves(entry, seen, depth + 1);
  });
}

function safeJsonStringify(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, entry: unknown) => {
      if (entry instanceof Uint8Array) {
        const decoded = decodeUtf8(entry);
        return decoded && isLikelyText(decoded) ? decoded : `[Uint8Array ${entry.byteLength} bytes]`;
      }

      if (entry && typeof entry === 'object') {
        if (seen.has(entry)) {
          return '[Circular]';
        }
        seen.add(entry);
      }

      return entry;
    }, 2) ?? '';
  } catch {
    return '';
  }
}

function decodeUtf8(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return '';
  }
}

function isLikelyText(value: string): boolean {
  if (!value) {
    return false;
  }

  let printable = 0;
  let control = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0xfffd) {
      control += 1;
    } else if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      printable += 1;
    } else {
      control += 1;
    }
  }

  return printable > 0 && control / Math.max(1, printable + control) < 0.05;
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function partKind(part: unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) {
    return 'text';
  }
  if (part instanceof vscode.LanguageModelDataPart) {
    return `data:${part.mimeType}:${part.data.byteLength}`;
  }
  if (part instanceof vscode.LanguageModelToolCallPart) {
    return `tool-call:${part.name}`;
  }
  if (part instanceof vscode.LanguageModelToolResultPart || isToolResultPart(part)) {
    return 'tool-result';
  }
  if (isPromptTsxPart(part)) {
    return 'prompt-tsx';
  }
  return typeof part;
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
