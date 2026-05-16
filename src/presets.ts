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

const OPENAI_1M_CONTEXT = 400000;
const OPENAI_GPT41_CONTEXT = 192000;
const OPENAI_400K_CONTEXT = 192000;
const O_SERIES_CONTEXT = 160000;
const O_SERIES_OUTPUT = 100000;
const CLAUDE_1M_CONTEXT = 400000;
const CLAUDE_200K_CONTEXT = 160000;
const XAI_GROK_2M_CONTEXT = 400000;
const XAI_GROK_1M_CONTEXT = 400000;
const XAI_GROK_CODE_CONTEXT = 192000;
const DEEPSEEK_1M_CONTEXT = 400000;
const DEEPSEEK_SAFE_OUTPUT = 192000;
const GEMINI_1M_CONTEXT = 400000;
const KIMI_256K_CONTEXT = 192000;
const KIMI_128K_CONTEXT = 128000;
const MINIMAX_200K_CONTEXT = 160000;
const GLM_200K_CONTEXT = 160000;
const GLM_128K_CONTEXT = 128000;
const GLM_SAFE_OUTPUT = 65536;

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    custom: false,
    fallbackModels: [
      { id: 'gpt-5.5-pro', family: 'gpt-5', contextLength: OPENAI_1M_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.5', family: 'gpt-5', contextLength: OPENAI_1M_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.4', family: 'gpt-5', contextLength: OPENAI_1M_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.4-mini', family: 'gpt-5', contextLength: OPENAI_400K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.3-codex', family: 'gpt-5', contextLength: OPENAI_400K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.3-codex-spark', family: 'gpt-5', contextLength: OPENAI_400K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'low' },
      { id: 'gpt-5.2', family: 'gpt-5', contextLength: OPENAI_400K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.2-codex', family: 'gpt-5', contextLength: OPENAI_400K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-5.1', family: 'gpt-5', contextLength: OPENAI_400K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gpt-4.1', family: 'gpt-4', contextLength: OPENAI_GPT41_CONTEXT, maxOutputTokens: 32768, vision: true, toolCalling: true },
      { id: 'gpt-4o', family: 'gpt-4o', contextLength: 128000, maxOutputTokens: 16384, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'anthropic',
    label: 'Claude / Anthropic',
    provider: 'anthropic',
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    custom: false,
    fallbackModels: [
      { id: 'claude-opus-4-7', family: 'claude', contextLength: CLAUDE_1M_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-sonnet-4-6', family: 'claude', contextLength: CLAUDE_1M_CONTEXT, maxOutputTokens: 64000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-haiku-4-5', family: 'claude', contextLength: CLAUDE_200K_CONTEXT, maxOutputTokens: 64000, vision: true, toolCalling: true },
      { id: 'claude-opus-4-1-20250805', family: 'claude', contextLength: CLAUDE_200K_CONTEXT, maxOutputTokens: 32000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-opus-4-20250514', family: 'claude', contextLength: CLAUDE_200K_CONTEXT, maxOutputTokens: 32000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-sonnet-4-20250514', family: 'claude', contextLength: CLAUDE_200K_CONTEXT, maxOutputTokens: 64000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-3-7-sonnet-20250219', family: 'claude', contextLength: CLAUDE_200K_CONTEXT, maxOutputTokens: 64000, vision: true, toolCalling: true, thinkingBudgetTokens: 8192 },
      { id: 'claude-3-5-haiku-20241022', family: 'claude', contextLength: CLAUDE_200K_CONTEXT, maxOutputTokens: 8192, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'xai',
    label: 'xAI',
    provider: 'xai',
    apiType: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    custom: false,
    fallbackModels: [
      { id: 'grok-4.20-reasoning', family: 'grok', contextLength: XAI_GROK_2M_CONTEXT, maxOutputTokens: 131072, vision: false, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'grok-4.3', family: 'grok', contextLength: XAI_GROK_1M_CONTEXT, maxOutputTokens: 131072, vision: true, toolCalling: true },
      { id: 'grok-code-fast-1', family: 'grok', contextLength: XAI_GROK_CODE_CONTEXT, maxOutputTokens: 32768, vision: false, toolCalling: true },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'deepseek',
    apiType: 'openai',
    baseUrl: 'https://api.deepseek.com',
    custom: false,
    fallbackModels: [
      { id: 'deepseek-v4-flash', family: 'deepseek', contextLength: DEEPSEEK_1M_CONTEXT, maxOutputTokens: DEEPSEEK_SAFE_OUTPUT, vision: false, toolCalling: true, reasoningEffort: 'high' },
      { id: 'deepseek-v4-pro', family: 'deepseek', contextLength: DEEPSEEK_1M_CONTEXT, maxOutputTokens: DEEPSEEK_SAFE_OUTPUT, vision: false, toolCalling: true, reasoningEffort: 'high' },
      { id: 'deepseek-chat', family: 'deepseek', contextLength: 64000, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'deepseek-reasoner', family: 'deepseek', contextLength: 64000, maxOutputTokens: 8192, vision: false, toolCalling: false },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    provider: 'gemini',
    apiType: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    custom: false,
    fallbackModels: [
      { id: 'gemini-3.1-pro-preview', family: 'gemini', contextLength: GEMINI_1M_CONTEXT, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-3-pro-preview', family: 'gemini', contextLength: GEMINI_1M_CONTEXT, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-3-flash-preview', family: 'gemini', contextLength: GEMINI_1M_CONTEXT, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-2.5-pro', family: 'gemini', contextLength: GEMINI_1M_CONTEXT, maxOutputTokens: 65536, vision: true, toolCalling: true, reasoningEffort: 'medium' },
      { id: 'gemini-2.5-flash', family: 'gemini', contextLength: GEMINI_1M_CONTEXT, maxOutputTokens: 65536, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'kimi',
    label: 'Kimi / Moonshot',
    provider: 'kimi',
    apiType: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    custom: false,
    fallbackModels: [
      { id: 'kimi-k2.6', family: 'kimi', contextLength: KIMI_256K_CONTEXT, maxOutputTokens: 32768, vision: true, toolCalling: true },
      { id: 'kimi-k2.5', family: 'kimi', contextLength: KIMI_256K_CONTEXT, maxOutputTokens: 32768, vision: true, toolCalling: true },
      { id: 'kimi-k2-thinking', family: 'kimi', contextLength: KIMI_256K_CONTEXT, maxOutputTokens: 32768, vision: false, toolCalling: true },
      { id: 'kimi-k2-thinking-turbo', family: 'kimi', contextLength: KIMI_256K_CONTEXT, maxOutputTokens: 32768, vision: false, toolCalling: true },
      { id: 'kimi-k2-0905-preview', family: 'kimi', contextLength: KIMI_256K_CONTEXT, maxOutputTokens: 32768, vision: false, toolCalling: true },
      { id: 'kimi-k2-turbo-preview', family: 'kimi', contextLength: KIMI_256K_CONTEXT, maxOutputTokens: 32768, vision: false, toolCalling: true },
      { id: 'kimi-k2-0711-preview', family: 'kimi', contextLength: KIMI_128K_CONTEXT, maxOutputTokens: 32768, vision: false, toolCalling: true },
      { id: 'moonshot-v1-128k', family: 'kimi', contextLength: KIMI_128K_CONTEXT, maxOutputTokens: 8192, vision: false, toolCalling: true },
      { id: 'moonshot-v1-128k-vision-preview', family: 'kimi', contextLength: KIMI_128K_CONTEXT, maxOutputTokens: 8192, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    provider: 'minimax',
    apiType: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    custom: false,
    fallbackModels: [
      { id: 'MiniMax-M2.7', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'MiniMax-M2.7-highspeed', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'MiniMax-M2.5', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'MiniMax-M2.5-highspeed', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'MiniMax-M2.1', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'MiniMax-M2.1-highspeed', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'MiniMax-M2', family: 'minimax', contextLength: MINIMAX_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
    ],
  },
  {
    id: 'zai',
    label: 'GLM / Z.AI',
    provider: 'zai',
    apiType: 'openai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    custom: false,
    fallbackModels: [
      { id: 'glm-5.1', family: 'glm', contextLength: GLM_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'glm-5', family: 'glm', contextLength: GLM_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'glm-5-turbo', family: 'glm', contextLength: GLM_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'glm-5v-turbo', family: 'glm', contextLength: GLM_200K_CONTEXT, maxOutputTokens: 128000, vision: true, toolCalling: true },
      { id: 'glm-4.7', family: 'glm', contextLength: GLM_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'glm-4.6', family: 'glm', contextLength: GLM_200K_CONTEXT, maxOutputTokens: 128000, vision: false, toolCalling: true },
      { id: 'glm-4.6v', family: 'glm', contextLength: GLM_128K_CONTEXT, maxOutputTokens: GLM_SAFE_OUTPUT, vision: true, toolCalling: true },
    ],
  },
  {
    id: 'custom-openai',
    label: '自定义 Custom',
    provider: 'custom',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
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
    contextLength: shouldRefreshKnownDefault(model, 'contextLength', model.contextLength, defaults.contextLength)
      ? defaults.contextLength
      : model.contextLength ?? defaults.contextLength,
    maxOutputTokens: shouldRefreshKnownDefault(model, 'maxOutputTokens', model.maxOutputTokens, defaults.maxOutputTokens)
      ? defaults.maxOutputTokens
      : model.maxOutputTokens ?? defaults.maxOutputTokens,
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

  if (provider.includes('kimi') || provider.includes('moonshot') || id.startsWith('kimi-') || id.startsWith('moonshot-')) {
    return inferKimiDefaults(id);
  }

  if (provider.includes('minimax') || id.toLowerCase().startsWith('minimax-')) {
    return inferMiniMaxDefaults(id);
  }

  if (provider === 'openai' || id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    return inferOpenAIDefaults(id);
  }

  if (provider.includes('xai') || provider.includes('grok') || id.startsWith('grok-')) {
    return {
      family: 'grok',
      contextLength: inferGrokContextLength(id),
      maxOutputTokens: id.includes('code-fast') ? 32768 : 131072,
      vision: !id.includes('code-fast') && !id.includes('reasoning'),
      toolCalling: true,
      reasoningEffort: id.includes('reasoning') ? 'medium' : undefined,
    };
  }

  if (provider.includes('zai') || provider.includes('glm') || id.startsWith('glm-')) {
    if (id.startsWith('glm-5') || id.startsWith('glm-4.7') || id.startsWith('glm-4.6')) {
      return {
        family: 'glm',
        contextLength: id.includes('4.6v') ? GLM_128K_CONTEXT : GLM_200K_CONTEXT,
        maxOutputTokens: id.includes('4.6v') ? GLM_SAFE_OUTPUT : 128000,
        vision: id.includes('v'),
        toolCalling: true,
      };
    }
    return {
      family: 'glm',
      contextLength: GLM_128K_CONTEXT,
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
  if (id.startsWith('gpt-5')) {
    return {
      family: id.includes('codex') ? 'gpt-5-codex' : 'gpt-5',
      contextLength: inferGpt5ContextLength(id),
      maxOutputTokens: 128000,
      vision: true,
      toolCalling: true,
      reasoningEffort: 'medium',
    };
  }

  if (/^o[134]/.test(id)) {
    return {
      family: 'openai-reasoning',
      contextLength: O_SERIES_CONTEXT,
      maxOutputTokens: O_SERIES_OUTPUT,
      vision: true,
      toolCalling: true,
      reasoningEffort: 'medium',
    };
  }

  if (id.startsWith('gpt-4.1')) {
    return {
      family: 'gpt-4',
      contextLength: OPENAI_GPT41_CONTEXT,
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
    contextLength: inferClaudeContextLength(id),
    maxOutputTokens: inferClaudeMaxOutputTokens(id),
    vision: true,
    toolCalling: true,
    thinkingBudgetTokens: supportsThinking ? 8192 : undefined,
  };
}

function inferDeepSeekDefaults(id: string): Partial<ModelConfig> {
  const currentV4 = id.includes('v4');
  return {
    family: 'deepseek',
    contextLength: currentV4 ? DEEPSEEK_1M_CONTEXT : 64000,
    maxOutputTokens: currentV4 ? DEEPSEEK_SAFE_OUTPUT : 8192,
    vision: false,
    toolCalling: !id.includes('reasoner'),
    reasoningEffort: currentV4 ? 'high' : undefined,
  };
}

function inferGeminiDefaults(id: string): Partial<ModelConfig> {
  return {
    family: 'gemini',
    contextLength: GEMINI_1M_CONTEXT,
    maxOutputTokens: 65536,
    vision: true,
    toolCalling: true,
    reasoningEffort: id.includes('pro') || id.includes('flash') ? 'medium' : undefined,
  };
}

function inferKimiDefaults(id: string): Partial<ModelConfig> {
  return {
    family: 'kimi',
    contextLength: id.includes('128k') || id.includes('0711') ? KIMI_128K_CONTEXT : KIMI_256K_CONTEXT,
    maxOutputTokens: id.startsWith('moonshot-') ? 8192 : 32768,
    vision: id.includes('vision') || id === 'kimi-k2.5' || id === 'kimi-k2.6',
    toolCalling: true,
  };
}

function inferMiniMaxDefaults(_id: string): Partial<ModelConfig> {
  return {
    family: 'minimax',
    contextLength: MINIMAX_200K_CONTEXT,
    maxOutputTokens: 128000,
    vision: false,
    toolCalling: true,
  };
}

function inferGpt5ContextLength(id: string): number {
  if (id.startsWith('gpt-5.5') || (id.startsWith('gpt-5.4') && !id.startsWith('gpt-5.4-mini'))) {
    return OPENAI_1M_CONTEXT;
  }
  return OPENAI_400K_CONTEXT;
}

function inferClaudeContextLength(id: string): number {
  if (id.includes('opus-4-7') || id.includes('opus-4-6') || id.includes('sonnet-4-6')) {
    return CLAUDE_1M_CONTEXT;
  }
  return CLAUDE_200K_CONTEXT;
}

function inferClaudeMaxOutputTokens(id: string): number {
  if (id.includes('opus-4-7') || id.includes('opus-4-6')) {
    return 128000;
  }
  if (id.includes('sonnet') || id.includes('haiku-4-5')) {
    return 64000;
  }
  if (id.includes('haiku')) {
    return 8192;
  }
  return 32000;
}

function inferGrokContextLength(id: string): number {
  if (id.includes('4.20')) {
    return XAI_GROK_2M_CONTEXT;
  }
  if (id.includes('code-fast')) {
    return XAI_GROK_CODE_CONTEXT;
  }
  return XAI_GROK_1M_CONTEXT;
}

function shouldRefreshKnownDefault(
  model: Pick<ModelConfig, 'id' | 'provider' | 'apiType'>,
  field: 'contextLength' | 'maxOutputTokens',
  currentValue: number | undefined,
  defaultValue: number | undefined,
): boolean {
  if (typeof currentValue !== 'number' || typeof defaultValue !== 'number' || currentValue === defaultValue) {
    return false;
  }

  const id = model.id.toLowerCase();
  if (field === 'contextLength') {
    return isKnownStaleContextLength(id, currentValue);
  }
  return isKnownStaleMaxOutputTokens(id, currentValue);
}

function isKnownStaleContextLength(id: string, value: number): boolean {
  if ((id.startsWith('gpt-5.5') || (id.startsWith('gpt-5.4') && !id.startsWith('gpt-5.4-mini'))) && [1000000, 1048576, 1050000].includes(value)) {
    return true;
  }
  if (id.startsWith('gpt-5') && value === 400000) {
    return true;
  }
  if (id.startsWith('gpt-4.1') && [1047576, 1048576].includes(value)) {
    return true;
  }
  if (/^o[134]/.test(id) && value === 200000) {
    return true;
  }
  if (id.startsWith('claude-') && [200000, 1000000].includes(value)) {
    return true;
  }
  if (id.includes('grok-4.20') && [256000, 1000000, 1048576, 2000000].includes(value)) {
    return true;
  }
  if ((id.includes('grok-4.3') || id.includes('code-fast')) && [256000, 1000000].includes(value)) {
    return true;
  }
  if (id.startsWith('deepseek-v4') && value === 1048576) {
    return true;
  }
  if (id.startsWith('gemini-') && value === 1048576) {
    return true;
  }
  if ((id.startsWith('kimi-') || id.startsWith('moonshot-')) && [131072, 262144].includes(value)) {
    return true;
  }
  if (id.toLowerCase().startsWith('minimax-') && value === 204800) {
    return true;
  }
  if (id.startsWith('glm-') && value === 200000) {
    return true;
  }
  return false;
}

function isKnownStaleMaxOutputTokens(id: string, value: number): boolean {
  if (id.startsWith('deepseek-v4') && [65536, 128000, 393216].includes(value)) {
    return true;
  }
  if (id === 'glm-4.6v' && value === 128000) {
    return true;
  }
  return false;
}
