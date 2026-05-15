import * as vscode from 'vscode';
import { prepareProviderRequest } from './adapters';
import { AuthManager } from './auth';
import { getProviderKeys, getResolvedModels, getModelByRegisteredId } from './config';
import { logger } from './logger';
import type { ResolvedModelConfig } from './types';

type ModelPickerChatInformation = vscode.LanguageModelChatInformation & {
  readonly isUserSelectable: boolean;
  readonly statusIcon?: vscode.ThemeIcon;
  readonly configurationSchema?: {
    readonly properties: Record<string, unknown>;
  };
};

export class AllInCopilotProvider implements vscode.LanguageModelChatProvider {
  private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
  private active = true;

  readonly onDidChangeLanguageModelChatInformation =
    this.onDidChangeLanguageModelChatInformationEmitter.event;

  constructor(private readonly authManager: AuthManager, context: vscode.ExtensionContext) {
    context.subscriptions.push(
      this.onDidChangeLanguageModelChatInformationEmitter,
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('all-in-copilot')) {
          void this.refreshModelPicker();
        }
      }),
      context.secrets.onDidChange((event) => {
        if (event.key.startsWith('all-in-copilot.apiKey')) {
          void this.refreshModelPicker();
        }
      }),
    );
  }

  async refreshModelPicker(): Promise<void> {
    this.onDidChangeLanguageModelChatInformationEmitter.fire();
    try {
      await vscode.lm.selectChatModels({ vendor: 'allin' });
    } catch (error) {
      logger.warn('Could not force model picker refresh.', formatError(error));
    }
  }

  async prepareForDeactivate(): Promise<void> {
    this.active = false;
    await this.refreshModelPicker();
    try {
      await vscode.lm.selectChatModels({ vendor: 'allin' });
    } catch (error) {
      logger.warn('Could not force model picker refresh during deactivate.', formatError(error));
    }
  }

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatInformation[]> {
    if (!this.active) {
      return [];
    }

    const models = getResolvedModels();
    const hasApiKey = await this.authManager.hasAnyApiKey(getProviderKeys());
    return models.map((model) => toChatInfo(model, hasApiKey));
  }

  async provideLanguageModelChatResponse(
    modelInfo: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const model = getModelByRegisteredId(modelInfo.id);
    if (!model) {
      throw new Error(`All in Copilot model not found: ${modelInfo.id}`);
    }

    const apiKey = await this.authManager.getApiKey(model.provider);
    if (!apiKey) {
      throw new Error(`No API key configured for ${model.provider}. Run "All in Copilot: Set Provider API Key".`);
    }

    const prepared = prepareProviderRequest(model, messages, options, apiKey);

    const requestTools = Array.isArray(prepared.body.tools) ? prepared.body.tools : [];
    logger.info('Request start.', {
      model: model.registeredId,
      provider: model.provider,
      apiType: model.apiType,
      url: prepared.url,
      messageCount: messages.length,
      suppliedToolCount: options.tools?.length ?? 0,
      requestToolCount: requestTools.length,
      toolMode: options.toolMode,
      toolChoice: prepared.body.tool_choice,
    });

    let response = await fetch(prepared.url, {
      method: 'POST',
      headers: prepared.headers,
      body: JSON.stringify(prepared.body),
    });

    if (!response.ok) {
      let errorText = await response.text();
      if (shouldRetryDeepSeekWithoutThinking(model, prepared.body, errorText)) {
        logger.warn('Retrying DeepSeek request with thinking disabled after reasoning_content replay error.');
        const retryBody = disableDeepSeekThinking(prepared.body);
        response = await fetch(prepared.url, {
          method: 'POST',
          headers: prepared.headers,
          body: JSON.stringify(retryBody),
        });

        if (response.ok) {
          if (!response.body) {
            throw new Error('All in Copilot API returned no response body.');
          }
          await prepared.processStream(response.body, progress, token);
          return;
        }

        errorText = await response.text();
      }

      logger.error('Request failed.', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(
        `All in Copilot API error: [${response.status}] ${response.statusText}${errorText ? `\n${errorText}` : ''}`,
      );
    }

    if (!response.body) {
      throw new Error('All in Copilot API returned no response body.');
    }

    await prepared.processStream(response.body, progress, token);
  }

  async provideTokenCount(
    _modelInfo: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    return estimateTokenCount(text);
  }
}

function toChatInfo(model: ResolvedModelConfig, hasApiKey: boolean): ModelPickerChatInformation {
  const maxInputTokens = Math.max(1, model.contextLength - model.maxOutputTokens);
  const missingKeyDetail = 'API key required';
  const detail = [
    `${model.provider}`,
    `${formatTokens(model.contextLength)} context`,
    formatReasoning(model),
    `via All in Copilot`,
  ].filter(Boolean).join(' · ');

  return {
    id: model.registeredId,
    name: formatPickerName(model),
    family: model.family,
    version: '1.0.0',
    detail: hasApiKey ? detail : missingKeyDetail,
    tooltip: hasApiKey ? `${detail}\n${model.id}` : missingKeyDetail,
    statusIcon: hasApiKey ? undefined : new vscode.ThemeIcon('warning'),
    maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    isUserSelectable: true,
    capabilities: {
      toolCalling: model.toolCalling,
      imageInput: model.vision,
    },
    ...buildConfigurationSchema(model),
  };
}

function shouldRetryDeepSeekWithoutThinking(
  model: ResolvedModelConfig,
  body: Record<string, unknown>,
  errorText: string,
): boolean {
  const provider = model.provider.toLowerCase();
  const id = model.id.toLowerCase();
  const thinking = body.thinking as Record<string, unknown> | undefined;
  return (
    (provider.includes('deepseek') || id.startsWith('deepseek-')) &&
    id.startsWith('deepseek-v4') &&
    thinking?.type !== 'disabled' &&
    /reasoning_content/i.test(errorText) &&
    /thinking/i.test(errorText)
  );
}

function disableDeepSeekThinking(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    reasoning_effort: undefined,
    thinking: { type: 'disabled' },
    messages: stripReasoningContent(body.messages),
  };
}

function stripReasoningContent(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }

    const { reasoning_content: _reasoningContent, ...rest } = item as Record<string, unknown>;
    return rest;
  });
}

function buildConfigurationSchema(model: ResolvedModelConfig): Pick<ModelPickerChatInformation, 'configurationSchema'> {
  if (model.apiType === 'anthropic' || model.provider.toLowerCase().includes('anthropic')) {
    return {};
  }

  const id = model.id.toLowerCase();
  const provider = model.provider.toLowerCase();
  if ((provider.includes('deepseek') || id.startsWith('deepseek-')) && id.startsWith('deepseek-v4')) {
    return {
      configurationSchema: {
        properties: {
          reasoningEffort: {
            type: 'string',
            title: '推理强度',
            enum: ['high', 'max'],
            enumItemLabels: ['高', '最高'],
            default: model.reasoningEffort === 'max' ? 'max' : 'high',
            group: 'navigation',
          },
        },
      },
    };
  }

  const supportsOpenAIReasoning =
    provider.includes('openai') ||
    provider.includes('xtoken') ||
    provider === 'custom' ||
    id.startsWith('gpt-') ||
    /^o[134]/.test(id);

  if (!supportsOpenAIReasoning || !model.reasoningEffort) {
    return {};
  }

  const values = id.startsWith('gpt-5.1')
    ? ['none', 'low', 'medium', 'high']
    : ['minimal', 'low', 'medium', 'high', 'xhigh'];

  return {
    configurationSchema: {
      properties: {
        reasoningEffort: {
          type: 'string',
          title: '推理强度',
          enum: values,
          enumItemLabels: values.map(formatReasoningEffortLabel),
          default: values.includes(model.reasoningEffort) ? model.reasoningEffort : 'medium',
          group: 'navigation',
        },
      },
    },
  };
}

function formatReasoningEffortLabel(value: string): string {
  switch (value) {
    case 'none':
      return '关闭';
    case 'minimal':
      return '极低';
    case 'low':
      return '低';
    case 'medium':
      return '中';
    case 'high':
      return '高';
    case 'xhigh':
      return '最高';
    default:
      return value;
  }
}

function formatReasoning(model: ResolvedModelConfig): string {
  if (typeof model.thinkingBudgetTokens === 'number') {
    return `thinking ${formatTokens(model.thinkingBudgetTokens)}`;
  }

  if (model.reasoningEffort) {
    return `reasoning ${model.reasoningEffort}`;
  }

  return '';
}

function formatTokens(value: number): string {
  if (value >= 1000000) {
    return `${Math.round(value / 100000) / 10}M`;
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return String(value);
}

function formatPickerName(model: ResolvedModelConfig): string {
  const provider = model.provider.trim();
  const name = (model.displayName || model.id).trim();
  if (!provider || name.toLowerCase().startsWith(`${provider.toLowerCase()}/`)) {
    return name;
  }
  return `${provider}/${name}`;
}

function estimateTokenCount(text: string | vscode.LanguageModelChatRequestMessage): number {
  if (typeof text === 'string') {
    return Math.ceil(text.length / 4);
  }

  let chars = 0;
  for (const part of text.content ?? []) {
    if (part instanceof vscode.LanguageModelTextPart) {
      chars += part.value.length;
    } else if (part instanceof vscode.LanguageModelDataPart) {
      chars += Math.ceil(part.data.byteLength / 3);
    } else {
      chars += 100;
    }
  }

  return Math.max(1, Math.ceil(chars / 4));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
