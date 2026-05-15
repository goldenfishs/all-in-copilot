# All in Copilot

All in Copilot is a VS Code extension that lets you add OpenAI-compatible and Anthropic chat models to the VS Code chat model picker through a visual sidebar.

> This project is not affiliated with, endorsed by, or sponsored by GitHub, OpenAI, Anthropic, or Microsoft. GitHub Copilot is a trademark of GitHub. This extension uses VS Code's public Language Model Provider APIs.

## Features

- Visual model manager in the Activity Bar
- Add, edit, duplicate, delete, and clear model configurations
- Discover models from OpenAI-compatible `/models` endpoints
- Automatic `/v1` base URL handling during discovery and requests
- Provider-specific API keys stored in VS Code SecretStorage
- OpenAI-compatible Chat Completions streaming
- Anthropic Messages streaming
- Image input and tool-call conversion when supported by the configured model
- Provider-aware defaults for GPT, Claude, DeepSeek, Gemini, xAI, and GLM-style models
- Reasoning controls for compatible OpenAI-style models
- Claude thinking budget configuration
- DeepSeek V4 `reasoning_content` replay support for tool-call conversations
- Output channel diagnostics for request and stream behavior

## Install for Development

```bash
npm install
npm run compile
```

Then open this folder in VS Code and run `Run Extension`.

## Local VSIX

```bash
npm run package
```

This creates a `.vsix` package in the project root. Generated packages are ignored by Git.

For local installation on macOS with the bundled script:

```bash
./install-local.sh
```

## Usage

1. Open the `All in Copilot` Activity Bar view.
2. Pick a provider preset or enter a custom provider, Base URL, and API key.
3. Click `获取模型列表` to discover models, or click `添加` to add one manually.
4. Configure context length, max output, vision, tool calling, and reasoning options.
5. Save the model.
6. Select the model from the VS Code chat model picker.

## Configuration

Models are stored in VS Code settings under `all-in-copilot.models`.

```json
{
  "all-in-copilot.models": [
    {
      "id": "gpt-5.5",
      "displayName": "gpt-5.5",
      "provider": "xtoken",
      "baseUrl": "https://api.example.com/v1",
      "contextLength": 400000,
      "maxOutputTokens": 128000,
      "vision": true,
      "toolCalling": true,
      "reasoningEffort": "medium"
    },
    {
      "id": "claude-sonnet-4-20250514",
      "apiType": "anthropic",
      "displayName": "Claude Sonnet 4",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "contextLength": 200000,
      "maxOutputTokens": 64000,
      "vision": true,
      "toolCalling": true,
      "thinkingBudgetTokens": 8192
    }
  ]
}
```

Use `configId` to register the same API model more than once:

```json
{
  "id": "gpt-5.5",
  "configId": "fast",
  "displayName": "gpt-5.5 Fast",
  "reasoningEffort": "low"
}
```

## Commands

- `All in Copilot: 打开模型管理器`
- `All in Copilot: 设置默认 API Key`
- `All in Copilot: 设置服务商 API Key`
- `All in Copilot: 清除默认 API Key`
- `All in Copilot: 打开设置`
- `All in Copilot: 查看日志`

## Project Structure

- `src/extension.ts`: extension activation and command registration
- `src/provider.ts`: VS Code language model provider
- `src/modelView.ts`: sidebar model manager
- `src/openai.ts`: OpenAI-compatible request and stream adapter
- `src/anthropic.ts`: Anthropic Messages request and stream adapter
- `src/adapters.ts`: protocol routing and model discovery
- `src/config.ts`: settings normalization and model resolution
- `src/presets.ts`: provider presets and model defaults
- `src/auth.ts`: SecretStorage API key handling

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for more detail.

## Publishing

Before publishing to the VS Code Marketplace, change `publisher` in `package.json` from `local` to your Marketplace publisher ID.

See [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Security

API keys are stored with VS Code SecretStorage. Do not put keys in `settings.json`, screenshots, issues, logs, or pull requests.

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
