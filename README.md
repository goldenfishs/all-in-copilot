<div align="center">

<img src="media/icon.png" alt="All in Copilot Logo" width="112" height="112">

# All in Copilot

**Bring OpenAI-compatible and Anthropic models into the VS Code Copilot Chat model picker.**

Add providers, discover models, configure reasoning options, and use your own models from the native Copilot Chat workflow.

English | [简体中文](README.zh-CN.md)

</div>

> All in Copilot is not affiliated with, endorsed by, or sponsored by GitHub, OpenAI, Anthropic, or Microsoft. This extension uses VS Code's Language Model Provider API. GitHub Copilot is a trademark of GitHub.

## What it does

- Shows your own models in the Copilot Chat model picker.
- Add, edit, duplicate, and delete models from the sidebar.
- Auto-discover models from `/models`.
- Auto-detect whether Base URL needs `/v1`.
- Store API keys per provider, not in `settings.json`.
- Supports OpenAI-compatible and Anthropic protocols.

## Who it's for

If you already have any of these, this extension might fit:

- Official OpenAI endpoints
- OpenAI-compatible gateways
- Claude / Anthropic API
- DeepSeek, GLM, Gemini, xAI, or any compatible service

## Quick Start

### Requirements

- VS Code 1.116 or later
- GitHub Copilot Chat enabled
- At least one API key

### Install

```bash
npm install
npm run package
code --install-extension all-in-copilot-*.vsix
```

On macOS, you can also run:

```bash
./install-local.sh
```

### Usage

1. Open the **All in Copilot** sidebar in the Activity Bar.
2. Pick a preset, or fill in your own provider, API type, and Base URL.
3. Paste your API key.
4. Click **获取模型列表** to discover models, or add one manually.
5. Save, then select the model in Copilot Chat.

## Common Configurations

Model configs live in `all-in-copilot.models`. It's easier to use the sidebar, but here's what the JSON looks like.

### OpenAI-compatible

```json
{
  "all-in-copilot.models": [
    {
      "id": "gpt-5.5",
      "apiType": "openai",
      "displayName": "gpt-5.5",
      "provider": "xtoken",
      "baseUrl": "https://api.example.com/v1",
      "family": "gpt-5",
      "contextLength": 400000,
      "maxOutputTokens": 128000,
      "vision": true,
      "toolCalling": true,
      "reasoningEffort": "medium"
    }
  ]
}
```

### Anthropic

```json
{
  "all-in-copilot.models": [
    {
      "id": "claude-sonnet-4-20250514",
      "apiType": "anthropic",
      "displayName": "Claude Sonnet 4",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "family": "claude",
      "contextLength": 200000,
      "maxOutputTokens": 64000,
      "vision": true,
      "toolCalling": true,
      "thinkingBudgetTokens": 8192
    }
  ]
}
```

## Commands

- `All in Copilot: 打开模型管理器` — Open the sidebar
- `All in Copilot: 设置服务商 API Key` — Set a key for a specific provider
- `All in Copilot: 打开设置` — Open extension settings
- `All in Copilot: 查看日志` — Open the output channel
- `All in Copilot: 设置默认 API Key` — Set the default API key
- `All in Copilot: 清除默认 API Key` — Clear the default API key

## Security

API keys are stored in VS Code `SecretStorage`. Don't put them in `settings.json`, issues, logs, or screenshots.

## Development

```bash
npm install
npm run compile
```

Open the repo in VS Code and press **F5** to debug.

More details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

[MIT](LICENSE)
