import type { ApiType, ModelConfig } from './types';

export interface ProviderPresetModel {
  id: string;
  displayName?: string;
  family?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  vision?: boolean;
  toolCalling?: boolean;
  reasoningEffort?: string;
  thinkingBudgetTokens?: number;
}

export interface ProviderPreset {
  id: string;
  label: string;
  provider: string;
  apiType: ApiType;
  baseUrl: string;
  custom: boolean;
  fallbackModels: ProviderPresetModel[];
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI 官方',
    provider: 'openai',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    custom: false,
    fallbackModels: [
      { id: 'gpt-5.5', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.4', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.4-mini', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.3-codex', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.3-codex-spark', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'low' },
      { id: 'gpt-5.2', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.2-codex', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.1', family: 'gpt-5', contextLength: 400000, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-4.1', family: 'gpt-4', contextLength: 1048576, maxOutputTokens: 32768, vision: true, toolCalling: true },
      { id: 'gpt-4o', family: 'gpt-4o', contextLength: 128000, maxOutputTokens: 16384, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'anthropic',
    label: 'Claude / Anthropic 官方',
    provider: 'anthropic',
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    custom: false,
    fallbackModels: [
      { id: 'claude-opus-4-1-20250805', family: 'claude', contextLength: 200000, maxOutputTokens: 32000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-opus-4-20250514', family: 'claude', contextLength: 200000, maxOutputTokens: 32000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-sonnet-4-20250514', family: 'claude', contextLength: 200000, maxOutputTokens: 64000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-3-7-sonnet-20250219', family: 'claude', contextLength: 200000, maxOutputTokens: 64000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-3-5-haiku-20241022', family: 'claude', contextLength: 200000, maxOutputTokens: 8192, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'xai',
    label: 'xAI 官方',
    provider: 'xai',
    apiType: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    custom: false,
    fallbackModels: [
      { id: 'grok-4.20-reasoning', family: 'grok', contextLength: 256000, maxOutputTokens: 32768, vision: false, toolCalling: true },
      { id: 'grok-4.3', family: 'grok', contextLength: 256000, maxOutputTokens: 32768, vision: true, toolCalling: true },
      { id: 'grok-code-fast-1', family: 'grok', contextLength: 256000, maxOutputTokens: 32768, vision: false, toolCalling: true },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 官方',
    provider: 'deepseek',
    apiType: 'openai',
    baseUrl: 'https://api.deepseek.com',
    custom: false,
    fallbackModels: [
      { id: 'deepseek-v4-flash', family: 'deepseek', contextLength: 1048576, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'deepseek-v4-pro', family: 'deepseek', contextLength: 1048576, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'deepseek-chat', family: 'deepseek', contextLength: 64000, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'deepseek-reasoner', family: 'deepseek', contextLength: 64000, maxOutputTokens: 8192, vision: false, toolCalling: true },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini 官方',
    provider: 'gemini',
    apiType: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    custom: false,
    fallbackModels: [
      { id: 'gemini-3-pro-preview', family: 'gemini', contextLength: 1048576, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-3-flash-preview', family: 'gemini', contextLength: 1048576, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-2.5-pro', family: 'gemini', contextLength: 1048576, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-2.5-flash', family: 'gemini', contextLength: 1048576, maxOutputTokens: 65536, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'zai',
    label: 'GLM / Z.AI 官方',
    provider: 'zai',
    apiType: 'openai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    custom: false,
    fallbackModels: [
      { id: 'glm-5.1', family: 'glm', contextLength: 128000, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'glm-4.7', family: 'glm', contextLength: 128000, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'glm-4.6', family: 'glm', contextLength: 128000, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'glm-4.6v', family: 'glm', contextLength: 128000, maxOutputTokens: 8192, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'custom-openai',
    label: '通用 OpenAI Compatible',
    provider: 'custom',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    custom: true,
    fallbackModels: [],
  },
  {
    id: 'custom-anthropic',
    label: '通用 Anthropic Messages',
    provider: 'custom-anthropic',
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    custom: true,
    fallbackModels: [],
  },
] as const;

export function getProviderPreset(id: string | undefined): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

export function getPresetForProvider(provider: string | undefined, apiType: ApiType | undefined): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) =>
    !preset.custom &&
    preset.provider === provider &&
    preset.apiType === apiType
  );
}

export function presetModelToConfig(
  preset: ProviderPreset,
  model: ProviderPresetModel,
  baseUrl = preset.baseUrl,
): ModelConfig {
  return {
    id: model.id,
    apiType: preset.apiType,
    displayName: model.displayName ?? model.id,
    provider: preset.provider,
    baseUrl,
    family: model.family,
    contextLength: model.contextLength,
    maxOutputTokens: model.maxOutputTokens,
    vision: model.vision,
    toolCalling: model.toolCalling,
    reasoningEffort: model.reasoningEffort,
    thinkingBudgetTokens: model.thinkingBudgetTokens,
  };
}

export function applyModelDefaults(model: ModelConfig): ModelConfig {
  const defaults = inferModelDefaults(model);
  return {
    ...defaults,
    ...model,
    family: model.family ?? defaults.family,
    contextLength: model.contextLength ?? defaults.contextLength,
    maxOutputTokens: model.maxOutputTokens ?? defaults.maxOutputTokens,
    vision: model.vision ?? defaults.vision,
    toolCalling: model.toolCalling ?? defaults.toolCalling,
    reasoningEffort: model.reasoningEffort ?? defaults.reasoningEffort,
    thinkingBudgetTokens: model.thinkingBudgetTokens ?? defaults.thinkingBudgetTokens,
  };
}

export function inferModelDefaults(model: Pick<ModelConfig, 'id' | 'apiType' | 'provider'>): Partial<ModelConfig> {
  const id = model.id.toLowerCase();
  const provider = (model.provider ?? '').toLowerCase();

  const presetMatch = findPresetModel(id, provider, model.apiType);
  if (presetMatch) {
    return { ...presetMatch };
  }

  if (model.apiType === 'anthropic' || provider.includes('anthropic') || id.startsWith('claude-')) {
    return inferClaudeDefaults(id);
  }

  if (provider.includes('deepseek') || id.startsWith('deepseek-')) {
    return inferDeepSeekDefaults(id);
  }

  if (provider.includes('gemini') || id.startsWith('gemini-')) {
    return inferGeminiDefaults(id);
  }

  if (provider === 'openai' || id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    return inferOpenAIDefaults(id);
  }

  if (provider.includes('xai') || provider.includes('grok') || id.startsWith('grok-')) {
    return {
      family: 'grok',
      contextLength: 256000,
      maxOutputTokens: 32768,
      vision: !id.includes('code-fast') && !id.includes('reasoning'),
      toolCalling: true,
      reasoningEffort: id.includes('reasoning') ? 'medium' : undefined,
    };
  }

  if (provider.includes('zai') || provider.includes('glm') || id.startsWith('glm-')) {
    return {
      family: 'glm',
      contextLength: 128000,
      maxOutputTokens: 8192,
      vision: id.includes('v'),
      toolCalling: true,
    };
  }

  return {
    contextLength: 128000,
    maxOutputTokens: 4096,
    toolCalling: true,
  };
}

function findPresetModel(
  normalizedId: string,
  normalizedProvider: string,
  apiType: ApiType | undefined,
): ProviderPresetModel | undefined {
  for (const preset of PROVIDER_PRESETS) {
    if (preset.custom) {
      continue;
    }
    if (apiType && preset.apiType !== apiType) {
      continue;
    }
    if (normalizedProvider && preset.provider !== normalizedProvider) {
      continue;
    }
    const model = preset.fallbackModels.find((entry) => entry.id.toLowerCase() === normalizedId);
    if (model) {
      return model;
    }
  }
  return undefined;
}

function inferOpenAIDefaults(id: string): Partial<ModelConfig> {
  if (id.startsWith('gpt-5') || /^o[134]/.test(id)) {
    return {
      family: id.includes('codex') ? 'gpt-5-codex' : 'gpt-5',
      contextLength: 400000,
      maxOutputTokens: 128000,
      vision: true,
      toolCalling: true,
      reasoningEffort: 'medium',
    };
  }

  if (id.startsWith('gpt-4.1')) {
    return {
      family: 'gpt-4',
      contextLength: 1048576,
      maxOutputTokens: 32768,
      vision: true,
      toolCalling: true,
    };
  }

  return {
    family: id.startsWith('gpt-4o') ? 'gpt-4o' : 'gpt-4',
    contextLength: 128000,
    maxOutputTokens: 16384,
    vision: true,
    toolCalling: true,
  };
}

function inferClaudeDefaults(id: string): Partial<ModelConfig> {
  const supportsThinking = id.includes('opus-4') || id.includes('sonnet-4') || id.includes('3-7-sonnet');
  return {
    family: 'claude',
    contextLength: 200000,
    maxOutputTokens: id.includes('haiku') ? 8192 : id.includes('sonnet') ? 64000 : 32000,
    vision: true,
    toolCalling: true,
    thinkingBudgetTokens: supportsThinking ? 8192 : undefined,
  };
}

function inferDeepSeekDefaults(id: string): Partial<ModelConfig> {
  const v4 = id.includes('v4');
  return {
    family: 'deepseek',
    contextLength: v4 ? 1048576 : 64000,
    maxOutputTokens: 8192,
    vision: false,
    toolCalling: true,
  };
}

function inferGeminiDefaults(id: string): Partial<ModelConfig> {
  return {
    family: 'gemini',
    contextLength: 1048576,
    maxOutputTokens: 65536,
    vision: true,
    toolCalling: true,
    reasoningEffort: id.includes('pro') || id.includes('flash') ? 'medium' : undefined,
  };
}
