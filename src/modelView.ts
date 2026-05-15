import * as vscode from 'vscode';
import { AuthManager } from './auth';
import { getRawModelConfigs, updateRawModelConfigs } from './config';
import { logger } from './logger';
import { discoverProviderModels } from './adapters';
import { inferProviderFromBaseUrl, resolveProviderName } from './providerNames';
import {
  PROVIDER_PRESETS,
  applyModelDefaults,
  getProviderPreset,
  inferModelDefaults,
} from './presets';
import type { ApiType, ModelConfig } from './types';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'saveModels'; models: unknown }
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
    const apiType = preset?.apiType ?? normalizeApiType(typeof message.apiType === 'string' ? message.apiType : undefined) ?? 'openai';
    const rawProvider = typeof message.provider === 'string' ? message.provider.trim() : '';
    const baseUrl = (typeof message.baseUrl === 'string' ? message.baseUrl.trim() : '') || preset?.baseUrl || '';
    const apiKey = typeof message.apiKey === 'string' ? message.apiKey.trim() : '';

    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      this.postError('请填写有效的 Base URL，例如 https://api.example.com/v1。');
      return;
    }

    const provider = resolveProviderName(rawProvider || preset?.provider, baseUrl);
    if (!provider) {
      this.postError('请先填写服务商名称，或使用能识别域名的 Base URL。');
      return;
    }

    if (!apiKey) {
      this.postError('请填写 API Key。密钥只会保存到 VS Code SecretStorage。');
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
      await this.authManager.storeProviderApiKey(provider, apiKey);
      this.view?.webview.postMessage({
        type: 'discoveredModels',
        presetId,
        apiType,
        provider,
        baseUrl: result.baseUrl,
        models: result.models,
      });
      this.postInfo(`已获取 ${result.models.length} 个模型，并保存了 ${provider} 的 API Key。`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error('Discover models failed.', { provider, baseUrl, error: messageText });
      this.postError(`获取模型失败：${messageText}`);
    }
  }

  private postError(message: string): void {
    this.view?.webview.postMessage({ type: 'error', message });
  }

  private postInfo(message: string): void {
    this.view?.webview.postMessage({ type: 'info', message });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>All in Copilot 模型管理</title>
  <style>
    :root {
      color-scheme: light dark;
      --row-border: color-mix(in srgb, var(--vscode-sideBarSectionHeader-border) 70%, transparent);
      --muted: var(--vscode-descriptionForeground);
      --focus: var(--vscode-focusBorder);
      --panel: var(--vscode-editor-background);
      --panel-border: var(--vscode-widget-border);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-size: var(--vscode-font-size);
    }

    .header {
      position: sticky;
      top: 0;
      z-index: 3;
      background: var(--vscode-sideBar-background);
    }

    button,
    input,
    select,
    textarea {
      font-family: inherit;
      font-size: inherit;
    }

    .root {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      min-height: 100vh;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      padding: 10px;
      border-bottom: 1px solid var(--row-border);
    }

    .status {
      min-height: 26px;
      padding: 6px 10px;
      color: var(--muted);
      border-bottom: 1px solid var(--row-border);
      background: var(--vscode-sideBar-background);
      overflow-wrap: anywhere;
    }

    .status.error {
      color: var(--vscode-errorForeground);
    }

    .status.success {
      color: var(--vscode-testing-iconPassed);
    }

    .content {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      min-height: 0;
    }

    .discover {
      display: grid;
      gap: 8px;
      padding: 10px;
      border-bottom: 1px solid var(--row-border);
      background: color-mix(in srgb, var(--panel) 70%, transparent);
    }

    .discovered {
      display: grid;
      gap: 4px;
      max-height: 180px;
      overflow: auto;
    }

    .discover-actions {
      display: flex;
      justify-content: end;
    }

    .discovered-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
      padding: 4px;
      border: 1px solid var(--row-border);
      border-radius: 3px;
    }

    .discovered-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .models {
      display: grid;
      grid-auto-rows: minmax(48px, auto);
      gap: 1px;
      border-bottom: 1px solid var(--row-border);
      max-height: 36vh;
      overflow: auto;
    }

    .model-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 8px 10px;
      background: transparent;
      border: 0;
      color: inherit;
      text-align: left;
      cursor: pointer;
      border-left: 3px solid transparent;
    }

    .model-row:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .model-row.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      border-left-color: var(--focus);
    }

    .model-main {
      min-width: 0;
    }

    .model-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }

    .model-meta {
      margin-top: 3px;
      color: var(--muted);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
    }

    .model-row.active .model-meta {
      color: inherit;
      opacity: 0.78;
    }

    .badges {
      display: flex;
      align-items: start;
      gap: 4px;
    }

    .badge {
      min-width: 18px;
      height: 18px;
      display: inline-grid;
      place-items: center;
      border: 1px solid var(--panel-border);
      border-radius: 3px;
      color: var(--muted);
      font-size: 11px;
    }

    .empty {
      padding: 18px 10px;
      color: var(--muted);
    }

    .empty.inline {
      padding: 6px 0 0;
    }

    .editor {
      min-height: 0;
      overflow: auto;
      padding: 10px;
    }

    .form {
      display: grid;
      gap: 10px;
      padding-bottom: 16px;
    }

    .field {
      display: grid;
      gap: 4px;
    }

    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
    }

    label {
      color: var(--muted);
      font-size: 12px;
    }

    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 5px 7px;
      min-height: 28px;
      outline: none;
    }

    textarea {
      min-height: 74px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: var(--focus);
    }

    .checks {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .check {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      color: var(--vscode-foreground);
    }

    .check input {
      width: auto;
      min-height: auto;
    }

    .form-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding-top: 4px;
    }

    button {
      min-height: 28px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 5px 8px;
      cursor: pointer;
      border-radius: 2px;
    }

    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.saved {
      background: var(--vscode-testing-iconPassed);
      color: var(--vscode-button-foreground);
    }

    button.danger {
      color: var(--vscode-errorForeground);
    }

    .icon-button {
      width: 30px;
      min-width: 30px;
      padding: 0;
    }

    @media (max-width: 260px) {
      .split,
      .form-actions {
        grid-template-columns: 1fr;
      }

      .toolbar {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="root">
    <div class="header">
      <div class="toolbar">
        <button class="primary" id="newButton" type="button" title="手动添加模型">添加</button>
        <button id="clearButton" type="button" title="清空已配置模型" data-default-label="清空配置">清空配置</button>
      </div>
      <div class="status" id="status" role="status" aria-live="polite">正在读取模型...</div>
    </div>
    <div class="content">
      <section class="discover">
        <div class="field">
          <label for="providerPreset">服务商预设</label>
          <select id="providerPreset"></select>
        </div>
        <div class="split">
          <div class="field">
            <label for="discoverApiType">接口类型</label>
            <select id="discoverApiType">
              <option value="openai">OpenAI Compatible</option>
              <option value="anthropic">Anthropic Messages</option>
            </select>
          </div>
          <div class="field">
            <label for="discoverProvider">服务商</label>
            <input id="discoverProvider" value="openai" placeholder="openai">
          </div>
        </div>
        <div class="field">
          <label for="discoverBaseUrl">Base URL</label>
          <input id="discoverBaseUrl" value="https://api.openai.com/v1" placeholder="https://api.openai.com/v1">
        </div>
        <div class="field">
          <label for="discoverApiKey">API Key</label>
          <input id="discoverApiKey" type="password" placeholder="sk-...">
        </div>
        <button class="primary" id="discoverButton" type="button">获取模型列表</button>
        <div class="discover-actions">
          <button type="button" id="clearDiscoveredButton">清空候选</button>
        </div>
        <div class="discovered" id="discovered"></div>
      </section>
      <div class="models" id="models"></div>
      <div class="editor">
        <form class="form" id="form">
          <div class="field">
            <label for="id">模型 ID</label>
            <input id="id" name="id" placeholder="gpt-4.1" required>
          </div>
          <div class="split">
            <div class="field">
              <label for="displayName">显示名称</label>
              <input id="displayName" name="displayName" placeholder="GPT-4.1">
            </div>
            <div class="field">
              <label for="configId">配置 ID</label>
              <input id="configId" name="configId" placeholder="creative">
            </div>
          </div>
          <div class="split">
            <div class="field">
              <label for="apiType">接口类型</label>
              <select id="apiType" name="apiType">
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic Messages</option>
              </select>
            </div>
            <div class="field">
              <label for="provider">服务商</label>
              <input id="provider" name="provider" placeholder="openai">
            </div>
          </div>
          <div class="split">
            <div class="field">
              <label for="family">Family</label>
              <input id="family" name="family" placeholder="gpt-4">
            </div>
          </div>
          <div class="field">
            <label for="baseUrl">Base URL</label>
            <input id="baseUrl" name="baseUrl" placeholder="https://api.openai.com/v1">
          </div>
          <div class="split">
            <div class="field">
              <label for="contextLength">上下文</label>
              <input id="contextLength" name="contextLength" type="number" min="1000" step="1" placeholder="128000">
            </div>
            <div class="field">
              <label for="maxOutputTokens">最大输出</label>
              <input id="maxOutputTokens" name="maxOutputTokens" type="number" min="1" step="1" placeholder="4096">
            </div>
          </div>
          <div class="split">
            <div class="field">
              <label for="temperature">Temperature</label>
              <input id="temperature" name="temperature" type="number" min="0" max="2" step="0.1" placeholder="provider default">
            </div>
            <div class="field">
              <label for="topP">Top P</label>
              <input id="topP" name="topP" type="number" min="0" max="1" step="0.05" placeholder="provider default">
            </div>
          </div>
          <div class="field">
              <label for="reasoningEffort">推理强度</label>
              <select id="reasoningEffort" name="reasoningEffort"></select>
          </div>
          <div class="field" id="thinkingBudgetField">
            <label for="thinkingBudgetTokens">Claude Thinking Budget</label>
            <input id="thinkingBudgetTokens" name="thinkingBudgetTokens" type="number" min="1024" step="1024" placeholder="8192">
          </div>
          <div class="checks">
            <label class="check"><input id="vision" name="vision" type="checkbox"> 视觉</label>
            <label class="check"><input id="toolCalling" name="toolCalling" type="checkbox"> 工具调用</label>
          </div>
          <div class="field">
            <label for="headers">Headers JSON</label>
            <textarea id="headers" name="headers" spellcheck="false" placeholder='{"X-Provider": "value"}'></textarea>
          </div>
          <div class="field">
            <label for="extra">Extra Request JSON</label>
            <textarea id="extra" name="extra" spellcheck="false" placeholder='{"parallel_tool_calls": false}'></textarea>
          </div>
          <div class="form-actions">
            <button class="primary" id="saveButton" type="submit" data-default-label="保存">保存</button>
            <button type="button" id="providerKeyButton">服务商密钥</button>
            <button type="button" id="duplicateButton">复制</button>
            <button class="danger" type="button" id="deleteButton">删除</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const modelList = document.getElementById('models');
    const discoveredList = document.getElementById('discovered');
    const form = document.getElementById('form');
    const statusEl = document.getElementById('status');
    const saveButton = document.getElementById('saveButton');
    const fields = Object.fromEntries([...form.elements].filter((el) => el.name).map((el) => [el.name, el]));

    let models = [];
    let selectedIndex = 0;
    let discoveredProvider = '';
    let discoveredBaseUrl = '';
    let discoveredPresetId = '';
    let presets = [];
    let saveTimeoutTimer = 0;
    let saveFeedbackTimer = 0;
    let pendingActionButton = null;
    let feedbackActionButton = null;
    let pendingScrollIndex = null;
    let lastFeedbackAt = 0;

    bindAction('newButton', '添加模型', () => {
      persistCurrentForm(true);
      const model = applyModelDefaults({
        id: 'new-model',
        apiType: 'openai',
        displayName: 'New Model',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        contextLength: 128000,
        maxOutputTokens: 4096,
        vision: false,
        toolCalling: true
      });
      models.push(model);
      selectedIndex = models.length - 1;
      pendingScrollIndex = selectedIndex;
      render();
      setStatus('已添加草稿模型，点击保存后生效。');
    });

    bindAction('discoverButton', '获取模型列表', () => {
      const presetId = document.getElementById('providerPreset').value;
      const apiType = document.getElementById('discoverApiType').value;
      let provider = document.getElementById('discoverProvider').value.trim();
      const baseUrl = document.getElementById('discoverBaseUrl').value.trim();
      const apiKey = document.getElementById('discoverApiKey').value.trim();
      if (!provider || provider === 'custom' || provider === 'custom-anthropic') {
        provider = inferProviderFromBaseUrl(baseUrl);
        document.getElementById('discoverProvider').value = provider;
      }
      setStatus('正在获取模型列表...');
      vscode.postMessage({ type: 'discoverModels', presetId, apiType, provider, baseUrl, apiKey });
    });

    document.getElementById('discoverApiType').addEventListener('change', (event) => safeAction('切换接口类型', () => {
      const apiType = event.target.value;
      if (apiType === 'anthropic') {
        document.getElementById('discoverProvider').value = 'anthropic';
        document.getElementById('discoverBaseUrl').value = 'https://api.anthropic.com';
      } else {
        document.getElementById('discoverProvider').value = 'openai';
        document.getElementById('discoverBaseUrl').value = 'https://api.openai.com/v1';
      }
    }));

    document.getElementById('providerPreset').addEventListener('change', () => safeAction('切换服务商预设', () => {
      applySelectedPreset();
    }));

    bindAction('clearButton', '清空配置', () => {
      if (!confirm('确定清空所有已配置模型？')) {
        return;
      }
      models = [];
      selectedIndex = 0;
      pendingScrollIndex = null;
      render();
      requestSave(document.getElementById('clearButton'), '清空中...');
    });

    bindAction('clearDiscoveredButton', '清空候选', () => {
      discoveredList.textContent = '';
      setStatus('候选模型已清空。');
    });

    form.addEventListener('input', () => safeAction('同步表单', () => {
      syncFormToCurrentModel();
      renderList();
    }));

    fields.apiType.addEventListener('change', () => safeAction('切换模型接口类型', () => {
      applyCurrentModelDefaults(false);
    }));

    fields.provider.addEventListener('change', () => safeAction('切换模型服务商', () => {
      applyCurrentModelDefaults(false);
    }));

    fields.id.addEventListener('change', () => safeAction('切换模型 ID', () => {
      applyCurrentModelDefaults(false);
    }));

    bindAction('providerKeyButton', '服务商密钥', () => {
      const model = getCurrentFormModel();
      const provider = model.provider || currentModel()?.provider || inferProviderFromBaseUrl(model.baseUrl || currentModel()?.baseUrl || '');
      if (!provider) {
        setStatus('请先填写服务商，或填写可识别服务商的 Base URL。', true);
        return;
      }
      setStatus('正在打开 ' + provider + ' 的密钥输入框...');
      vscode.postMessage({ type: 'setProviderApiKey', provider });
    });

    bindAction('duplicateButton', '复制模型', () => {
      if (!models[selectedIndex]) {
        setStatus('没有可复制的模型。', true);
        return;
      }
      if (!persistCurrentForm(false)) {
        return;
      }
      const model = { ...models[selectedIndex] };
      model.configId = model.configId ? model.configId + '-copy' : 'copy';
      model.displayName = model.displayName ? model.displayName + ' Copy' : model.id + ' Copy';
      models.splice(selectedIndex + 1, 0, model);
      selectedIndex += 1;
      pendingScrollIndex = selectedIndex;
      render();
      setStatus('正在复制并保存 ' + (model.displayName || model.id) + '...');
      requestSave(document.getElementById('duplicateButton'), '保存中...');
    });

    bindAction('deleteButton', '删除模型', () => {
      if (models.length === 0) {
        setStatus('没有可删除的模型。', true);
        return;
      }
      const removed = models[selectedIndex];
      models.splice(selectedIndex, 1);
      selectedIndex = Math.max(0, selectedIndex - 1);
      pendingScrollIndex = selectedIndex;
      render();
      setStatus('正在删除并保存 ' + ((removed && (removed.displayName || removed.id)) || '模型') + '...');
      requestSave(document.getElementById('deleteButton'), '删除中...');
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      safeAction('保存模型', () => {
        const model = getCurrentFormModel();
        const validation = validateModel(model);
        if (validation) {
          setStatus(validation, true);
          settlePendingAction('error');
          return;
        }
        models[selectedIndex] = getStorageModelFromForm(model, models[selectedIndex]);
        requestSave(saveButton, '保存中...');
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        models = Array.isArray(message.models) ? message.models : [];
        presets = Array.isArray(message.presets) ? message.presets : presets;
        renderPresetOptions();
        selectedIndex = Math.min(selectedIndex, Math.max(0, models.length - 1));
        render();
        if (Date.now() - lastFeedbackAt > 1200) {
          setStatus(models.length ? '已配置 ' + models.length + ' 个模型。' : '还没有配置模型。');
        }
      }

      if (message.type === 'discoveredModels') {
        discoveredPresetId = message.presetId || document.getElementById('providerPreset').value || '';
        discoveredProvider = message.provider || '';
        discoveredBaseUrl = message.baseUrl || '';
        document.getElementById('discoverBaseUrl').value = discoveredBaseUrl;
        document.getElementById('discoverProvider').value = discoveredProvider;
        document.getElementById('discoverApiType').value = message.apiType || 'openai';
        renderDiscovered(Array.isArray(message.models) ? message.models : []);
      }

      if (message.type === 'error') {
        lastFeedbackAt = Date.now();
        setStatus(message.message, true);
        settlePendingAction('error');
        clearSaveTimeout();
      }

      if (message.type === 'info') {
        lastFeedbackAt = Date.now();
        setStatus(message.message, false, true);
        settlePendingAction('success');
        clearSaveTimeout();
      }
    });

    vscode.postMessage({ type: 'ready' });

    function render() {
      renderList();
      renderForm();
    }

    function renderList() {
      modelList.textContent = '';
      if (models.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '还没有模型。';
        modelList.appendChild(empty);
        pendingScrollIndex = null;
        return;
      }

      models.forEach((model, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'model-row' + (index === selectedIndex ? ' active' : '');
        row.dataset.modelIndex = String(index);
        row.addEventListener('click', () => safeAction('选择模型', () => {
          selectModel(index);
        }));

        const main = document.createElement('div');
        main.className = 'model-main';
        const name = document.createElement('div');
        name.className = 'model-name';
        name.textContent = model.displayName || model.id || 'Untitled model';
        const meta = document.createElement('div');
        meta.className = 'model-meta';
        meta.textContent = [
          model.provider,
          formatTokenCount(model.contextLength),
          formatReasoningSummary(model),
          model.configId
        ].filter(Boolean).join(' · ') || '未设置服务商';
        main.append(name, meta);

        const badges = document.createElement('div');
        badges.className = 'badges';
        if (model.vision) {
          badges.appendChild(makeBadge('视', '支持视觉输入'));
        }
        if (model.toolCalling !== false) {
          badges.appendChild(makeBadge('工', '支持工具调用'));
        }
        row.append(main, badges);
        modelList.appendChild(row);
      });

      scrollPendingModelIntoView();
    }

    function renderForm() {
      const model = currentModel();
      form.style.display = model ? 'grid' : 'none';
      if (!model) {
        return;
      }

      setValue('id', model.id);
      setValue('apiType', model.apiType || 'openai');
      setValue('configId', model.configId);
      setValue('displayName', model.displayName);
      setValue('provider', model.provider);
      setValue('baseUrl', model.baseUrl);
      setValue('family', model.family);
      setValue('contextLength', model.contextLength);
      setValue('maxOutputTokens', model.maxOutputTokens);
      setValue('temperature', model.temperature);
      setValue('topP', model.topP);
      renderReasoningOptions(model);
      setValue('reasoningEffort', normalizeReasoningEffort(model.reasoningEffort));
      if (!fields.reasoningEffort.value) {
        fields.reasoningEffort.value = '';
      }
      setValue('thinkingBudgetTokens', model.thinkingBudgetTokens);
      updateThinkingBudgetVisibility(model);
      if (fields.vision) {
        fields.vision.checked = Boolean(model.vision);
      }
      if (fields.toolCalling) {
        fields.toolCalling.checked = model.toolCalling !== false;
      }
      setJson('headers', model.headers);
      setJson('extra', model.extra);
    }

    function renderDiscovered(items) {
      discoveredList.textContent = '';
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty inline';
        empty.textContent = '没有获取到模型。';
        discoveredList.appendChild(empty);
        return;
      }

      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'discovered-row';
        const name = document.createElement('div');
        name.className = 'discovered-name';
        name.textContent = item.id;
        const add = document.createElement('button');
        add.type = 'button';
        add.dataset.defaultLabel = '添加';
        add.textContent = '添加';
        add.addEventListener('click', () => safeAction('添加候选模型', () => {
          persistCurrentForm(true);
          const model = {
            id: item.id,
            apiType: document.getElementById('discoverApiType').value || 'openai',
            displayName: item.id,
            provider: discoveredProvider,
            baseUrl: discoveredBaseUrl,
            contextLength: item.contextLength,
            maxOutputTokens: item.maxOutputTokens,
            vision: Boolean(item.vision),
            toolCalling: item.toolCalling !== false
          };
          const preset = presets.find((entry) => entry.id === discoveredPresetId);
          if (preset && !preset.custom) {
            model.apiType = preset.apiType;
            model.provider = preset.provider;
            model.baseUrl = discoveredBaseUrl || preset.baseUrl;
          }
          if (item.family) {
            model.family = item.family;
          }
          const completeModel = applyModelDefaults(model);
          const existingIndex = findModelIndex(completeModel);
          if (existingIndex >= 0) {
            models[existingIndex] = { ...models[existingIndex], ...completeModel };
            selectedIndex = existingIndex;
            pendingScrollIndex = selectedIndex;
            setStatus('正在更新并保存 ' + item.id + '...');
          } else {
            models.push(completeModel);
            selectedIndex = models.length - 1;
            pendingScrollIndex = selectedIndex;
            setStatus('正在添加并保存 ' + item.id + '...');
          }
          render();
          requestSave(add, '保存中...');
        }));
        row.append(name, add);
        discoveredList.appendChild(row);
      });
    }

    function renderPresetOptions() {
      const select = document.getElementById('providerPreset');
      if (select.options.length > 0 || presets.length === 0) {
        return;
      }
      presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.label;
        select.appendChild(option);
      });
      select.value = 'openai';
      applySelectedPreset();
    }

    function applySelectedPreset() {
      const presetId = document.getElementById('providerPreset').value;
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) {
        return;
      }
      document.getElementById('discoverApiType').value = preset.apiType;
      document.getElementById('discoverProvider').value = preset.provider;
      document.getElementById('discoverBaseUrl').value = preset.baseUrl;
      const custom = Boolean(preset.custom);
      document.getElementById('discoverApiType').disabled = !custom;
      document.getElementById('discoverProvider').disabled = !custom;
      document.getElementById('discoverBaseUrl').disabled = !custom;
      discoveredPresetId = preset.id;
      discoveredList.textContent = '';
    }

    function currentModel() {
      return models[selectedIndex];
    }

    function selectModel(index) {
      if (index < 0 || index >= models.length) {
        return;
      }
      persistCurrentForm(true);
      selectedIndex = index;
      pendingScrollIndex = index;
      render();
    }

    function syncFormToCurrentModel() {
      if (!models[selectedIndex]) {
        return;
      }
      models[selectedIndex] = getStorageModelFromForm(getCurrentFormModel(), models[selectedIndex]);
    }

    function persistCurrentForm(allowInvalidJson) {
      if (!models[selectedIndex] || form.style.display === 'none') {
        return true;
      }

      const model = getCurrentFormModel();
      const validation = validateModel(model);
      if (validation && !allowInvalidJson) {
        setStatus(validation, true);
        return false;
      }

      models[selectedIndex] = getStorageModelFromForm(model, models[selectedIndex]);
      return true;
    }

    function getCurrentFormModel() {
      const model = {
        id: stringValue('id'),
        apiType: stringValue('apiType') || 'openai',
        configId: stringValue('configId'),
        displayName: stringValue('displayName'),
        provider: stringValue('provider'),
        baseUrl: stringValue('baseUrl'),
        family: stringValue('family'),
        contextLength: numberValue('contextLength'),
        maxOutputTokens: numberValue('maxOutputTokens'),
        vision: Boolean(fields.vision && fields.vision.checked),
        toolCalling: fields.toolCalling ? fields.toolCalling.checked : true,
        temperature: numberValue('temperature'),
        topP: numberValue('topP'),
        reasoningEffort: normalizeReasoningEffort(stringValue('reasoningEffort')),
        thinkingBudgetTokens: numberValue('thinkingBudgetTokens'),
        headers: parseJsonField('headers'),
        extra: parseJsonField('extra')
      };
      return cleanObject(model);
    }

    function validateModel(model) {
      if (!model.id) {
        return '模型 ID 必填。';
      }
      if (model.headers === false) {
        return 'Headers JSON 格式不正确。';
      }
      if (model.extra === false) {
        return 'Extra Request JSON 格式不正确。';
      }
      return '';
    }

    function findModelIndex(model) {
      return models.findIndex((item) => {
        return item.id === model.id && (item.configId || '') === (model.configId || '') && (item.provider || '') === (model.provider || '');
      });
    }

    function cleanObject(model) {
      const cleaned = {};
      Object.entries(model).forEach(([key, value]) => {
        if (value === '' || value === undefined) {
          return;
        }
        if (value && typeof value === 'object' && Object.keys(value).length === 0) {
          return;
        }
        cleaned[key] = value;
      });
      return cleaned;
    }

    function getStorageModelFromForm(model, existing) {
      const next = { ...model };
      if (!next.id && existing && existing.id) {
        next.id = existing.id;
      }
      if (next.headers === false) {
        delete next.headers;
        if (existing && existing.headers) {
          next.headers = existing.headers;
        }
      }
      if (next.extra === false) {
        delete next.extra;
        if (existing && existing.extra) {
          next.extra = existing.extra;
        }
      }
      return cleanObject(next);
    }

    function applyModelDefaults(model) {
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
        thinkingBudgetTokens: model.thinkingBudgetTokens ?? defaults.thinkingBudgetTokens
      };
    }

    function applyCurrentModelDefaults(force) {
      const current = getCurrentFormModel();
      if (!current.id) {
        return;
      }

      const defaults = inferModelDefaults(current);
      const next = { ...current };
      const optionalFields = ['family', 'contextLength', 'maxOutputTokens', 'reasoningEffort', 'thinkingBudgetTokens'];
      optionalFields.forEach((key) => {
        if ((force || next[key] === undefined || next[key] === '') && defaults[key] !== undefined) {
          next[key] = defaults[key];
        }
      });

      if ((force || fields.vision && !fields.vision.checked) && defaults.vision !== undefined) {
        next.vision = Boolean(defaults.vision);
      }
      if ((force || fields.toolCalling && fields.toolCalling.checked) && defaults.toolCalling !== undefined) {
        next.toolCalling = Boolean(defaults.toolCalling);
      }

      models[selectedIndex] = getStorageModelFromForm(next, models[selectedIndex]);
      renderForm();
      renderList();
    }

    function renderReasoningOptions(model) {
      const select = fields.reasoningEffort;
      if (!select) {
        return;
      }

      const previous = normalizeReasoningEffort(select.value || model.reasoningEffort);
      select.textContent = '';
      reasoningOptionsFor(model).forEach((option) => {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        select.appendChild(element);
      });

      if ([...select.options].some((option) => option.value === previous)) {
        select.value = previous;
      } else {
        select.value = '';
      }

      updateThinkingBudgetVisibility(model);
    }

    function reasoningOptionsFor(model) {
      const provider = String(model.provider || '').toLowerCase();
      const id = String(model.id || '').toLowerCase();
      const apiType = model.apiType || 'openai';
      const defaults = inferModelDefaults(model);
      const options = [{ value: '', label: '服务商默认' }];

      if (apiType === 'anthropic' || provider.includes('anthropic') || id.startsWith('claude-')) {
        return options;
      }

      if (provider.includes('deepseek') || id.startsWith('deepseek-')) {
        if (id.startsWith('deepseek-v4')) {
          options.push(
            { value: 'high', label: '高' },
            { value: 'max', label: '最高' }
          );
        }
        return options;
      }

      if (provider.includes('gemini') || id.startsWith('gemini-')) {
        options.push(
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' }
        );
        return options;
      }

      if (provider.includes('xai') || id.startsWith('grok-')) {
        options.push(
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' }
        );
        return options;
      }

      if (defaults.reasoningEffort || id.startsWith('gpt-5') || /^o[134]/.test(id)) {
        options.push(
          { value: 'minimal', label: 'Minimal' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' }
        );
        return options;
      }

      return options;
    }

    function updateThinkingBudgetVisibility(model) {
      const field = document.getElementById('thinkingBudgetField');
      if (!field) {
        return;
      }

      const provider = String(model.provider || '').toLowerCase();
      const id = String(model.id || '').toLowerCase();
      const isAnthropic = model.apiType === 'anthropic' || provider.includes('anthropic') || id.startsWith('claude-');
      const supportsThinking = Boolean(inferModelDefaults(model).thinkingBudgetTokens);
      field.style.display = isAnthropic && supportsThinking ? 'grid' : 'none';
    }

    function formatReasoningSummary(model) {
      if (model.thinkingBudgetTokens) {
        return 'thinking ' + formatTokenCount(model.thinkingBudgetTokens);
      }
      if (model.reasoningEffort) {
        return 'reasoning ' + normalizeReasoningEffort(model.reasoningEffort);
      }
      return '';
    }

    function formatTokenCount(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '';
      }
      if (value >= 1000000) {
        return (Math.round(value / 100000) / 10) + 'M';
      }
      if (value >= 1000) {
        return Math.round(value / 1000) + 'K';
      }
      return String(value);
    }

    function inferModelDefaults(model) {
      const id = String(model.id || '').toLowerCase();
      const provider = String(model.provider || '').toLowerCase();
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
          reasoningEffort: id.includes('reasoning') ? 'medium' : undefined
        };
      }
      if (provider.includes('zai') || provider.includes('glm') || id.startsWith('glm-')) {
        return {
          family: 'glm',
          contextLength: 128000,
          maxOutputTokens: 8192,
          vision: id.includes('v'),
          toolCalling: true
        };
      }

      return {
        contextLength: 128000,
        maxOutputTokens: 4096,
        toolCalling: true
      };
    }

    function findPresetModel(normalizedId, normalizedProvider, apiType) {
      for (const preset of presets) {
        if (preset.custom) {
          continue;
        }
        if (apiType && preset.apiType !== apiType) {
          continue;
        }
        if (normalizedProvider && preset.provider !== normalizedProvider) {
          continue;
        }
        const match = (preset.fallbackModels || []).find((entry) => String(entry.id || '').toLowerCase() === normalizedId);
        if (match) {
          return match;
        }
      }
      return undefined;
    }

    function inferOpenAIDefaults(id) {
      if (id.startsWith('gpt-5') || /^o[134]/.test(id)) {
        return {
          family: id.includes('codex') ? 'gpt-5-codex' : 'gpt-5',
          contextLength: 400000,
          maxOutputTokens: 128000,
          vision: true,
          toolCalling: true,
          reasoningEffort: 'medium'
        };
      }
      if (id.startsWith('gpt-4.1')) {
        return {
          family: 'gpt-4',
          contextLength: 1048576,
          maxOutputTokens: 32768,
          vision: true,
          toolCalling: true
        };
      }
      return {
        family: id.startsWith('gpt-4o') ? 'gpt-4o' : 'gpt-4',
        contextLength: 128000,
        maxOutputTokens: 16384,
        vision: true,
        toolCalling: true
      };
    }

    function inferClaudeDefaults(id) {
      const supportsThinking = id.includes('opus-4') || id.includes('sonnet-4') || id.includes('3-7-sonnet');
      return {
        family: 'claude',
        contextLength: 200000,
        maxOutputTokens: id.includes('haiku') ? 8192 : id.includes('sonnet') ? 64000 : 32000,
        vision: true,
        toolCalling: true,
        thinkingBudgetTokens: supportsThinking ? 8192 : undefined
      };
    }

    function inferDeepSeekDefaults(id) {
      const v4 = id.includes('v4');
      return {
        family: 'deepseek',
        contextLength: v4 ? 1048576 : 64000,
        maxOutputTokens: 8192,
        vision: false,
        toolCalling: !id.includes('reasoner'),
        reasoningEffort: v4 ? 'high' : undefined
      };
    }

    function inferGeminiDefaults(id) {
      return {
        family: 'gemini',
        contextLength: 1048576,
        maxOutputTokens: 65536,
        vision: true,
        toolCalling: true,
        reasoningEffort: id.includes('pro') || id.includes('flash') ? 'medium' : undefined
      };
    }

    function setValue(name, value) {
      const field = fields[name];
      if (!field) {
        return;
      }
      field.value = value ?? '';
    }

    function stringValue(name) {
      const field = fields[name];
      return String((field && field.value) || '').trim();
    }

    function numberValue(name) {
      const field = fields[name];
      const value = String((field && field.value) || '').trim();
      if (!value) {
        return undefined;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    function setJson(name, value) {
      const field = fields[name];
      if (!field) {
        return;
      }
      field.value = value ? JSON.stringify(value, null, 2) : '';
    }

    function parseJsonField(name) {
      const field = fields[name];
      const value = String((field && field.value) || '').trim();
      if (!value) {
        return undefined;
      }
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : false;
      } catch {
        return false;
      }
    }

    function makeBadge(text, title) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = text;
      badge.title = title;
      return badge;
    }

    function setStatus(message, error = false, success = false) {
      statusEl.textContent = message || '';
      statusEl.classList.toggle('error', Boolean(error));
      statusEl.classList.toggle('success', Boolean(success));
    }

    function bindAction(id, label, handler) {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }
      element.addEventListener('click', () => safeAction(label, handler));
    }

    function safeAction(label, handler) {
      try {
        handler();
      } catch (error) {
        console.error(label + ' failed.', error);
        clearSaveTimeout();
        settlePendingAction('error');
        setStatus(label + '失败：' + errorMessage(error), true);
      }
    }

    function errorMessage(error) {
      return error && error.message ? String(error.message) : String(error);
    }

    function requestSave(button, busyLabel) {
      beginPendingAction(button, busyLabel || '保存中...');
      startSaveTimeout();
      vscode.postMessage({ type: 'saveModels', models });
    }

    function beginPendingAction(button, busyLabel) {
      if (!button) {
        return;
      }

      if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent || '';
      }

      if (feedbackActionButton) {
        restorePendingActionButton(feedbackActionButton);
        feedbackActionButton = null;
      }

      if (pendingActionButton && pendingActionButton !== button) {
        restorePendingActionButton(pendingActionButton);
      }

      window.clearTimeout(saveFeedbackTimer);
      saveFeedbackTimer = 0;
      pendingActionButton = button;
      button.disabled = true;
      button.classList.remove('saved');
      button.textContent = busyLabel;
    }

    function settlePendingAction(kind) {
      if (!pendingActionButton) {
        return;
      }

      const button = pendingActionButton;
      const defaultLabel = button.dataset.defaultLabel || button.textContent || '';
      const label = kind === 'success'
        ? '已' + defaultLabel
        : defaultLabel + (kind === 'timeout' ? '超时' : '失败');

      pendingActionButton = null;
      feedbackActionButton = button;
      button.disabled = false;
      button.textContent = label;
      button.classList.toggle('saved', kind === 'success');
      window.clearTimeout(saveFeedbackTimer);
      saveFeedbackTimer = 0;
      saveFeedbackTimer = window.setTimeout(() => {
        button.textContent = defaultLabel;
        button.classList.remove('saved');
        if (feedbackActionButton === button) {
          feedbackActionButton = null;
        }
      }, kind === 'success' ? 1600 : 1200);
    }

    function startSaveTimeout() {
      clearSaveTimeout();
      saveTimeoutTimer = window.setTimeout(() => {
        setStatus('保存仍未返回结果，请重载窗口或查看日志。', true);
        settlePendingAction('timeout');
      }, 8000);
    }

    function clearSaveTimeout() {
      if (saveTimeoutTimer) {
        window.clearTimeout(saveTimeoutTimer);
        saveTimeoutTimer = 0;
      }
    }

    function restorePendingActionButton(button) {
      if (!button) {
        return;
      }

      window.clearTimeout(saveFeedbackTimer);
      saveFeedbackTimer = 0;
      if (feedbackActionButton === button) {
        feedbackActionButton = null;
      }
      button.disabled = false;
      button.textContent = button.dataset.defaultLabel || button.textContent || '';
      button.classList.remove('saved');
    }

    function scrollPendingModelIntoView() {
      if (pendingScrollIndex === null) {
        return;
      }

      const row = modelList.querySelector('[data-model-index="' + pendingScrollIndex + '"]');
      pendingScrollIndex = null;
      if (row && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest' });
      }
    }

    function normalizeReasoningEffort(value) {
      return value || '';
    }

    function inferProviderFromBaseUrl(baseUrl) {
      try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        if (hostname === 'api.openai.com') {
          return 'openai';
        }
        if (hostname === 'api.anthropic.com') {
          return 'anthropic';
        }
        const parts = hostname.split('.').filter(Boolean);
        const provider = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');
        return normalizeProviderName(provider);
      } catch {
        return '';
      }
    }

    function normalizeProviderName(value) {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) {
        return '';
      }
      if (normalized === 'xtokenmirror') {
        return 'xtoken';
      }
      return normalized;
    }
  </script>
</body>
</html>`;
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

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function normalizeReasoningEffort(value: string | undefined): string | undefined {
  return value;
}

function normalizeApiType(value: string | undefined): ApiType | undefined {
  if (value === 'anthropic') {
    return 'anthropic';
  }
  if (value === 'openai' || value === 'openai-compatible') {
    return 'openai';
  }
  return undefined;
}
