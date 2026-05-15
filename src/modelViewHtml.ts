import * as vscode from 'vscode';

export function renderModelManagerHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All in Copilot 模型管理</title>
  <style>
    :root {
      color-scheme: light dark;
      --border: color-mix(in srgb, var(--vscode-sideBarSectionHeader-border) 78%, transparent);
      --muted: var(--vscode-descriptionForeground);
      --focus: var(--vscode-focusBorder);
      --surface: color-mix(in srgb, var(--vscode-editor-background) 78%, var(--vscode-sideBar-background));
      --surface-strong: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-sideBar-background));
      --surface-hover: color-mix(in srgb, var(--vscode-list-hoverBackground) 82%, var(--vscode-editor-background));
      --danger: var(--vscode-errorForeground);
      --ok: var(--vscode-testing-iconPassed);
      --warn: var(--vscode-testing-iconQueued);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      min-height: 28px;
      padding: 4px 9px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      cursor: pointer;
      white-space: nowrap;
    }

    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    button:disabled {
      cursor: default;
      opacity: 0.68;
    }

    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.saved {
      color: var(--vscode-button-foreground);
      background: var(--vscode-testing-iconPassed);
    }

    button.danger {
      color: var(--danger);
    }

    button.confirming {
      border-color: var(--danger);
      color: var(--danger);
    }

    input,
    select,
    textarea {
      width: 100%;
      min-height: 28px;
      padding: 4px 7px;
      border: 1px solid var(--vscode-input-border, transparent);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      outline: none;
    }

    input:focus,
    select:focus,
    textarea:focus {
      border-color: var(--focus);
    }

    label {
      color: var(--muted);
      font-size: 12px;
    }

    [hidden] {
      display: none !important;
    }

    .root {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .header {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--border);
      background: var(--vscode-sideBar-background);
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 7px;
      padding: 10px;
    }

    .detail-toolbar {
      grid-template-columns: auto 1fr auto;
      align-items: center;
    }

    .title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .status {
      min-height: 28px;
      padding: 6px 10px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    .status.error {
      color: var(--danger);
    }

    .status.success {
      color: var(--vscode-testing-iconPassed);
    }

    main {
      min-height: 0;
      overflow: auto;
    }

    .view {
      padding: 10px;
    }

    .section-head {
      display: grid;
      gap: 3px;
      margin-bottom: 9px;
    }

    .section-title {
      font-weight: 600;
    }

    .section-subtitle {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }

    .provider-list {
      display: grid;
      gap: 7px;
    }

    .provider-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
      padding: 9px;
      border: 1px solid var(--border);
      border-left: 3px solid color-mix(in srgb, var(--focus) 72%, transparent);
      border-radius: 6px;
      background: var(--surface);
      cursor: pointer;
    }

    .provider-row:hover {
      background: var(--surface-hover);
    }

    .provider-icon {
      width: 34px;
      height: 34px;
      display: inline-grid;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--focus) 42%, var(--border));
      border-radius: 8px;
      color: var(--vscode-button-foreground);
      background: color-mix(in srgb, var(--focus) 28%, transparent);
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .provider-main {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .provider-name,
    .model-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .provider-meta,
    .model-meta,
    .hint {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-size: 12px;
    }

    .metric-row {
      display: flex;
      gap: 5px;
      align-items: center;
      flex-wrap: wrap;
    }

    .latency {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 2px 7px;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
    }

    .latency.good {
      border-color: color-mix(in srgb, var(--ok) 48%, transparent);
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 10%, transparent);
    }

    .latency.warn {
      border-color: color-mix(in srgb, var(--warn) 52%, transparent);
      color: var(--warn);
      background: color-mix(in srgb, var(--warn) 10%, transparent);
    }

    .latency.bad {
      border-color: color-mix(in srgb, var(--danger) 52%, transparent);
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 10%, transparent);
    }

    .provider-actions {
      display: grid;
      align-content: start;
      gap: 5px;
    }

    .empty {
      padding: 18px 10px;
      border: 1px dashed var(--border);
      border-radius: 4px;
      color: var(--muted);
      text-align: center;
      line-height: 1.45;
    }

    .form {
      display: grid;
      gap: 10px;
    }

    .panel {
      display: grid;
      gap: 9px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface);
    }

    .field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .provider-combobox {
      position: relative;
      min-width: 0;
    }

    .provider-preset-list {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 2px);
      z-index: 20;
      max-height: 260px;
      overflow: auto;
      padding: 4px;
      border: 1px solid var(--vscode-dropdown-border, var(--border));
      border-radius: 4px;
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      box-shadow: 0 8px 24px color-mix(in srgb, #000 34%, transparent);
    }

    .provider-preset-option,
    .provider-preset-empty {
      min-height: 28px;
      padding: 5px 8px;
      border-radius: 3px;
      line-height: 18px;
    }

    .provider-preset-option {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 4px;
      align-items: center;
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      cursor: pointer;
    }

    .provider-preset-option:hover,
    .provider-preset-option.active {
      background: var(--vscode-list-hoverBackground);
    }

    .provider-preset-option.selected {
      color: var(--vscode-list-activeSelectionForeground, var(--vscode-button-foreground));
      background: var(--vscode-list-activeSelectionBackground, var(--vscode-button-background));
    }

    .provider-preset-check {
      color: currentColor;
      text-align: center;
    }

    .provider-preset-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .provider-preset-empty {
      color: var(--muted);
    }

    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
    }

    .provider-form-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 9px;
    }

    .inline-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px;
      align-items: end;
    }

    .button-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }

    .button-row.three {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .button-row.compact {
      grid-template-columns: 1fr;
    }

    .catalog-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 7px;
      align-items: center;
    }

    .catalog-list {
      display: grid;
      gap: 6px;
    }

    .model-card {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface-strong);
      overflow: hidden;
    }

    .model-top {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      padding: 8px;
    }

    .model-top input[type="checkbox"] {
      width: auto;
      min-height: auto;
    }

    .model-badges {
      display: flex;
      gap: 4px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: end;
    }

    .badge {
      display: inline-grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      border: 1px solid var(--border);
      border-radius: 3px;
      color: var(--muted);
      font-size: 11px;
    }

    .advanced {
      display: grid;
      gap: 8px;
      padding: 8px;
      border-top: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface) 72%, var(--vscode-sideBar-background));
    }

    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
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

    @media (max-width: 290px) {
      .toolbar,
      .detail-toolbar,
      .split,
      .provider-form-grid,
      .button-row,
      .inline-actions,
      .catalog-head {
        grid-template-columns: 1fr;
      }

      .provider-row,
      .model-top {
        grid-template-columns: 1fr;
      }

      .provider-actions {
        grid-template-columns: 1fr 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="root">
    <header class="header">
      <div class="toolbar" id="listToolbar">
        <button class="primary" id="newProviderButton" type="button">新建供应商</button>
        <button id="clearAllButton" type="button" data-default-label="清空配置">清空配置</button>
      </div>
      <div class="toolbar detail-toolbar" id="detailToolbar" hidden>
        <button id="backButton" type="button">返回</button>
        <div class="title" id="detailTitle">供应商</div>
        <button class="danger" id="deleteProviderButton" type="button" data-default-label="删除供应商">删除供应商</button>
      </div>
      <div class="status" id="status" role="status" aria-live="polite">正在读取配置...</div>
    </header>

    <main>
      <section class="view" id="providerListView">
        <div class="section-head">
          <div class="section-title">供应商</div>
          <div class="section-subtitle">先创建供应商，再在详情里选择允许出现在 Copilot Chat 的模型。</div>
        </div>
        <div class="provider-list" id="providerList"></div>
      </section>

      <section class="view" id="providerDetailView" hidden>
        <div class="form">
          <section class="panel">
            <input id="provider" type="hidden">
            <select id="apiType" hidden>
              <option value="openai">OpenAI API 兼容</option>
              <option value="openai-responses">OpenAI Responses API 兼容</option>
              <option value="anthropic">Claude API 兼容</option>
              <option value="gemini">Google Gemini API 兼容</option>
            </select>
            <div class="provider-form-grid">
              <div class="field">
                <label for="providerPresetSearch">服务商预设</label>
                <select id="providerPreset" hidden tabindex="-1" aria-hidden="true"></select>
                <div class="provider-combobox" id="providerPresetCombo">
                  <input id="providerPresetSearch" placeholder="搜索并选择服务商..." autocomplete="off" role="combobox" aria-expanded="false" aria-controls="providerPresetList" aria-autocomplete="list">
                  <div class="provider-preset-list" id="providerPresetList" role="listbox" hidden></div>
                </div>
              </div>
              <div class="field" id="apiTypeField" hidden>
                <label for="apiTypeSelect">API 接口</label>
                <select id="apiTypeSelect">
                  <option value="openai">OpenAI API 兼容</option>
                  <option value="openai-responses">OpenAI Responses API 兼容</option>
                  <option value="anthropic">Claude API 兼容</option>
                  <option value="gemini">Google Gemini API 兼容</option>
                </select>
              </div>
              <div class="field">
                <label for="apiKey">API Key</label>
                <input id="apiKey" type="password" placeholder="留空则使用已保存密钥">
              </div>
              <div class="field">
                <label for="baseUrl">Base URL</label>
                <input id="baseUrl" placeholder="https://api.openai.com/v1">
              </div>
              <div class="field" id="testModelField" hidden>
                <label for="testModel">测试模型</label>
                <select id="testModel"></select>
              </div>
            </div>
            <div class="latency" id="testResult">未测试</div>
            <div class="button-row compact">
              <button id="discoverModelsButton" type="button" data-default-label="获取模型列表">获取模型列表</button>
              <button id="testProviderButton" type="button" data-default-label="测试连通">测试连通</button>
              <button class="primary" id="saveProviderButton" type="button" data-default-label="保存供应商">保存供应商</button>
            </div>
          </section>

          <section class="panel" id="catalogPanel" hidden>
            <div class="catalog-head">
              <div>
                <div class="section-title">允许的模型</div>
                <div class="section-subtitle" id="modelCount">选择要出现在模型选择器里的模型。</div>
              </div>
              <button id="selectAllButton" type="button">全选</button>
              <button id="selectNoneButton" type="button">全不选</button>
            </div>
            <div class="inline-actions">
              <div class="field">
                <label for="manualModelId">手动添加模型 ID</label>
                <input id="manualModelId" placeholder="gpt-5.5">
              </div>
              <button id="addManualModelButton" type="button">添加</button>
            </div>
            <div class="catalog-list" id="catalogList"></div>
          </section>
        </div>
      </section>
    </main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const els = {
      listToolbar: document.getElementById('listToolbar'),
      detailToolbar: document.getElementById('detailToolbar'),
      providerListView: document.getElementById('providerListView'),
      providerDetailView: document.getElementById('providerDetailView'),
      providerList: document.getElementById('providerList'),
      catalogList: document.getElementById('catalogList'),
      status: document.getElementById('status'),
      detailTitle: document.getElementById('detailTitle'),
      providerPreset: document.getElementById('providerPreset'),
      providerPresetCombo: document.getElementById('providerPresetCombo'),
      providerPresetSearch: document.getElementById('providerPresetSearch'),
      providerPresetList: document.getElementById('providerPresetList'),
      apiTypeField: document.getElementById('apiTypeField'),
      apiTypeSelect: document.getElementById('apiTypeSelect'),
      apiType: document.getElementById('apiType'),
      provider: document.getElementById('provider'),
      baseUrl: document.getElementById('baseUrl'),
      apiKey: document.getElementById('apiKey'),
      testModelField: document.getElementById('testModelField'),
      testModel: document.getElementById('testModel'),
      testResult: document.getElementById('testResult'),
      catalogPanel: document.getElementById('catalogPanel'),
      modelCount: document.getElementById('modelCount'),
      manualModelId: document.getElementById('manualModelId')
    };

    let models = [];
    let presets = [];
    let draft = null;
    let activeView = 'list';
    let expandedModelKey = '';
    let suppressFieldEvents = false;
    let pendingActionButton = null;
    let feedbackActionButton = null;
    let feedbackTimer = 0;
    let responseTimer = 0;
    let lastFeedbackAt = 0;
    let clearConfirmTimer = 0;
    let providerPresetOpen = false;
    let providerPresetQuery = '';
    let providerPresetActiveIndex = -1;
    const providerCatalogCache = {};
    const testResults = {};

    bind('newProviderButton', () => openNewProvider());
    bind('backButton', () => showList());
    bind('clearAllButton', () => clearAllModels());
    bind('discoverModelsButton', () => discoverCurrentModels(document.getElementById('discoverModelsButton')));
    bind('testProviderButton', () => testCurrentProvider(document.getElementById('testProviderButton')));
    bind('saveProviderButton', () => saveCurrentProvider(document.getElementById('saveProviderButton')));
    bind('deleteProviderButton', () => deleteCurrentProvider());
    bind('selectAllButton', () => selectAllModels());
    bind('selectNoneButton', () => selectNoModels());
    bind('addManualModelButton', () => addManualModel());

    els.providerPresetSearch.addEventListener('focus', () => safeAction('打开服务商预设列表', () => openProviderPresetDropdown(true)));
    els.providerPresetSearch.addEventListener('click', () => safeAction('打开服务商预设列表', () => openProviderPresetDropdown(true)));
    els.providerPresetSearch.addEventListener('input', () => safeAction('筛选服务商预设', () => {
      providerPresetQuery = String(els.providerPresetSearch.value || '');
      providerPresetOpen = true;
      providerPresetActiveIndex = 0;
      renderProviderPresetList();
    }));
    els.providerPresetSearch.addEventListener('keydown', (event) => safeAction('操作服务商预设列表', () => handleProviderPresetKeydown(event)));
    document.addEventListener('mousedown', (event) => {
      if (!els.providerPresetCombo.contains(event.target)) {
        closeProviderPresetDropdown(true);
      }
    });
    els.apiTypeSelect.addEventListener('change', () => safeAction('切换 API 接口', () => {
      if (suppressFieldEvents || !draft) {
        return;
      }
      applyCustomApiType(els.apiTypeSelect.value);
      renderDetail();
    }));

    els.providerPreset.addEventListener('change', () => safeAction('切换预设', () => {
      if (suppressFieldEvents || !draft) {
        return;
      }
      const preset = findPreset(els.providerPreset.value);
      if (!preset) {
        return;
      }
      draft.presetId = preset.id;
      draft.apiType = preset.apiType;
      draft.provider = preset.provider;
      draft.baseUrl = preset.baseUrl;
      if (preset.custom) {
        applyCustomApiType(preset.apiType || 'openai');
      }
      draft.testModelId = (preset.fallbackModels && preset.fallbackModels[0] && preset.fallbackModels[0].id) || '';
      draft.catalog = [];
      draft.configs = {};
      draft.selectedKeys.clear();
      expandedModelKey = '';
      renderDetail();
    }));

    ['apiType', 'provider', 'baseUrl', 'apiKey', 'testModel'].forEach((id) => {
      els[id].addEventListener('input', () => safeAction('同步供应商字段', () => {
        if (suppressFieldEvents || !draft) {
          return;
        }
        syncDraftFromFields();
        if (id === 'apiType' || id === 'provider') {
          renderCatalog();
        }
        updateDetailTitle();
      }));
      els[id].addEventListener('change', () => safeAction('同步供应商字段', () => {
        if (suppressFieldEvents || !draft) {
          return;
        }
        syncDraftFromFields();
        renderDetail();
      }));
    });

    window.addEventListener('message', (event) => {
      const message = event.data || {};

      if (message.type === 'state') {
        models = Array.isArray(message.models) ? message.models : [];
        presets = Array.isArray(message.presets) ? message.presets : presets;
        renderPresetOptions();
        if (activeView === 'list') {
          renderProviderList();
        }
        if (Date.now() - lastFeedbackAt > 1200) {
          const count = providerGroups().length;
          setStatus(count ? '已配置 ' + count + ' 个供应商。' : '还没有供应商，点击“新建供应商”开始。');
        }
      }

      if (message.type === 'discoveredModels' || message.type === 'providerModels') {
        mergeDiscoveredModels(message);
      }

      if (message.type === 'providerTestResult') {
        const providerKey = normalizeProviderKey(message.provider);
        if (providerKey) {
          testResults[providerKey] = {
            modelId: message.modelId,
            elapsedMs: Number(message.elapsedMs),
            at: Date.now()
          };
        }
        if (draft && (!draft.originalProviderKey || draft.originalProviderKey === providerKey || providerFromDraft() === providerKey)) {
          draft.provider = message.provider || draft.provider;
          draft.apiType = message.apiType || draft.apiType;
          draft.baseUrl = message.baseUrl || draft.baseUrl;
          draft.testModelId = message.modelId || draft.testModelId;
          renderDetail();
        }
      }

      if (message.type === 'error') {
        lastFeedbackAt = Date.now();
        setStatus(message.message, true);
        settlePendingAction('error');
        clearResponseTimer();
      }

      if (message.type === 'info') {
        lastFeedbackAt = Date.now();
        setStatus(message.message, false, true);
        settlePendingAction('success');
        clearResponseTimer();
      }
    });

    vscode.postMessage({ type: 'ready' });

    function render() {
      els.listToolbar.hidden = activeView !== 'list';
      els.detailToolbar.hidden = activeView !== 'detail';
      els.providerListView.hidden = activeView !== 'list';
      els.providerDetailView.hidden = activeView !== 'detail';
      if (activeView === 'list') {
        renderProviderList();
      } else {
        renderDetail();
      }
    }

    function renderProviderList() {
      els.providerList.textContent = '';
      const groups = providerGroups();
      if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '还没有供应商。新建后，在详情里测试接口并选择允许的模型。';
        els.providerList.appendChild(empty);
        return;
      }

      groups.forEach((group) => {
        const row = document.createElement('div');
        row.className = 'provider-row';
        row.tabIndex = 0;
        row.addEventListener('click', () => openProvider(group.key));
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openProvider(group.key);
          }
        });

        const icon = document.createElement('div');
        icon.className = 'provider-icon';
        icon.textContent = providerIconText(group);
        icon.title = group.apiTypeLabel;
        const main = document.createElement('div');
        main.className = 'provider-main';
        const name = document.createElement('div');
        name.className = 'provider-name';
        name.textContent = group.provider;
        const meta = document.createElement('div');
        meta.className = 'provider-meta';
        meta.textContent = group.apiTypeLabel + ' · ' + group.models.length + ' 个模型';
        const metrics = document.createElement('div');
        metrics.className = 'metric-row';
        const base = document.createElement('div');
        base.className = 'provider-meta';
        base.textContent = group.baseUrl || '未设置 Base URL';
        metrics.appendChild(base);
        main.append(name, meta, metrics);

        const actions = document.createElement('div');
        actions.className = 'provider-actions';
        const test = document.createElement('button');
        test.type = 'button';
        test.dataset.defaultLabel = '测试';
        test.textContent = '测试';
        test.addEventListener('click', (event) => {
          event.stopPropagation();
          testProvider(group, test);
        });
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = '配置';
        edit.addEventListener('click', (event) => {
          event.stopPropagation();
          openProvider(group.key);
        });
        actions.append(test, edit);
        row.append(icon, main, actions);
        els.providerList.appendChild(row);
      });
    }

    function renderDetail() {
      if (!draft) {
        showList();
        return;
      }

      renderPresetOptions();
      suppressFieldEvents = true;
      els.providerPreset.value = draft.presetId || '';
      els.apiType.value = draft.apiType || 'openai';
      els.apiTypeSelect.value = draft.apiType || 'openai';
      els.apiTypeField.hidden = !isCustomPreset(draft.presetId);
      els.provider.value = draft.provider || '';
      els.baseUrl.value = draft.baseUrl || '';
      els.apiKey.value = draft.apiKey || '';
      suppressFieldEvents = false;

      syncProviderPresetInput();
      renderProviderPresetList();
      updateDetailTitle();
      renderTestResult();
      renderCatalog();
    }

    function renderCatalog() {
      if (!draft) {
        return;
      }

      const items = getCatalogItems();
      els.catalogList.textContent = '';
      renderTestModelOptions(items);
      updateModelCount(items.length);

      if (items.length === 0) {
        els.catalogPanel.hidden = true;
        return;
      }

      els.catalogPanel.hidden = false;
      items.forEach((item) => {
        const key = modelKey(item);
        const config = ensureModelConfig(item);
        const card = document.createElement('div');
        card.className = 'model-card';

        const top = document.createElement('div');
        top.className = 'model-top';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = draft.selectedKeys.has(key);
        check.addEventListener('change', () => safeAction('选择模型', () => {
          if (check.checked) {
            draft.selectedKeys.add(key);
          } else {
            draft.selectedKeys.delete(key);
          }
          updateModelCount(items.length);
        }));

        const main = document.createElement('div');
        main.className = 'provider-main';
        const name = document.createElement('div');
        name.className = 'model-name';
        name.textContent = config.id;
        const meta = document.createElement('div');
        meta.className = 'model-meta';
        meta.textContent = [
          config.family,
          formatTokenCount(config.contextLength),
          formatReasoningSummary(config)
        ].filter(Boolean).join(' · ') || '使用服务商默认参数';
        main.append(name, meta);

        const controls = document.createElement('div');
        controls.className = 'model-badges';
        if (config.vision) {
          controls.appendChild(makeBadge('视', '支持视觉输入'));
        }
        if (config.toolCalling !== false) {
          controls.appendChild(makeBadge('工', '支持工具调用'));
        }
        const latency = modelLatencyElement(config);
        if (latency) {
          controls.appendChild(latency);
        }
        const advancedButton = document.createElement('button');
        advancedButton.type = 'button';
        advancedButton.textContent = expandedModelKey === key ? '收起' : '参数';
        advancedButton.addEventListener('click', () => safeAction('切换模型参数', () => {
          expandedModelKey = expandedModelKey === key ? '' : key;
          renderCatalog();
        }));
        controls.appendChild(advancedButton);

        top.append(check, main, controls);
        card.appendChild(top);
        if (expandedModelKey === key) {
          card.appendChild(renderAdvancedModelForm(key, config));
        }
        els.catalogList.appendChild(card);
      });
    }

    function renderAdvancedModelForm(key, config) {
      const panel = document.createElement('div');
      panel.className = 'advanced';

      const nameSplit = document.createElement('div');
      nameSplit.className = 'split';
      nameSplit.append(
        makeTextField('显示名称', config.displayName || '', '例如 GPT-5.5', (value) => updateModelConfig(key, { displayName: value })),
        makeTextField('配置 ID', config.configId || '', '可选，例如 creative', (value) => updateModelConfig(key, { configId: value }))
      );

      const tokenSplit = document.createElement('div');
      tokenSplit.className = 'split';
      tokenSplit.append(
        makeNumberField('上下文', config.contextLength, '128000', (value) => updateModelConfig(key, { contextLength: value })),
        makeNumberField('最大输出', config.maxOutputTokens, '4096', (value) => updateModelConfig(key, { maxOutputTokens: value }))
      );

      panel.append(nameSplit, tokenSplit);

      if (supportsThinkingBudget(config)) {
        panel.appendChild(makeNumberField('Claude Thinking Budget', config.thinkingBudgetTokens, '8192', (value) => updateModelConfig(key, { thinkingBudgetTokens: value })));
      } else {
        panel.appendChild(makeSelectField('推理强度', config.reasoningEffort || '', reasoningOptionsFor(config), (value) => updateModelConfig(key, { reasoningEffort: value })));
      }

      const checks = document.createElement('div');
      checks.className = 'checks';
      checks.append(
        makeCheckField('视觉', config.vision === true, (value) => updateModelConfig(key, { vision: value })),
        makeCheckField('工具调用', config.toolCalling !== false, (value) => updateModelConfig(key, { toolCalling: value }))
      );
      panel.appendChild(checks);
      return panel;
    }

    function mergeDiscoveredModels(message) {
      const providerKey = normalizeProviderKey(message.provider);
      const discovered = Array.isArray(message.models) ? message.models : [];
      if (providerKey) {
        providerCatalogCache[providerKey] = discovered;
      }
      if (draft) {
        const draftKey = normalizeProviderKey(draft.provider);
        if (!draftKey || draftKey === providerKey || !draft.originalProviderKey) {
          draft.provider = message.provider || draft.provider;
          draft.apiType = message.apiType || draft.apiType;
          draft.baseUrl = message.baseUrl || draft.baseUrl;
          if (isCustomPreset(draft.presetId)) {
            draft.provider = customProviderForApiType(draft.apiType);
          }
          draft.catalog = mergeCatalog(draft.catalog, discovered);
          if (discovered[0]) {
            draft.testModelId = discovered[0].id;
          }
          renderDetail();
        }
      }
    }

    function renderTestModelOptions(items) {
      if (!draft) {
        return;
      }
      const previous = draft.testModelId || els.testModel.value || '';
      els.testModel.textContent = '';
      els.testModelField.hidden = items.length === 0;
      document.getElementById('testProviderButton').hidden = items.length === 0;
      items.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.id;
        els.testModel.appendChild(option);
      });
      if (previous && items.some((item) => item.id === previous)) {
        els.testModel.value = previous;
        draft.testModelId = previous;
      } else if (items[0]) {
        els.testModel.value = items[0].id;
        draft.testModelId = items[0].id;
      } else {
        draft.testModelId = '';
      }
    }

    function renderTestResult() {
      if (!draft) {
        return;
      }
      const key = providerFromDraft();
      const result = testResults[key];
      const badge = latencyElement(result);
      els.testResult.hidden = Boolean(result);
      els.testResult.className = 'latency' + (badge ? ' ' + badge.dataset.kind : '');
      els.testResult.textContent = result
        ? '连通 ' + result.elapsedMs + 'ms · ' + result.modelId
        : '未测试';
    }

    function modelLatencyElement(model) {
      const result = testResults[providerFromDraft()];
      if (!result || result.modelId !== model.id) {
        return null;
      }
      return latencyElement(result);
    }

    function latencyElement(result) {
      if (!result || typeof result.elapsedMs !== 'number' || !Number.isFinite(result.elapsedMs)) {
        return null;
      }
      const kind = result.elapsedMs <= 2000 ? 'good' : result.elapsedMs <= 5000 ? 'warn' : 'bad';
      const badge = document.createElement('span');
      badge.className = 'latency ' + kind;
      badge.dataset.kind = kind;
      badge.textContent = result.elapsedMs + 'ms';
      badge.title = result.modelId ? '测试模型：' + result.modelId : '连通耗时';
      return badge;
    }

    function openNewProvider() {
      const preset = findPreset('openai') || presets[0] || defaultPreset();
      draft = draftFromPreset(preset);
      activeView = 'detail';
      expandedModelKey = '';
      render();
      setStatus('填写供应商信息，测试接口后选择允许的模型。');
    }

    function openProvider(providerKey) {
      draft = draftFromProvider(providerKey);
      activeView = 'detail';
      expandedModelKey = '';
      render();
      setStatus('正在配置 ' + (draft.provider || '供应商') + '。');
    }

    function showList() {
      activeView = 'list';
      draft = null;
      expandedModelKey = '';
      render();
    }

    function clearAllModels() {
      const button = document.getElementById('clearAllButton');
      if (!button.classList.contains('confirming')) {
        button.classList.add('confirming');
        button.textContent = '确认清空？';
        setStatus('再次点击“确认清空？”才会删除全部供应商和模型。', true);
        window.clearTimeout(clearConfirmTimer);
        clearConfirmTimer = window.setTimeout(() => {
          button.classList.remove('confirming');
          button.textContent = button.dataset.defaultLabel || '清空配置';
        }, 5000);
        return;
      }
      window.clearTimeout(clearConfirmTimer);
      button.classList.remove('confirming');
      models = [];
      draft = null;
      activeView = 'list';
      render();
      beginPendingAction(button, '清空中...');
      startResponseTimer('清空配置仍未返回结果，请重载窗口或查看日志。');
      vscode.postMessage({ type: 'saveModels', models: [] });
    }

    function discoverCurrentModels(button) {
      if (!draft) {
        return;
      }
      syncDraftFromFields();
      const validation = validateProviderDraft(false);
      if (validation) {
        setStatus(validation, true);
        return;
      }
      beginPendingAction(button, '获取中...');
      startResponseTimer('获取模型列表仍未返回结果，请检查网络或查看日志。');
      vscode.postMessage({
        type: 'discoverModels',
        presetId: draft.presetId,
        apiType: draft.apiType,
        provider: providerFromDraft(),
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey
      });
    }

    function testCurrentProvider(button) {
      if (!draft) {
        return;
      }
      syncDraftFromFields();
      const validation = validateProviderDraft(false);
      if (validation) {
        setStatus(validation, true);
        return;
      }
      const modelId = getCurrentTestModelId();
      if (!modelId) {
        setStatus('请先获取或手动添加一个模型，再选择测试模型。', true);
        return;
      }
      beginPendingAction(button, '测试中...');
      startResponseTimer('连通测试仍未返回结果，请检查网络或查看日志。');
      vscode.postMessage({
        type: 'testProvider',
        presetId: draft.presetId,
        apiType: draft.apiType,
        provider: providerFromDraft(),
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
        modelId
      });
    }

    function testProvider(group, button) {
      const modelId = group.models[0] && group.models[0].id;
      if (!modelId) {
        setStatus('这个供应商没有可用于测试的模型。', true);
        return;
      }
      beginPendingAction(button, '测试中...');
      startResponseTimer('连通测试仍未返回结果，请检查网络或查看日志。');
      vscode.postMessage({
        type: 'testProvider',
        apiType: group.apiType,
        provider: group.provider,
        baseUrl: group.baseUrl,
        apiKey: '',
        modelId
      });
    }

    function saveCurrentProvider(button) {
      if (!draft) {
        return;
      }
      syncDraftFromFields();
      const validation = validateProviderDraft(true);
      if (validation) {
        setStatus(validation, true);
        return;
      }

      const provider = providerFromDraft();
      const removeKeys = new Set([draft.originalProviderKey, normalizeProviderKey(provider)].filter(Boolean));
      const nextModels = models.filter((model) => !removeKeys.has(normalizeProviderKey(model.provider || inferProviderFromBaseUrl(model.baseUrl || ''))));
      const enabledModels = Array.from(draft.selectedKeys).map((key) => {
        const config = draft.configs[key] || findCatalogItemByKey(key) || {};
        return cleanStorageModel(applyModelDefaults({
          ...config,
          id: config.id,
          displayName: config.displayName || config.id,
          apiType: draft.apiType,
          provider,
          baseUrl: draft.baseUrl
        }));
      }).filter((model) => model.id);

      models = nextModels.concat(enabledModels);
      draft.originalProviderKey = normalizeProviderKey(provider);
      draft.provider = provider;
      beginPendingAction(button, '保存中...');
      startResponseTimer('保存仍未返回结果，请重载窗口或查看日志。');
      vscode.postMessage({
        type: 'saveProvider',
        provider,
        apiKey: draft.apiKey,
        models
      });
    }

    function deleteCurrentProvider() {
      if (!draft) {
        return;
      }
      const key = draft.originalProviderKey || normalizeProviderKey(draft.provider);
      if (!key) {
        showList();
        return;
      }
      models = models.filter((model) => normalizeProviderKey(model.provider || inferProviderFromBaseUrl(model.baseUrl || '')) !== key);
      showList();
      const button = document.getElementById('deleteProviderButton');
      beginPendingAction(button, '删除中...');
      startResponseTimer('删除仍未返回结果，请重载窗口或查看日志。');
      vscode.postMessage({ type: 'saveModels', models });
    }

    function selectAllModels() {
      if (!draft) {
        return;
      }
      getCatalogItems().forEach((item) => draft.selectedKeys.add(modelKey(item)));
      renderCatalog();
    }

    function selectNoModels() {
      if (!draft) {
        return;
      }
      draft.selectedKeys.clear();
      renderCatalog();
    }

    function addManualModel() {
      if (!draft) {
        return;
      }
      syncDraftFromFields();
      const id = String(els.manualModelId.value || '').trim();
      if (!id) {
        setStatus('请先填写模型 ID。', true);
        return;
      }
      const model = applyModelDefaults({
        id,
        displayName: id,
        apiType: draft.apiType || 'openai',
        provider: providerFromDraft(),
        baseUrl: draft.baseUrl
      });
      const key = modelKey(model);
      draft.catalog = mergeCatalog(draft.catalog, [model]);
      draft.configs[key] = model;
      draft.selectedKeys.add(key);
      draft.testModelId = draft.testModelId || model.id;
      els.manualModelId.value = '';
      expandedModelKey = key;
      renderCatalog();
      setStatus('已添加模型 ' + id + '，保存供应商后生效。');
    }

    function draftFromPreset(preset) {
      return {
        originalProviderKey: '',
        presetId: preset.id,
        apiType: preset.apiType || 'openai',
        provider: preset.custom ? customProviderForApiType(preset.apiType || 'openai') : preset.provider,
        baseUrl: preset.baseUrl || '',
        apiKey: '',
        testModelId: (preset.fallbackModels && preset.fallbackModels[0] && preset.fallbackModels[0].id) || '',
        selectedKeys: new Set(),
        configs: {},
        catalog: [],
        presetCatalog: preset.fallbackModels || []
      };
    }

    function draftFromProvider(providerKey) {
      const group = providerGroups().find((entry) => entry.key === providerKey);
      const groupModels = models.filter((model) => normalizeProviderKey(model.provider || inferProviderFromBaseUrl(model.baseUrl || '')) === providerKey);
      const first = groupModels[0] || {};
      const apiType = normalizeApiType(first.apiType || group?.apiType || apiTypeForCustomProvider(first.provider || providerKey));
      const customPreset = findPreset('custom-openai') || defaultPreset();
      const preset = isCustomProvider(first.provider || providerKey)
        ? customPreset
        : findPresetForProvider(first.provider, apiType) || customPreset;
      const configs = {};
      const selectedKeys = new Set();
      groupModels.forEach((model) => {
        const cleaned = cleanStorageModel(applyModelDefaults({
          ...model,
          apiType,
          provider: group ? group.provider : first.provider || providerKey,
          baseUrl: first.baseUrl || model.baseUrl || ''
        }));
        const key = modelKey(cleaned);
        configs[key] = cleaned;
        selectedKeys.add(key);
      });
      const cached = providerCatalogCache[providerKey] || [];
      return {
        originalProviderKey: providerKey,
        presetId: preset.custom ? 'custom-openai' : preset.id,
        apiType,
        provider: group ? group.provider : first.provider || '',
        baseUrl: first.baseUrl || (preset.custom ? defaultBaseUrlForApiType(apiType) : preset.baseUrl) || '',
        apiKey: '',
        testModelId: (groupModels[0] && groupModels[0].id) || (cached[0] && cached[0].id) || (preset.fallbackModels[0] && preset.fallbackModels[0].id) || '',
        selectedKeys,
        configs,
        catalog: mergeCatalog(cached, groupModels),
        presetCatalog: preset.fallbackModels || []
      };
    }

    function syncDraftFromFields() {
      if (!draft) {
        return;
      }
      draft.presetId = els.providerPreset.value || draft.presetId;
      draft.apiType = els.apiType.value || 'openai';
      if (isCustomPreset(draft.presetId)) {
        draft.apiType = normalizeApiType(els.apiTypeSelect.value || draft.apiType);
        draft.provider = customProviderForApiType(draft.apiType);
      } else {
        draft.provider = normalizeProviderName(els.provider.value) || draft.provider || presetProvider(draft.presetId);
      }
      draft.baseUrl = String(els.baseUrl.value || '').trim();
      draft.apiKey = String(els.apiKey.value || '').trim();
      draft.testModelId = String(els.testModel.value || '').trim();
    }

    function validateProviderDraft(requireModels) {
      const provider = providerFromDraft();
      if (!provider) {
        return '无法识别服务商，请选择一个预设或填写有效的 Base URL。';
      }
      if (!draft.baseUrl || !/^https?:\\/\\//i.test(draft.baseUrl)) {
        return '请填写有效的 Base URL，例如 https://api.example.com/v1。';
      }
      if (requireModels && draft.selectedKeys.size === 0) {
        return '请至少选择一个允许的模型。';
      }
      return '';
    }

    function getCurrentTestModelId() {
      if (!draft) {
        return '';
      }
      const fromSelect = String(els.testModel.value || '').trim();
      if (fromSelect) {
        draft.testModelId = fromSelect;
        return fromSelect;
      }
      const selected = Array.from(draft.selectedKeys)
        .map((key) => draft.configs[key] || findCatalogItemByKey(key))
        .find((model) => model && model.id);
      if (selected && selected.id) {
        draft.testModelId = selected.id;
        return selected.id;
      }
      const first = getCatalogItems()[0];
      draft.testModelId = first && first.id ? first.id : '';
      return draft.testModelId;
    }

    function providerFromDraft() {
      if (!draft) {
        return '';
      }
      const preset = findPreset(draft.presetId);
      const configured = normalizeProviderName(draft.provider);
      const inferred = inferProviderFromBaseUrl(draft.baseUrl);
      if (preset && preset.custom) {
        return normalizeProviderName(configured || customProviderForApiType(draft.apiType) || preset.provider || 'custom');
      }
      return normalizeProviderName(configured || presetProvider(draft.presetId) || inferred || 'custom');
    }

    function presetProvider(presetId) {
      const preset = findPreset(presetId);
      return preset && preset.provider ? preset.provider : '';
    }

    function providerGroups() {
      const map = new Map();
      models.forEach((model) => {
        const provider = normalizeProviderName(model.provider || inferProviderFromBaseUrl(model.baseUrl || '') || 'custom');
        const key = normalizeProviderKey(provider);
        const existing = map.get(key) || {
          key,
          provider,
          apiType: model.apiType || 'openai',
          apiTypeLabel: '',
          baseUrl: model.baseUrl || '',
          models: []
        };
        existing.provider = existing.provider || provider;
        existing.apiType = existing.apiType || model.apiType || 'openai';
        existing.baseUrl = existing.baseUrl || model.baseUrl || '';
        existing.models.push(model);
        existing.apiTypeLabel = apiTypeLabel(existing.apiType);
        map.set(key, existing);
      });
      return Array.from(map.values()).sort((a, b) => a.provider.localeCompare(b.provider));
    }

    function apiTypeLabel(apiType) {
      if (apiType === 'openai-responses') {
        return 'OpenAI Responses';
      }
      if (apiType === 'anthropic') {
        return 'Claude API';
      }
      if (apiType === 'gemini') {
        return 'Gemini API';
      }
      return 'OpenAI API';
    }

    function providerIconText(group) {
      const provider = String(group.provider || '').toLowerCase();
      const apiType = String(group.apiType || '').toLowerCase();
      if (provider.includes('deepseek')) {
        return 'DS';
      }
      if (provider.includes('anthropic') || provider.includes('claude') || apiType === 'anthropic') {
        return 'CL';
      }
      if (provider.includes('gemini') || provider.includes('google')) {
        return 'GM';
      }
      if (provider.includes('kimi') || provider.includes('moonshot')) {
        return 'KM';
      }
      if (provider.includes('minimax')) {
        return 'MX';
      }
      if (provider.includes('xai') || provider.includes('grok')) {
        return 'xAI';
      }
      if (provider.includes('zai') || provider.includes('glm')) {
        return 'GLM';
      }
      if (provider.includes('openai')) {
        return 'AI';
      }
      return provider.slice(0, 3) || 'AI';
    }

    function renderPresetOptions() {
      const previous = els.providerPreset.value;
      els.providerPreset.textContent = '';
      presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.label;
        els.providerPreset.appendChild(option);
      });
      if (previous && presets.some((preset) => preset.id === previous)) {
        els.providerPreset.value = previous;
      }
      syncProviderPresetInput();
      renderProviderPresetList();
    }

    function isCustomPreset(presetId) {
      const preset = findPreset(presetId);
      return Boolean(preset && preset.custom);
    }

    function applyCustomApiType(apiType) {
      if (!draft) {
        return;
      }
      const normalized = normalizeApiType(apiType);
      const previousBaseUrl = draft.baseUrl || '';
      draft.presetId = 'custom-openai';
      draft.apiType = normalized;
      draft.provider = customProviderForApiType(normalized);
      if (!previousBaseUrl || isDefaultCustomBaseUrl(previousBaseUrl)) {
        draft.baseUrl = defaultBaseUrlForApiType(normalized);
      }
      els.apiType.value = normalized;
      els.apiTypeSelect.value = normalized;
      els.provider.value = draft.provider;
      els.baseUrl.value = draft.baseUrl;
    }

    function normalizeApiType(value) {
      return ['openai', 'openai-responses', 'anthropic', 'gemini'].includes(value) ? value : 'openai';
    }

    function customProviderForApiType(apiType) {
      if (apiType === 'anthropic') {
        return 'custom-anthropic';
      }
      if (apiType === 'gemini') {
        return 'custom-gemini';
      }
      if (apiType === 'openai-responses') {
        return 'custom-openai-responses';
      }
      return 'custom';
    }

    function apiTypeForCustomProvider(provider) {
      const value = String(provider || '').toLowerCase();
      if (value === 'custom-anthropic') {
        return 'anthropic';
      }
      if (value === 'custom-gemini') {
        return 'gemini';
      }
      if (value === 'custom-openai-responses') {
        return 'openai-responses';
      }
      return 'openai';
    }

    function isCustomProvider(provider) {
      const value = String(provider || '').toLowerCase();
      return value === 'custom' || value.startsWith('custom-');
    }

    function defaultBaseUrlForApiType(apiType) {
      if (apiType === 'anthropic') {
        return 'https://api.anthropic.com';
      }
      if (apiType === 'gemini') {
        return 'https://generativelanguage.googleapis.com';
      }
      return 'https://api.openai.com/v1';
    }

    function isDefaultCustomBaseUrl(baseUrl) {
      const normalized = String(baseUrl || '').replace(/\\/+$/, '');
      return [
        'https://api.openai.com/v1',
        'https://api.anthropic.com',
        'https://generativelanguage.googleapis.com'
      ].includes(normalized);
    }

    function syncProviderPresetInput() {
      const preset = findPreset(els.providerPreset.value);
      if (!providerPresetOpen) {
        providerPresetQuery = '';
      }
      els.providerPresetSearch.value = preset ? preset.label : '';
    }

    function openProviderPresetDropdown(selectText) {
      providerPresetOpen = true;
      providerPresetQuery = '';
      const selectedIndex = presets.findIndex((preset) => preset.id === els.providerPreset.value);
      providerPresetActiveIndex = selectedIndex >= 0 ? selectedIndex : 0;
      els.providerPresetSearch.value = '';
      renderProviderPresetList();
      if (selectText) {
        els.providerPresetSearch.select();
      }
    }

    function closeProviderPresetDropdown(resetInput) {
      if (!providerPresetOpen && !resetInput) {
        return;
      }
      providerPresetOpen = false;
      providerPresetQuery = '';
      if (resetInput) {
        syncProviderPresetInput();
      }
      renderProviderPresetList();
    }

    function handleProviderPresetKeydown(event) {
      const items = filteredProviderPresets();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!providerPresetOpen) {
          openProviderPresetDropdown(false);
          return;
        }
        providerPresetActiveIndex = items.length ? (providerPresetActiveIndex + 1 + items.length) % items.length : -1;
        renderProviderPresetList();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!providerPresetOpen) {
          openProviderPresetDropdown(false);
          return;
        }
        providerPresetActiveIndex = items.length ? (providerPresetActiveIndex - 1 + items.length) % items.length : -1;
        renderProviderPresetList();
        return;
      }
      if (event.key === 'Enter' && providerPresetOpen) {
        event.preventDefault();
        const preset = items[providerPresetActiveIndex] || items[0];
        if (preset) {
          chooseProviderPreset(preset.id);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeProviderPresetDropdown(true);
      }
    }

    function chooseProviderPreset(id) {
      if (!findPreset(id)) {
        return;
      }
      providerPresetOpen = false;
      providerPresetQuery = '';
      els.providerPreset.value = id;
      syncProviderPresetInput();
      renderProviderPresetList();
      els.providerPreset.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function filteredProviderPresets() {
      const query = String(providerPresetQuery || '').trim().toLowerCase();
      if (!query) {
        return presets.slice();
      }
      return presets.filter((preset) => {
        return [preset.label, preset.id, preset.provider, preset.apiType].some((value) =>
          String(value || '').toLowerCase().includes(query)
        );
      });
    }

    function renderProviderPresetList() {
      els.providerPresetSearch.setAttribute('aria-expanded', providerPresetOpen ? 'true' : 'false');
      els.providerPresetList.hidden = !providerPresetOpen;
      els.providerPresetList.textContent = '';
      if (!providerPresetOpen) {
        els.providerPresetSearch.removeAttribute('aria-activedescendant');
        return;
      }

      const items = filteredProviderPresets();
      if (providerPresetActiveIndex >= items.length) {
        providerPresetActiveIndex = items.length - 1;
      }
      if (providerPresetActiveIndex < 0 && items.length) {
        providerPresetActiveIndex = 0;
      }
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'provider-preset-empty';
        empty.textContent = '没有匹配的服务商';
        els.providerPresetList.appendChild(empty);
        els.providerPresetSearch.removeAttribute('aria-activedescendant');
        return;
      }

      items.forEach((preset, index) => {
        const option = document.createElement('div');
        const selected = preset.id === els.providerPreset.value;
        const active = index === providerPresetActiveIndex;
        option.id = 'providerPresetOption-' + preset.id;
        option.className = 'provider-preset-option' + (selected ? ' selected' : '') + (active ? ' active' : '');
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
        option.addEventListener('mouseenter', () => {
          providerPresetActiveIndex = index;
          renderProviderPresetList();
        });
        option.addEventListener('mousedown', (event) => {
          event.preventDefault();
          chooseProviderPreset(preset.id);
        });

        const check = document.createElement('span');
        check.className = 'provider-preset-check';
        check.textContent = selected ? '✓' : '';
        const label = document.createElement('span');
        label.className = 'provider-preset-label';
        label.textContent = preset.label;
        option.append(check, label);
        els.providerPresetList.appendChild(option);
      });

      const activeOption = els.providerPresetList.querySelector('.provider-preset-option.active');
      if (activeOption) {
        els.providerPresetSearch.setAttribute('aria-activedescendant', activeOption.id);
        activeOption.scrollIntoView({ block: 'nearest' });
      } else {
        els.providerPresetSearch.removeAttribute('aria-activedescendant');
      }
    }

    function updateDetailTitle() {
      if (!draft) {
        return;
      }
      const provider = providerFromDraft() || '新供应商';
      els.detailTitle.textContent = provider;
    }

    function updateModelCount(total) {
      if (!draft) {
        return;
      }
      els.modelCount.textContent = '已允许 ' + draft.selectedKeys.size + ' / ' + total + ' 个模型。';
    }

    function getCatalogItems() {
      if (!draft) {
        return [];
      }
      return mergeCatalog(draft.catalog, Object.values(draft.configs));
    }

    function getTestItems() {
      if (!draft) {
        return [];
      }
      return mergeCatalog(draft.catalog, Object.values(draft.configs), draft.presetCatalog || []);
    }

    function mergeCatalog() {
      const map = new Map();
      Array.from(arguments).flat().forEach((item) => {
        if (!item || !item.id) {
          return;
        }
        const base = cleanStorageModel(item);
        const key = modelKey(base);
        const existing = map.get(key) || {};
        map.set(key, cleanStorageModel({ ...existing, ...base }));
      });
      return Array.from(map.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    function ensureModelConfig(item) {
      const key = modelKey(item);
      if (!draft.configs[key]) {
        draft.configs[key] = cleanStorageModel(applyModelDefaults({
          ...item,
          displayName: item.displayName || item.id,
          apiType: draft.apiType || item.apiType || 'openai',
          provider: draft.provider || item.provider || inferProviderFromBaseUrl(draft.baseUrl),
          baseUrl: draft.baseUrl || item.baseUrl || ''
        }));
      }
      return draft.configs[key];
    }

    function updateModelConfig(key, patch) {
      if (!draft) {
        return;
      }
      const existing = draft.configs[key] || findCatalogItemByKey(key) || {};
      draft.configs[key] = cleanStorageModel({ ...existing, ...patch });
      updateModelCount(getCatalogItems().length);
    }

    function findCatalogItemByKey(key) {
      return getCatalogItems().find((item) => modelKey(item) === key);
    }

    function modelKey(model) {
      return encodeURIComponent(String(model.id || '')) + '|' + encodeURIComponent(String(model.configId || ''));
    }

    function findPreset(id) {
      return presets.find((preset) => preset.id === id);
    }

    function findPresetForProvider(provider, apiType) {
      const normalized = normalizeProviderKey(provider);
      return presets.find((preset) => !preset.custom && preset.provider === normalized && (!apiType || preset.apiType === apiType));
    }

    function defaultPreset() {
      return {
        id: 'custom-openai',
        label: '自定义 Custom',
        provider: 'custom',
        apiType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        custom: true,
        fallbackModels: []
      };
    }

    function makeTextField(labelText, value, placeholder, onChange) {
      const field = document.createElement('label');
      field.className = 'field';
      const label = document.createElement('span');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.value = value || '';
      input.placeholder = placeholder || '';
      input.addEventListener('input', () => onChange(String(input.value || '').trim()));
      field.append(label, input);
      return field;
    }

    function makeNumberField(labelText, value, placeholder, onChange) {
      const field = document.createElement('label');
      field.className = 'field';
      const label = document.createElement('span');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = value === undefined ? '' : String(value);
      input.placeholder = placeholder || '';
      input.addEventListener('input', () => {
        const parsed = Number(String(input.value || '').trim());
        onChange(Number.isFinite(parsed) && input.value !== '' ? parsed : undefined);
      });
      field.append(label, input);
      return field;
    }

    function makeSelectField(labelText, value, options, onChange) {
      const field = document.createElement('label');
      field.className = 'field';
      const label = document.createElement('span');
      label.textContent = labelText;
      const select = document.createElement('select');
      options.forEach((option) => {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        select.appendChild(element);
      });
      select.value = value || '';
      select.addEventListener('change', () => onChange(select.value || undefined));
      field.append(label, select);
      return field;
    }

    function makeCheckField(labelText, checked, onChange) {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.addEventListener('change', () => onChange(input.checked));
      label.append(input, document.createTextNode(labelText));
      return label;
    }

    function makeBadge(text, title) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = text;
      badge.title = title;
      return badge;
    }

    function applyModelDefaults(model) {
      const defaults = inferModelDefaults(model);
      return cleanStorageModel({
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
        thinkingBudgetTokens: model.thinkingBudgetTokens ?? defaults.thinkingBudgetTokens
      });
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
          reasoningEffort: id.includes('reasoning') ? 'medium' : undefined
        };
      }
      if (provider.includes('zai') || provider.includes('glm') || id.startsWith('glm-')) {
        if (id.startsWith('glm-5') || id.startsWith('glm-4.7') || id.startsWith('glm-4.6')) {
          return {
            family: 'glm',
            contextLength: id.includes('4.6v') ? 128000 : 200000,
            maxOutputTokens: 128000,
            vision: id.includes('v'),
            toolCalling: true
          };
        }
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
        if (preset.custom || (apiType && preset.apiType !== apiType) || (normalizedProvider && preset.provider !== normalizedProvider)) {
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
      if (id.startsWith('gpt-5')) {
        return {
          family: id.includes('codex') ? 'gpt-5-codex' : 'gpt-5',
          contextLength: inferGpt5ContextLength(id),
          maxOutputTokens: 128000,
          vision: true,
          toolCalling: true,
          reasoningEffort: 'medium'
        };
      }
      if (/^o[134]/.test(id)) {
        return {
          family: 'openai-reasoning',
          contextLength: 200000,
          maxOutputTokens: 100000,
          vision: true,
          toolCalling: true,
          reasoningEffort: 'medium'
        };
      }
      if (id.startsWith('gpt-4.1')) {
        return {
          family: 'gpt-4',
          contextLength: 1047576,
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
        contextLength: inferClaudeContextLength(id),
        maxOutputTokens: inferClaudeMaxOutputTokens(id),
        vision: true,
        toolCalling: true,
        thinkingBudgetTokens: supportsThinking ? 8192 : undefined
      };
    }

    function inferDeepSeekDefaults(id) {
      const currentV4 = id.includes('v4');
      return {
        family: 'deepseek',
        contextLength: currentV4 ? 1048576 : 64000,
        maxOutputTokens: currentV4 ? 393216 : 8192,
        vision: false,
        toolCalling: !id.includes('reasoner'),
        reasoningEffort: currentV4 ? 'high' : undefined
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

    function inferKimiDefaults(id) {
      return {
        family: 'kimi',
        contextLength: id.includes('128k') || id.includes('0711') ? 131072 : 262144,
        maxOutputTokens: id.startsWith('moonshot-') ? 8192 : 32768,
        vision: id.includes('vision') || id === 'kimi-k2.5' || id === 'kimi-k2.6',
        toolCalling: true
      };
    }

    function inferMiniMaxDefaults(id) {
      return {
        family: 'minimax',
        contextLength: 204800,
        maxOutputTokens: 128000,
        vision: false,
        toolCalling: true
      };
    }

    function inferGpt5ContextLength(id) {
      if (id.startsWith('gpt-5.5') || (id.startsWith('gpt-5.4') && !id.startsWith('gpt-5.4-mini'))) {
        return 1050000;
      }
      return 400000;
    }

    function inferClaudeContextLength(id) {
      if (id.includes('opus-4-7') || id.includes('opus-4-6') || id.includes('sonnet-4-6')) {
        return 1000000;
      }
      return 200000;
    }

    function inferClaudeMaxOutputTokens(id) {
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

    function inferGrokContextLength(id) {
      if (id.includes('4.20')) {
        return 2000000;
      }
      if (id.includes('code-fast')) {
        return 256000;
      }
      return 1000000;
    }

    function shouldRefreshKnownDefault(model, field, currentValue, defaultValue) {
      if (typeof currentValue !== 'number' || typeof defaultValue !== 'number' || currentValue === defaultValue) {
        return false;
      }
      const id = String(model.id || '').toLowerCase();
      if (field === 'contextLength') {
        return isKnownStaleContextLength(id, currentValue);
      }
      return isKnownStaleMaxOutputTokens(id, currentValue);
    }

    function isKnownStaleContextLength(id, value) {
      if ((id.startsWith('gpt-5.5') || id.startsWith('gpt-5.4')) && [1048576, 400000].includes(value)) {
        return true;
      }
      if (id.startsWith('gpt-4.1') && value === 1048576) {
        return true;
      }
      if ((id.includes('opus-4-7') || id.includes('opus-4-6') || id.includes('sonnet-4-6')) && value === 200000) {
        return true;
      }
      if (id.includes('grok-4.20') && [256000, 1048576].includes(value)) {
        return true;
      }
      if (id.includes('grok-4.3') && value === 256000) {
        return true;
      }
      return false;
    }

    function isKnownStaleMaxOutputTokens(id, value) {
      return false;
    }

    function reasoningOptionsFor(model) {
      const provider = String(model.provider || draft?.provider || '').toLowerCase();
      const id = String(model.id || '').toLowerCase();
      const apiType = model.apiType || draft?.apiType || 'openai';
      const defaults = inferModelDefaults({ ...model, provider, apiType });
      const options = [{ value: '', label: '服务商默认' }];
      if (apiType === 'anthropic' || provider.includes('anthropic') || id.startsWith('claude-')) {
        return options;
      }
      if (provider.includes('deepseek') || id.startsWith('deepseek-')) {
        if (id.startsWith('deepseek-v4')) {
          options.push({ value: 'high', label: '高' }, { value: 'max', label: '最高' });
        }
        return options;
      }
      if (provider.includes('gemini') || id.startsWith('gemini-') || provider.includes('xai') || id.startsWith('grok-')) {
        options.push({ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' });
        return options;
      }
      if (defaults.reasoningEffort || id.startsWith('gpt-5') || /^o[134]/.test(id)) {
        options.push(
          { value: 'minimal', label: 'Minimal' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' }
        );
      }
      return options;
    }

    function supportsThinkingBudget(model) {
      const provider = String(model.provider || draft?.provider || '').toLowerCase();
      const id = String(model.id || '').toLowerCase();
      return (model.apiType === 'anthropic' || draft?.apiType === 'anthropic' || provider.includes('anthropic') || id.startsWith('claude-')) &&
        Boolean(inferModelDefaults({ ...model, provider, apiType: draft?.apiType || model.apiType }).thinkingBudgetTokens);
    }

    function formatReasoningSummary(model) {
      if (model.thinkingBudgetTokens) {
        return 'thinking ' + formatTokenCount(model.thinkingBudgetTokens);
      }
      if (model.reasoningEffort) {
        return 'reasoning ' + model.reasoningEffort;
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

    function cleanStorageModel(model) {
      const cleaned = {};
      Object.entries(model || {}).forEach(([key, value]) => {
        if (value === '' || value === undefined || value === null) {
          return;
        }
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
          return;
        }
        cleaned[key] = value;
      });
      return cleaned;
    }

    function normalizeProviderKey(value) {
      return normalizeProviderName(value);
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

    function setStatus(message, error = false, success = false) {
      els.status.textContent = message || '';
      els.status.classList.toggle('error', Boolean(error));
      els.status.classList.toggle('success', Boolean(success));
    }

    function bind(id, handler) {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }
      element.addEventListener('click', () => safeAction(id, handler));
    }

    function safeAction(label, handler) {
      try {
        handler();
      } catch (error) {
        console.error(label + ' failed.', error);
        clearResponseTimer();
        settlePendingAction('error');
        setStatus(label + '失败：' + errorMessage(error), true);
      }
    }

    function errorMessage(error) {
      return error && error.message ? String(error.message) : String(error);
    }

    function beginPendingAction(button, busyLabel) {
      if (!button) {
        return;
      }
      if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent || '';
      }
      if (feedbackActionButton) {
        restoreActionButton(feedbackActionButton);
        feedbackActionButton = null;
      }
      if (pendingActionButton && pendingActionButton !== button) {
        restoreActionButton(pendingActionButton);
      }
      window.clearTimeout(feedbackTimer);
      feedbackTimer = 0;
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
      pendingActionButton = null;
      feedbackActionButton = button;
      button.disabled = false;
      button.textContent = kind === 'success' ? '已' + defaultLabel : defaultLabel + (kind === 'timeout' ? '超时' : '失败');
      button.classList.toggle('saved', kind === 'success');
      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => {
        restoreActionButton(button);
      }, kind === 'success' ? 1400 : 1200);
    }

    function restoreActionButton(button) {
      if (!button) {
        return;
      }
      button.disabled = false;
      button.textContent = button.dataset.defaultLabel || button.textContent || '';
      button.classList.remove('saved');
      if (feedbackActionButton === button) {
        feedbackActionButton = null;
      }
    }

    function startResponseTimer(message) {
      clearResponseTimer();
      responseTimer = window.setTimeout(() => {
        setStatus(message, true);
        settlePendingAction('timeout');
      }, 10000);
    }

    function clearResponseTimer() {
      if (responseTimer) {
        window.clearTimeout(responseTimer);
        responseTimer = 0;
      }
    }
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
