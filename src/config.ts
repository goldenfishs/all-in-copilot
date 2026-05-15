import * as vscode from 'vscode';
import { applyModelDefaults } from './presets';
import { resolveProviderName } from './providerNames';
import type { ApiType, ModelConfig, ResolvedModelConfig } from './types';

const CONFIG_SECTION = 'all-in-copilot';
export const MODELS_CONFIG_KEY = 'models';
const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_FAMILY = 'all-in-copilot';
const DEFAULT_PROVIDER = 'default';

export function getDebugLoggingEnabled(): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('debug', false);
}

export function getFallbackBaseUrl(): string {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>('baseUrl', 'https://api.openai.com/v1')
    .trim();
}

export function getFallbackMaxOutputTokens(): number {
  return vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>('maxOutputTokens', DEFAULT_MAX_OUTPUT_TOKENS);
}

export function getResolvedModels(): ResolvedModelConfig[] {
  return getRawModelConfigs()
    .map((model) => resolveModel(model, getFallbackBaseUrl(), getFallbackMaxOutputTokens()))
    .filter((model): model is ResolvedModelConfig => model !== undefined);
}

export function getRawModelConfigs(): ModelConfig[] {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const rawModels = config.get<unknown>(MODELS_CONFIG_KEY, []);
  return normalizeModels(rawModels);
}

export async function updateRawModelConfigs(models: readonly ModelConfig[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update(MODELS_CONFIG_KEY, models.map(cleanModelConfig), vscode.ConfigurationTarget.Global);
}

export function getModelByRegisteredId(registeredId: string): ResolvedModelConfig | undefined {
  return getResolvedModels().find((model) =>
    model.registeredId === registeredId ||
    legacyRegisteredId(model) === registeredId
  );
}

export function getProviderKeys(): string[] {
  return Array.from(new Set(getResolvedModels().map((model) => model.provider))).sort();
}

function normalizeModels(value: unknown): ModelConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): ModelConfig[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = getString(record.id);
    if (!id) {
      return [];
    }

    return [{
      id,
      apiType: getApiType(record.apiType) ?? getApiType(record.apiMode),
      configId: getString(record.configId),
      displayName: getString(record.displayName),
      provider: getString(record.provider) || getString(record.owned_by) || getString(record.ownedBy),
      baseUrl: getString(record.baseUrl),
      family: getString(record.family),
      contextLength: getNumber(record.contextLength) ?? getNumber(record.context_length),
      maxOutputTokens:
        getNumber(record.maxOutputTokens) ??
        getNumber(record.max_tokens) ??
        getNumber(record.max_completion_tokens),
      vision: getBoolean(record.vision),
      toolCalling: getBoolean(record.toolCalling),
      temperature: getNullableNumber(record.temperature),
      topP: getNullableNumber(record.topP) ?? getNullableNumber(record.top_p),
      reasoningEffort: getString(record.reasoningEffort) || getString(record.reasoning_effort),
      thinkingBudgetTokens: getNumber(record.thinkingBudgetTokens) ?? getNumber(record.thinking_budget_tokens),
      headers: getStringRecord(record.headers),
      extra: getObjectRecord(record.extra),
    }];
  });
}

function cleanModelConfig(model: ModelConfig): ModelConfig {
  const cleaned: ModelConfig = {
    id: model.id.trim(),
  };

  if (model.apiType && model.apiType !== 'openai') {
    cleaned.apiType = model.apiType;
  }

  setString(cleaned, 'configId', model.configId);
  setString(cleaned, 'displayName', model.displayName);
  setString(cleaned, 'provider', model.provider);
  setString(cleaned, 'baseUrl', model.baseUrl);
  setString(cleaned, 'family', model.family);
  setNumber(cleaned, 'contextLength', model.contextLength);
  setNumber(cleaned, 'maxOutputTokens', model.maxOutputTokens);
  setBoolean(cleaned, 'vision', model.vision);
  setBoolean(cleaned, 'toolCalling', model.toolCalling);
  setNullableNumber(cleaned, 'temperature', model.temperature);
  setNullableNumber(cleaned, 'topP', model.topP);
  setString(cleaned, 'reasoningEffort', normalizeReasoningEffort(model.reasoningEffort));
  setNumber(cleaned, 'thinkingBudgetTokens', model.thinkingBudgetTokens);

  if (model.headers && Object.keys(model.headers).length > 0) {
    cleaned.headers = model.headers;
  }

  if (model.extra && Object.keys(model.extra).length > 0) {
    cleaned.extra = model.extra;
  }

  return cleaned;
}

function resolveModel(
  model: ModelConfig,
  fallbackBaseUrl: string,
  fallbackMaxOutputTokens: number,
): ResolvedModelConfig | undefined {
  const baseUrl = (model.baseUrl || fallbackBaseUrl).trim();
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return undefined;
  }

  const provider = resolveProviderName(model.provider, baseUrl) || DEFAULT_PROVIDER;
  const withProvider = { ...model, provider, apiType: model.apiType ?? 'openai' };
  const withDefaults = applyModelDefaults(withProvider);
  const maxOutputTokens = withDefaults.maxOutputTokens ?? fallbackMaxOutputTokens;
  const contextLength = Math.max(withDefaults.contextLength ?? DEFAULT_CONTEXT_LENGTH, maxOutputTokens + 1);

  return {
    ...withDefaults,
    apiType: model.apiType ?? 'openai',
    provider,
    baseUrl,
    registeredId: buildRegisteredId(model.apiType ?? 'openai', provider, model.id, model.configId),
    displayName: model.displayName || (model.configId ? `${model.id} (${model.configId})` : model.id),
    family: withDefaults.family || DEFAULT_FAMILY,
    contextLength,
    maxOutputTokens,
    vision: withDefaults.vision ?? false,
    toolCalling: withDefaults.toolCalling ?? true,
  };
}

function buildRegisteredId(
  apiType: ApiType,
  provider: string,
  id: string,
  configId: string | undefined,
): string {
  const suffix = configId ? `::${configId}` : '';
  return `${apiType}:${provider}:${id}${suffix}`;
}

function legacyRegisteredId(model: ResolvedModelConfig): string {
  return model.configId ? `${model.id}::${model.configId}` : model.id;
}

function getApiType(value: unknown): ApiType | undefined {
  if (value === 'anthropic') {
    return 'anthropic';
  }
  if (value === 'openai' || value === 'openai-compatible') {
    return 'openai';
  }
  return undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return getNumber(value);
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function getObjectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeReasoningEffort(value: string | undefined): string | undefined {
  if (value === 'max') {
    return 'xhigh';
  }
  return value;
}

function setString<T extends keyof ModelConfig>(target: ModelConfig, key: T, value: ModelConfig[T]): void {
  if (typeof value === 'string' && value.trim()) {
    target[key] = value.trim() as ModelConfig[T];
  }
}

function setNumber<T extends keyof ModelConfig>(target: ModelConfig, key: T, value: ModelConfig[T]): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value as ModelConfig[T];
  }
}

function setNullableNumber<T extends keyof ModelConfig>(target: ModelConfig, key: T, value: ModelConfig[T]): void {
  if (value === null || (typeof value === 'number' && Number.isFinite(value))) {
    target[key] = value as ModelConfig[T];
  }
}

function setBoolean<T extends keyof ModelConfig>(target: ModelConfig, key: T, value: ModelConfig[T]): void {
  if (typeof value === 'boolean') {
    target[key] = value as ModelConfig[T];
  }
}
