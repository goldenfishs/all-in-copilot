# Changelog

All notable changes to this project are documented in this file.

## 0.1.5

- Added protocol/provider icons to provider cards.
- Corrected connectivity wording from “联通” to “连通”.
- Hid the test-model picker until models are actually discovered or already saved.
- Moved latency badges onto the tested model card.
- Aligned provider setup fields and action buttons in the sidebar detail view.
- Replaced the native provider preset selector with a searchable sidebar dropdown.
- Parsed text-form `<tool_call>` responses from OpenAI-compatible providers into real VS Code tool calls.
- Added Gemini OpenAI-compatible tool-result replay fields for follow-up requests after tool calls.
- Added Kimi/Moonshot and MiniMax provider presets.
- Added automatic vision proxying for text-only models when image attachments are present.

## 0.1.4

- Simplified provider setup by hiding protocol and provider-id fields; presets now drive the protocol internally.
- Kept Base URL editable for every preset while leaving API Key and URL as the primary visible fields.
- Delayed the allowed-model list until models are discovered or an existing provider already has saved models.

## 0.1.3

- Added a confirmation step before clearing all sidebar configuration.
- Split model discovery from connectivity testing; tests now send a minimal request to the selected test model and report latency.
- Improved provider UI density, latency badges, generic format presets, and model metadata inference from `/models` responses.
- Removed "official" wording from provider preset labels.

## 0.1.2

- Reworked the sidebar into a provider-first workflow with a provider list, connectivity testing, and per-provider allowed model selection.
- Fixed the clear configuration action so it saves an empty model list directly and gives visible feedback.

## 0.1.1

- Fixed the README logo URL so it renders correctly on the VS Code Marketplace page.

## 0.1.0

- Prepared the first public Marketplace release under the `goldenfishs` publisher.
- Includes the visual model manager, OpenAI-compatible and Anthropic adapters, DeepSeek V4 compatibility fixes, bilingual README files, and release metadata.

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
