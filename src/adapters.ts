import * as vscode from 'vscode';
import {
  buildAnthropicHeaders,
  buildAnthropicRequest,
  processAnthropicStream,
} from './anthropic';
import {
  buildChatCompletionRequest,
  buildHeaders,
  processChatCompletionStream,
} from './openai';
import { createReasoningTracker } from './reasoningMemory';
import type { ApiType, ResolvedModelConfig } from './types';

export interface DiscoveredModel {
  id: string;
  contextLength?: number;
  maxOutputTokens?: number;
  vision?: boolean;
  toolCalling?: boolean;
  family?: string;
  ownedBy?: string;
}

export interface DiscoverResult {
  baseUrl: string;
  models: DiscoveredModel[];
}

export interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  processStream: (
    body: ReadableStream<Uint8Array>,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ) => Promise<void>;
}

export function prepareProviderRequest(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  apiKey: string,
): PreparedRequest {
  if (model.apiType === 'anthropic') {
    return {
      url: buildAnthropicMessagesUrl(model.baseUrl),
      headers: buildAnthropicHeaders(model, apiKey),
      body: buildAnthropicRequest(model, messages, options),
      processStream: processAnthropicStream,
    };
  }

  const reasoningTracker = createReasoningTracker(model);
  return {
    url: buildOpenAIChatCompletionsUrl(model.baseUrl),
    headers: buildHeaders(model, apiKey),
    body: buildChatCompletionRequest(model, messages, options, reasoningTracker),
    processStream: (body, progress, token) => processChatCompletionStream(body, progress, token, reasoningTracker),
  };
}

export async function discoverProviderModels(
  apiType: ApiType,
  baseUrl: string,
  apiKey: string,
): Promise<DiscoverResult> {
  if (apiType === 'anthropic') {
    return discoverAnthropicModels(baseUrl, apiKey);
  }
  return discoverOpenAICompatibleModels(baseUrl, apiKey);
}

export function buildOpenAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return hasVersionedOpenAIBasePath(normalized)
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

export function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

async function discoverOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<DiscoverResult> {
  const candidates = buildOpenAIBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const models = await fetchOpenAICompatibleModels(`${candidate}/models`, apiKey);
      return { baseUrl: candidate, models };
    } catch (error) {
      errors.push(formatDiscoverError(candidate, error));
    }
  }

  throw new Error(errors.join('；'));
}

async function discoverAnthropicModels(baseUrl: string, apiKey: string): Promise<DiscoverResult> {
  const candidates = buildVersionedBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const models = await fetchAnthropicModels(`${candidate}/models`, apiKey);
      return { baseUrl: candidate, models };
    } catch (error) {
      errors.push(formatDiscoverError(candidate, error));
    }
  }

  throw new Error(errors.join('；'));
}

function buildOpenAIBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];
  if (!hasVersionedOpenAIBasePath(normalized)) {
    candidates.push(`${normalized}/v1`);
  }
  return Array.from(new Set(candidates));
}

function hasVersionedOpenAIBasePath(baseUrl: string): boolean {
  return /\/v\d+[a-z0-9_-]*(?:\/openai)?$/i.test(baseUrl);
}

function buildVersionedBaseUrlCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];
  if (!/\/v\d+$/i.test(normalized)) {
    candidates.push(`${normalized}/v1`);
  }
  return Array.from(new Set(candidates));
}

async function fetchOpenAICompatibleModels(url: string, apiKey: string): Promise<DiscoveredModel[]> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const parsed = await readJsonResponse(response);
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  return data.flatMap((item): DiscoveredModel[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    if (!id) {
      return [];
    }

    const architecture = record.architecture as Record<string, unknown> | undefined;
    const modalities = Array.isArray(architecture?.input_modalities)
      ? architecture.input_modalities
      : [];
    const contextLength =
      readNumber(record.context_length) ??
      readProviderContextLength(record.providers) ??
      readNumber(record.contextLength);

    return [{
      id,
      ownedBy: typeof record.owned_by === 'string' ? record.owned_by : undefined,
      contextLength,
      vision: modalities.includes('image') || Boolean(record.vision),
      toolCalling: true,
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchAnthropicModels(url: string, apiKey: string): Promise<DiscoveredModel[]> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Accept: 'application/json',
    },
  });

  const parsed = await readJsonResponse(response);
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  return data.flatMap((item): DiscoveredModel[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    return id ? [{
      id,
      ownedBy: 'anthropic',
      contextLength: 200000,
      maxOutputTokens: 32000,
      vision: true,
      toolCalling: true,
      family: 'claude',
    }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

async function readJsonResponse(response: Response): Promise<{ data?: unknown }> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[${response.status}] ${response.statusText}${text ? ` ${text.slice(0, 300)}` : ''}`);
  }

  try {
    return JSON.parse(text) as { data?: unknown };
  } catch {
    const contentType = response.headers.get('content-type') ?? '';
    const hint = text.trimStart().startsWith('<')
      ? '返回的是 HTML，不是 JSON 模型接口'
      : '返回内容不是 JSON';
    throw new Error(`${hint}${contentType ? ` (${contentType})` : ''}`);
  }
}

function readProviderContextLength(value: unknown): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const contextLength = readNumber((item as Record<string, unknown>).context_length);
    if (contextLength) {
      return contextLength;
    }
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatDiscoverError(baseUrl: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${baseUrl}: ${message}`;
}
