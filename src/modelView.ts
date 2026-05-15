import * as vscode from 'vscode';
import { AuthManager } from './auth';
import { getRawModelConfigs, updateRawModelConfigs } from './config';
import { logger } from './logger';
import { discoverProviderModels, testProviderModel } from './adapters';
import { inferProviderFromBaseUrl, resolveProviderName } from './providerNames';
import { renderModelManagerHtml } from './modelViewHtml';
import {
  PROVIDER_PRESETS,
  getProviderPreset,
} from './presets';
import type { ApiType, ModelConfig } from './types';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'saveModels'; models: unknown }
  | { type: 'saveProvider'; provider?: unknown; apiKey?: unknown; models: unknown }
  | { type: 'testProvider'; presetId?: unknown; apiType?: unknown; provider?: unknown; baseUrl?: unknown; apiKey?: unknown; modelId?: unknown }
  | { type: 'discoverModels'; presetId?: unknown; apiType?: unknown; provider?: unknown; baseUrl?: unknown; apiKey?: unknown }
  | { type: 'setGlobalApiKey' }
  | { type: 'setProviderApiKey'; provider?: unknown }
  | { type: 'openSettings' }
  | { type: 'showLogs' };

export class ModelManagerViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'all-in-copilot.modelsView';

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authManager: AuthManager,
    private readonly refreshModels: () => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    this.context.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(message);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('all-in-copilot.models')) {
          this.postState();
        }
      }),
    );
  }

  focus(): void {
    void vscode.commands.executeCommand(`${ModelManagerViewProvider.viewType}.focus`);
  }

  postState(): void {
    this.view?.webview.postMessage({
      type: 'state',
      models: getRawModelConfigs(),
      presets: PROVIDER_PRESETS,
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.postState();
        return;

      case 'saveModels':
        await this.saveModels(message.models);
        return;

      case 'saveProvider':
        await this.saveProvider(message);
        return;

      case 'testProvider':
        await this.testProvider(message);
        return;

      case 'discoverModels':
        await this.discoverModels(message);
        return;

      case 'setGlobalApiKey':
        if (await this.authManager.promptForGlobalApiKey()) {
          this.refreshModels();
        }
        return;

      case 'setProviderApiKey':
        await this.setProviderApiKey(message.provider);
        return;

      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'all-in-copilot');
        return;

      case 'showLogs':
        logger.show();
        return;
    }
  }

  private async saveModels(rawModels: unknown): Promise<void> {
    try {
      const parsed = parseModelConfigs(rawModels);
      if (!parsed.ok) {
        this.postError(parsed.error);
        return;
      }

      await updateRawModelConfigs(parsed.models);
      this.refreshModels();
      this.postState();
      this.postInfo('已保存模型配置，模型选择器会自动刷新。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Save models failed.', { error: message });
      this.postError(`保存失败：${message}`);
    }
  }

  private async saveProvider(message: Extract<WebviewMessage, { type: 'saveProvider' }>): Promise<void> {
    try {
      const parsed = parseModelConfigs(message.models);
      if (!parsed.ok) {
        this.postError(parsed.error);
        return;
      }

      const provider = typeof message.provider === 'string'
        ? resolveProviderName(message.provider, undefined)
        : parsed.models.find((model) => model.provider)?.provider;
      const apiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';

      if (apiKey && provider) {
        await this.authManager.storeProviderApiKey(provider, apiKey);
      }

      await updateRawModelConfigs(parsed.models);
      this.refreshModels();
      this.postState();

      const enabledCount = provider
        ? parsed.models.filter((model) => model.provider === provider).length
        : parsed.models.length;
      const keyMessage = apiKey && provider ? '，并保存了 API Key' : '';
      this.postInfo(provider
        ? `已保存 ${provider}，启用 ${enabledCount} 个模型${keyMessage}。`
        : `已保存模型配置。`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error('Save provider failed.', { error: messageText });
      this.postError(`保存供应商失败：${messageText}`);
    }
  }

  private async setProviderApiKey(rawProvider: unknown): Promise<void> {
    const provider = typeof rawProvider === 'string' ? rawProvider.trim() : '';
    if (!provider) {
      this.postError('Choose or enter a provider before setting its API key.');
      return;
    }

    if (await this.authManager.promptForProviderApiKey(provider)) {
      this.refreshModels();
    }
  }

  private async discoverModels(message: Extract<WebviewMessage, { type: 'discoverModels' }>): Promise<void> {
    const presetId = typeof message.presetId === 'string' ? message.presetId : undefined;
    const preset = getProviderPreset(presetId);
    const apiType = normalizeApiType(typeof message.apiType === 'string' ? message.apiType : undefined) ?? preset?.apiType ?? 'openai';
    const rawProvider = typeof message.provider === 'string' ? message.provider.trim() : '';
    const baseUrl = (typeof message.baseUrl === 'string' ? message.baseUrl.trim() : '') || preset?.baseUrl || '';
    const providedApiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';

    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      this.postError('请填写有效的 Base URL，例如 https://api.example.com/v1。');
      return;
    }

    const provider = resolveProviderName(rawProvider || preset?.provider, baseUrl);
    if (!provider) {
      this.postError('请先填写服务商名称，或使用能识别域名的 Base URL。');
      return;
    }

    const apiKey = providedApiKey || await this.authManager.getApiKey(provider);
    if (!apiKey) {
      this.postError(`请先填写或保存 ${provider} 的 API Key。`);
      return;
    }

    try {
      let result;
      try {
        result = await discoverProviderModels(apiType, baseUrl, apiKey);
      } catch (error) {
        if (!preset || preset.fallbackModels.length === 0 || isAuthError(error)) {
          throw error;
        }
        result = {
          baseUrl,
          models: preset.fallbackModels,
        };
      }
      if (providedApiKey) {
        await this.authManager.storeProviderApiKey(provider, providedApiKey);
      }
      this.view?.webview.postMessage({
        type: 'discoveredModels',
        presetId,
        apiType,
        provider,
        baseUrl: result.baseUrl,
        models: result.models,
      });
      this.postInfo(providedApiKey
        ? `已获取 ${result.models.length} 个模型，并保存了 ${provider} 的 API Key。`
        : `已获取 ${result.models.length} 个模型。`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error('Discover models failed.', { provider, baseUrl, error: messageText });
      this.postError(`获取模型失败：${messageText}`);
    }
  }

  private async testProvider(message: Extract<WebviewMessage, { type: 'testProvider' }>): Promise<void> {
    const presetId = typeof message.presetId === 'string' ? message.presetId : undefined;
    const preset = getProviderPreset(presetId);
    const apiType = normalizeApiType(typeof message.apiType === 'string' ? message.apiType : undefined) ?? preset?.apiType ?? 'openai';
    const rawProvider = typeof message.provider === 'string' ? message.provider.trim() : '';
    const baseUrl = (typeof message.baseUrl === 'string' ? message.baseUrl.trim() : '') || preset?.baseUrl || '';
    const providedApiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';
    const modelId = typeof message.modelId === 'string' ? message.modelId.trim() : '';

    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      this.postError('请填写有效的 Base URL，例如 https://api.example.com/v1。');
      return;
    }

    const provider = resolveProviderName(rawProvider || preset?.provider, baseUrl);
    if (!provider) {
      this.postError('请先填写服务商名称，或使用能识别域名的 Base URL。');
      return;
    }

    const apiKey = providedApiKey || await this.authManager.getApiKey(provider);
    if (!apiKey) {
      this.postError(`请先填写或保存 ${provider} 的 API Key。`);
      return;
    }

    if (!modelId) {
      this.postError('请先选择一个用于连通测试的模型。');
      return;
    }

    try {
      const result = await testProviderModel(apiType, baseUrl, apiKey, modelId);
      this.view?.webview.postMessage({
        type: 'providerTestResult',
        presetId,
        apiType,
        provider,
        baseUrl: result.baseUrl,
        modelId: result.modelId,
        elapsedMs: result.elapsedMs,
      });
      this.postInfo(`连通成功：${provider}/${result.modelId}，${result.elapsedMs}ms。`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error('Provider connectivity test failed.', { provider, baseUrl, error: messageText });
      this.postError(`连通测试失败：${messageText}`);
    }
  }

  private postError(message: string): void {
    this.view?.webview.postMessage({ type: 'error', message });
  }

  private postInfo(message: string): void {
    this.view?.webview.postMessage({ type: 'info', message });
  }

  private renderHtml(webview: vscode.Webview): string {
    return renderModelManagerHtml(webview);
  }
}

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\[(401|403)\]/.test(message) || /unauthorized|forbidden|invalid api key|invalid x-api-key/i.test(message);
}

function parseModelConfigs(value: unknown): { ok: true; models: ModelConfig[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'Model payload was not an array.' };
  }

  const models: ModelConfig[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: `Model ${index + 1} is not an object.` };
    }

    const record = item as Record<string, unknown>;
    const id = asString(record.id);
    if (!id) {
      return { ok: false, error: `Model ${index + 1} needs a model id.` };
    }

    const baseUrl = asString(record.baseUrl);
    const model: ModelConfig = {
      id,
      apiType: normalizeApiType(asString(record.apiType)),
      configId: asString(record.configId),
      displayName: asString(record.displayName),
      provider: resolveProviderName(asString(record.provider), baseUrl),
      baseUrl,
      family: asString(record.family),
      contextLength: asNumber(record.contextLength),
      maxOutputTokens: asNumber(record.maxOutputTokens),
      vision: asBoolean(record.vision),
      toolCalling: asBoolean(record.toolCalling),
      temperature: asNumber(record.temperature),
      topP: asNumber(record.topP),
      reasoningEffort: normalizeReasoningEffort(asString(record.reasoningEffort)),
      thinkingBudgetTokens: asNumber(record.thinkingBudgetTokens),
      headers: asRecord(record.headers, true),
      extra: asRecord(record.extra, false),
    };

    if (record.headers !== undefined && model.headers === undefined) {
      return { ok: false, error: `Model ${index + 1} headers must be a JSON object with string values.` };
    }

    if (record.extra !== undefined && model.extra === undefined) {
      return { ok: false, error: `Model ${index + 1} extra must be a JSON object.` };
    }

    models.push(model);
  }

  return { ok: true, models };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeApiType(value: string | undefined): ApiType | undefined {
  return value === 'openai' ||
    value === 'openai-responses' ||
    value === 'anthropic' ||
    value === 'gemini'
    ? value
    : undefined;
}

function normalizeReasoningEffort(value: string | undefined): string | undefined {
  return value || undefined;
}

function asRecord<TStringOnly extends boolean>(
  value: unknown,
  stringOnly: TStringOnly,
): TStringOnly extends true ? Record<string, string> | undefined : Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined as TStringOnly extends true ? Record<string, string> | undefined : Record<string, unknown> | undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined as TStringOnly extends true ? Record<string, string> | undefined : Record<string, unknown> | undefined;
  }

  if (stringOnly && Object.values(value).some((entry) => typeof entry !== 'string')) {
    return undefined as TStringOnly extends true ? Record<string, string> | undefined : Record<string, unknown> | undefined;
  }

  return value as TStringOnly extends true ? Record<string, string> | undefined : Record<string, unknown> | undefined;
}
