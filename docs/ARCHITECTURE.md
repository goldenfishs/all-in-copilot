# Architecture

All in Copilot is a VS Code extension that registers chat models through `vscode.lm.registerLanguageModelChatProvider`.

## Main Modules

- `src/extension.ts`: extension activation, command registration, provider registration, and sidebar registration.
- `src/provider.ts`: VS Code `LanguageModelChatProvider` implementation and model picker metadata.
- `src/adapters.ts`: protocol routing and model discovery for OpenAI-compatible and Anthropic APIs.
- `src/openai.ts`: OpenAI-compatible Chat Completions request conversion, tool conversion, streaming, and reasoning capture.
- `src/anthropic.ts`: Anthropic Messages request conversion, tool conversion, and streaming.
- `src/modelView.ts`: Activity Bar webview for model discovery, editing, and provider API key actions.
- `src/config.ts`: VS Code configuration normalization, defaults, and model ID resolution.
- `src/presets.ts`: provider presets and model default heuristics.
- `src/providerNames.ts`: provider name normalization and Base URL inference.
- `src/auth.ts`: API key storage through VS Code SecretStorage.
- `src/reasoningMemory.ts`: DeepSeek V4 `reasoning_content` replay support for tool-call conversations.

## Request Flow

1. VS Code calls `provideLanguageModelChatInformation` to list configured models.
2. A chat request arrives at `provideLanguageModelChatResponse`.
3. The provider resolves the configured model and retrieves a provider API key.
4. `adapters.ts` builds the protocol-specific request.
5. The adapter streams response parts back to VS Code as text, data, or tool-call parts.

## Configuration Flow

1. The sidebar posts model changes to `ModelManagerViewProvider`.
2. Models are validated and stored under `all-in-copilot.models`.
3. API keys are stored in SecretStorage under provider-specific keys.
4. The model picker is refreshed after configuration or secret changes.
