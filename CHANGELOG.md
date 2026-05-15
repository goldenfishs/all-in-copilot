# Changelog

All notable changes to this project are documented in this file.

## 0.0.9

- Added provider-aware model management UI for OpenAI-compatible and Anthropic APIs.
- Added automatic model discovery with `/v1` base URL detection.
- Added provider prefixes in the model picker, for example `xtoken/gpt-5.5`.
- Added model defaults for GPT, Claude, DeepSeek, Gemini, xAI, and GLM-style providers.
- Added reasoning controls for compatible OpenAI-style models and Claude thinking budget.
- Improved tool-call streaming for workspace reading and search flows.
- Preserved DeepSeek V4 `reasoning_content` across tool-call turns.
- Added save feedback and safer model editing behavior in the sidebar.
