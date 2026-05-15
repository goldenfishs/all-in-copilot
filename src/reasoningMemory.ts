import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { ResolvedModelConfig } from './types';

const MAX_REASONING_ENTRIES = 200;
const reasoningCache = new Map<string, string>();

export interface ReasoningCapture {
  reasoningContent?: string;
  visibleSignature: string;
}

export class ReasoningTracker {
  private prefixHash = '';

  constructor(private readonly model: ResolvedModelConfig) {}

  consume(message: vscode.LanguageModelChatRequestMessage): string | undefined {
    const signature = signatureForMessage(message);
    const reasoning = shouldPreserveReasoningContent(this.model) && message.role === vscode.LanguageModelChatMessageRole.Assistant
      ? reasoningCache.get(makeKey(this.model, this.prefixHash, signature))
      : undefined;

    this.prefixHash = hashText(`${this.prefixHash}\u0000${signature}`);
    return reasoning;
  }

  remember(capture: ReasoningCapture): void {
    if (!shouldPreserveReasoningContent(this.model)) {
      return;
    }

    const reasoningContent = capture.reasoningContent?.trim();
    if (!reasoningContent) {
      return;
    }

    reasoningCache.set(makeKey(this.model, this.prefixHash, capture.visibleSignature), reasoningContent);
    pruneCache();
  }
}

export function createReasoningTracker(model: ResolvedModelConfig): ReasoningTracker {
  return new ReasoningTracker(model);
}

export function shouldPreserveReasoningContent(model: ResolvedModelConfig): boolean {
  const provider = model.provider.toLowerCase();
  const id = model.id.toLowerCase();
  return provider.includes('deepseek') && id.startsWith('deepseek-v4');
}

export function serializeVisibleText(value: string): string {
  return `text:${value}`;
}

export function serializeVisibleToolCall(id: string, name: string, input: unknown): string {
  return `tool:${id}:${name}:${stableJson(input)}`;
}

export function signatureForMessage(message: vscode.LanguageModelChatRequestMessage): string {
  const parts: string[] = [
    `role:${roleName(message.role)}`,
    `name:${message.name ?? ''}`,
  ];

  for (const part of message.content ?? []) {
    if (part instanceof vscode.LanguageModelTextPart) {
      parts.push(serializeVisibleText(part.value));
      continue;
    }

    if (part instanceof vscode.LanguageModelDataPart) {
      if (part.mimeType.startsWith('image/')) {
        parts.push(`image:${part.mimeType}:${hashBytes(part.data)}`);
      } else {
        parts.push(`data:${part.mimeType}:${part.data.byteLength}:${hashBytes(part.data)}`);
      }
      continue;
    }

    if (part instanceof vscode.LanguageModelToolCallPart) {
      parts.push(serializeVisibleToolCall(part.callId, part.name, part.input));
      continue;
    }

    if (isToolResultPart(part)) {
      parts.push(`tool_result:${part.callId}:${collectToolResultText(part.content)}`);
      continue;
    }

    if (typeof part === 'string') {
      parts.push(serializeVisibleText(part));
      continue;
    }

    parts.push(`unknown:${stableJson(part)}`);
  }

  return parts.join('\u0001');
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

    try {
      return JSON.stringify(part);
    } catch {
      return '';
    }
  }).join('');
}

function makeKey(model: ResolvedModelConfig, prefixHash: string, visibleSignature: string): string {
  return `${model.registeredId}:${prefixHash}:${hashText(visibleSignature)}`;
}

function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function hashBytes(value: Uint8Array): string {
  return crypto.createHash('sha256').update(Buffer.from(value)).digest('base64url');
}

function stableJson(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(sortValue(value));
  } catch {
    return String(value);
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sortValue(record[key]);
      return accumulator;
    }, {});
}

function pruneCache(): void {
  while (reasoningCache.size > MAX_REASONING_ENTRIES) {
    const oldest = reasoningCache.keys().next().value as string | undefined;
    if (!oldest) {
      return;
    }
    reasoningCache.delete(oldest);
  }
}
