import * as vscode from 'vscode';
import {
  buildAnthropicHeaders,
  buildAnthropicRequest,
  processAnthropicStream,
} from './anthropic';
import {
  buildGeminiGenerateContentUrl,
  buildGeminiHeaders,
  buildGeminiModelsUrl,
  buildGeminiRequest,
  processGeminiStream,
} from './gemini';
import {
  buildChatCompletionRequest,
  buildHeaders,
  processChatCompletionStream,
} from './openai';
import {
  buildOpenAIResponsesHeaders,
  buildOpenAIResponsesRequest,
  processOpenAIResponsesStream,
} from './openaiResponses';
import { inferModelDefaults } from './presets';
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
  reasoningEffort?: string;
  thinkingBudgetTokens?: number;
}

export interface DiscoverResult {
  baseUrl: string;
  models: DiscoveredModel[];
}

export interface ProviderTestResult {
  baseUrl: string;
  modelId: string;
  elapsedMs: number;
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
      processStream: (body, progress, token) => processAnthropicStream(body, progress, token, messages),
    };
  }

  if (model.apiType === 'openai-responses') {
    return {
      url: buildOpenAIResponsesUrl(model.baseUrl),
      headers: buildOpenAIResponsesHeaders(model, apiKey),
      body: buildOpenAIResponsesRequest(model, messages, options),
      processStream: (body, progress, token) => processOpenAIResponsesStream(body, progress, token, messages),
    };
  }

  if (model.apiType === 'gemini') {
    return {
      url: buildGeminiGenerateContentUrl(model.baseUrl, model.id, true),
      headers: buildGeminiHeaders(model, apiKey),
      body: buildGeminiRequest(model, messages, options),
      processStream: (body, progress, token) => processGeminiStream(body, progress, token, messages),
    };
  }

  const reasoningTracker = createReasoningTracker(model);
  return {
    url: buildOpenAIChatCompletionsUrl(model.baseUrl),
    headers: buildHeaders(model, apiKey),
    body: buildChatCompletionRequest(model, messages, options, reasoningTracker),
    processStream: (body, progress, token) => processChatCompletionStream(body, progress, token, reasoningTracker, messages),
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
  if (apiType === 'gemini') {
    return discoverGeminiModels(baseUrl, apiKey);
  }
  return discoverOpenAICompatibleModels(baseUrl, apiKey);
}

export async function testProviderModel(
  apiType: ApiType,
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<ProviderTestResult> {
  const startedAt = Date.now();
  const result = await testProviderModelByApiType(apiType, baseUrl, apiKey, modelId);
  return {
    ...result,
    modelId,
    elapsedMs: Date.now() - startedAt,
  };
}

async function testProviderModelByApiType(
  apiType: ApiType,
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<{ baseUrl: string }> {
  if (apiType === 'anthropic') {
    return testAnthropicModel(baseUrl, apiKey, modelId);
  }
  if (apiType === 'openai-responses') {
    return testOpenAIResponsesModel(baseUrl, apiKey, modelId);
  }
  if (apiType === 'gemini') {
    return testGeminiModel(baseUrl, apiKey, modelId);
  }
  return testOpenAICompatibleModel(baseUrl, apiKey, modelId);
}

export function buildOpenAIChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return hasVersionedOpenAIBasePath(normalized)
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

export function buildOpenAIResponsesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return hasVersionedOpenAIBasePath(normalized)
    ? `${normalized}/responses`
    : `${normalized}/v1/responses`;
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

async function discoverGeminiModels(baseUrl: string, apiKey: string): Promise<DiscoverResult> {
  const url = buildGeminiModelsUrl(baseUrl);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-goog-api-key': apiKey,
      Accept: 'application/json',
    },
  });
  const parsed = await readJsonResponse(response);
  const models = readGeminiModels(parsed.models);
  const normalizedBaseUrl = url.replace(/\/models(?:\?.*)?$/i, '');
  return { baseUrl: normalizedBaseUrl, models };
}

async function testOpenAICompatibleModel(baseUrl: string, apiKey: string, modelId: string): Promise<{ baseUrl: string }> {
  const candidates = buildOpenAIBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
      });
      await readSuccessResponse(response);
      return { baseUrl: candidate };
    } catch (error) {
      errors.push(formatDiscoverError(candidate, error));
    }
  }

  throw new Error(errors.join('；'));
}

async function testOpenAIResponsesModel(baseUrl: string, apiKey: string, modelId: string): Promise<{ baseUrl: string }> {
  const candidates = buildOpenAIBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          input: 'ping',
          max_output_tokens: 1,
          stream: false,
        }),
      });
      await readSuccessResponse(response);
      return { baseUrl: candidate };
    } catch (error) {
      errors.push(formatDiscoverError(candidate, error));
    }
  }

  throw new Error(errors.join('；'));
}

async function testGeminiModel(baseUrl: string, apiKey: string, modelId: string): Promise<{ baseUrl: string }> {
  const url = buildGeminiGenerateContentUrl(baseUrl, modelId, false);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: 'ping' }],
      }],
      generationConfig: {
        maxOutputTokens: 1,
      },
    }),
  });
  await readSuccessResponse(response);
  return { baseUrl: buildGeminiModelsUrl(baseUrl).replace(/\/models(?:\?.*)?$/i, '') };
}

async function testAnthropicModel(baseUrl: string, apiKey: string, modelId: string): Promise<{ baseUrl: string }> {
  const candidates = buildVersionedBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      await readSuccessResponse(response);
      return { baseUrl: candidate };
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
    const inferred = inferModelDefaults({
      id,
      apiType: 'openai',
      provider: inferFamilyFromModelId(id, typeof record.owned_by === 'string' ? record.owned_by : undefined),
    });

    const architecture = readRecord(record.architecture);
    const topProvider = readRecord(record.top_provider);
    const modalities = [
      ...readStringArray(architecture?.input_modalities),
      ...readStringArray(record.input_modalities),
      ...readStringArray(record.modalities),
    ];
    const supportedParameters = [
      ...readStringArray(record.supported_parameters),
      ...readStringArray(record.supportedParameters),
      ...readStringArray(record.parameters),
    ].map((value) => value.toLowerCase());
    const contextLength =
      readNumber(record.context_length) ??
      readNumber(record.contextWindow) ??
      readNumber(record.context_window) ??
      readNumber(record.input_token_limit) ??
      readNumber(record.max_context_length) ??
      readNumber(topProvider?.context_length) ??
      readProviderContextLength(record.providers) ??
      readNumber(record.contextLength) ??
      inferred.contextLength;
    const maxOutputTokens =
      readNumber(record.max_output_tokens) ??
      readNumber(record.max_completion_tokens) ??
      readNumber(record.output_token_limit) ??
      readNumber(record.max_tokens) ??
      readNumber(topProvider?.max_completion_tokens) ??
      readProviderMaxOutputTokens(record.providers) ??
      readNumber(record.maxOutputTokens) ??
      inferred.maxOutputTokens;
    const ownedBy = typeof record.owned_by === 'string' ? record.owned_by : undefined;

    return [{
      id,
      ownedBy,
      contextLength,
      maxOutputTokens,
      vision: modalities.includes('image') || modalities.includes('vision')
        ? true
        : readBoolean(record.vision) ?? inferred.vision,
      toolCalling: supportedParameters.length > 0
        ? supportedParameters.some((parameter) => parameter === 'tools' || parameter === 'tool_choice' || parameter === 'function_call')
        : readBoolean(record.toolCalling) ?? inferred.toolCalling ?? true,
      family: typeof record.family === 'string' ? record.family : inferred.family ?? inferFamilyFromModelId(id, ownedBy),
      reasoningEffort: supportedParameters.includes('reasoning_effort') ? 'medium' : inferred.reasoningEffort,
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
    const inferred = id
      ? inferModelDefaults({ id, apiType: 'anthropic', provider: 'anthropic' })
      : {};
    const contextLength =
      readNumber(record.context_window) ??
      readNumber(record.contextWindow) ??
      readNumber(record.contextLength) ??
      inferred.contextLength ??
      200000;
    const maxOutputTokens =
      readNumber(record.max_output_tokens) ??
      readNumber(record.maxOutputTokens) ??
      inferred.maxOutputTokens ??
      32000;
    return id ? [{
      id,
      ownedBy: 'anthropic',
      contextLength,
      maxOutputTokens,
      vision: inferred.vision ?? true,
      toolCalling: inferred.toolCalling ?? true,
      family: inferred.family ?? 'claude',
      thinkingBudgetTokens: inferred.thinkingBudgetTokens,
    }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function readGeminiModels(value: unknown): DiscoveredModel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): DiscoveredModel[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const rawName = typeof record.name === 'string' ? record.name : '';
    const id = rawName.startsWith('models/') ? rawName.slice('models/'.length) : rawName;
    if (!id) {
      return [];
    }
    const methods = readStringArray(record.supportedGenerationMethods);
    if (methods.length > 0 && !methods.includes('generatecontent')) {
      return [];
    }

    return [{
      id,
      ownedBy: 'google',
      contextLength: readNumber(record.inputTokenLimit) ?? readNumber(record.input_token_limit) ?? 400000,
      maxOutputTokens: readNumber(record.outputTokenLimit) ?? readNumber(record.output_token_limit) ?? 65536,
      vision: true,
      toolCalling: true,
      family: 'gemini',
      reasoningEffort: id.includes('pro') || id.includes('flash') ? 'medium' : undefined,
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[${response.status}] ${response.statusText}${text ? ` ${text.slice(0, 300)}` : ''}`);
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    const contentType = response.headers.get('content-type') ?? '';
    const hint = text.trimStart().startsWith('<')
      ? '返回的是 HTML，不是 JSON 模型接口'
      : '返回内容不是 JSON';
    throw new Error(`${hint}${contentType ? ` (${contentType})` : ''}`);
  }
}

async function readSuccessResponse(response: Response): Promise<void> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[${response.status}] ${response.statusText}${text ? ` ${text.slice(0, 300)}` : ''}`);
  }

  if (text.trimStart().startsWith('<')) {
    const contentType = response.headers.get('content-type') ?? '';
    throw new Error(`返回的是 HTML，不是 JSON 模型接口${contentType ? ` (${contentType})` : ''}`);
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
    const record = item as Record<string, unknown>;
    const contextLength = readNumber(record.context_length) ?? readNumber(record.contextLength);
    if (contextLength) {
      return contextLength;
    }
  }

  return undefined;
}

function readProviderMaxOutputTokens(value: unknown): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const maxOutputTokens = readNumber(record.max_completion_tokens) ?? readNumber(record.max_output_tokens);
    if (maxOutputTokens) {
      return maxOutputTokens;
    }
  }

  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase())
    : [];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function inferFamilyFromModelId(id: string, ownedBy: string | undefined): string | undefined {
  const normalized = id.toLowerCase();
  const owner = ownedBy?.toLowerCase() ?? '';
  if (normalized.startsWith('claude-') || owner.includes('anthropic')) {
    return 'claude';
  }
  if (normalized.startsWith('deepseek-') || owner.includes('deepseek')) {
    return 'deepseek';
  }
  if (normalized.startsWith('gemini-') || owner.includes('google')) {
    return 'gemini';
  }
  if (normalized.startsWith('kimi-') || normalized.startsWith('moonshot-') || owner.includes('moonshot') || owner.includes('kimi')) {
    return 'kimi';
  }
  if (normalized.startsWith('minimax-') || owner.includes('minimax')) {
    return 'minimax';
  }
  if (normalized.startsWith('grok-') || owner.includes('xai')) {
    return 'grok';
  }
  if (normalized.startsWith('glm-') || owner.includes('zai')) {
    return 'glm';
  }
  if (normalized.startsWith('gpt-') || /^o[134]/.test(normalized)) {
    return normalized.includes('codex') ? 'gpt-codex' : 'gpt';
  }
  return undefined;
}

function formatDiscoverError(baseUrl: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${baseUrl}: ${message}`;
}
