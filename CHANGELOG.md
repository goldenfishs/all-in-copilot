# Changelog

All notable changes to this project are documented in this file.

## 0.0.12

- Explicitly disables DeepSeek V4 thinking when continuing older tool-call conversations without replayable `reasoning_content`.
- Strips stale `reasoning_content` when falling back to non-thinking DeepSeek V4 requests.

## 0.0.11

- Fixed DeepSeek V4 tool-call continuation by caching `reasoning_content` before emitting tool calls.
- Added fallback handling for older conversations where DeepSeek V4 thinking replay data is unavailable.

## 0.0.10

- Fixed DeepSeek official API compatibility by omitting `tool_choice` for DeepSeek requests.
- Added DeepSeek V4 reasoning effort mapping for `high` and `max`.
- Updated DeepSeek defaults so legacy `deepseek-reasoner` is not marked as tool-call capable by default.
- Replaced the Activity Bar icon with a simpler model-routing glyph.

## 0.0.9

- Added provider-aware model management UI for OpenAI-compatible and Anthropic APIs.
- Added automatic model discovery with `/v1` base URL detection.
- Added provider prefixes in the model picker, for example `xtoken/gpt-5.5`.
- Added model defaults for GPT, Claude, DeepSeek, Gemini, xAI, and GLM-style providers.
- Added reasoning controls for compatible OpenAI-style models and Claude thinking budget.
- Improved tool-call streaming for workspace reading and search flows.
- Preserved DeepSeek V4 `reasoning_content` across tool-call turns.
- Added save feedback and safer model editing behavior in the sidebar.
