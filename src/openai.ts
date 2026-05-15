import * as vscode from 'vscode';
import type {
  OpenAIChatCompletionRequest,
  OpenAIContentPart,
  OpenAIFunctionTool,
  OpenAIMessage,
  OpenAIToolCall,
  ResolvedModelConfig,
} from './types';
import { ReasoningTracker, signatureForMessage } from './reasoningMemory';
import { logger } from './logger';

interface ToolCallBuffer {
  id?: string;
  name?: string;
  arguments: string;
  emitted?: boolean;
}

interface StreamStats {
  chunkCount: number;
  parseErrorCount: number;
  textChars: number;
  reasoningChars: number;
  toolDeltaCount: number;
  emittedToolCalls: number;
  doneSignal: boolean;
  finishReason?: string;
}

type ModelConfigurationOptions = vscode.ProvideLanguageModelChatResponseOptions & {
  readonly modelConfiguration?: Record<string, unknown>;
  readonly configuration?: Record<string, unknown>;
}

const GEMINI_THOUGHT_SIGNATURE_BYPASS = 'skip_thought_signature_validator';

export function buildChatCompletionRequest(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions,
  reasoningTracker: ReasoningTracker,
): OpenAIChatCompletionRequest {
  const request: OpenAIChatCompletionRequest = {
    model: model.id,
    messages: convertMessages(messages, reasoningTracker, model),
    stream: true,
    stream_options: {
      include_usage: true,
    },
    max_tokens: model.maxOutputTokens,
  };

  if (model.temperature !== undefined && model.temperature !== null) {
    request.temperature = model.temperature;
  }

  if (model.topP !== undefined && model.topP !== null) {
    request.top_p = model.topP;
  }

  const reasoningEffort = normalizeReasoningEffort(getConfiguredReasoningEffort(options) ?? model.reasoningEffort, model);
  if (reasoningEffort) {
    request.reasoning_effort = reasoningEffort;
  }
  if (isDeepSeekV4Model(model) && reasoningEffort) {
    request.thinking = { type: 'enabled' };
  }

  const toolConfig = convertTools(options);
  if (model.toolCalling && toolConfig.tools?.length) {
    request.tools = toolConfig.tools;
    const toolChoice = selectToolChoice(model, messages, toolConfig.tool_choice);
    if (toolChoice) {
      request.tool_choice = toolChoice;
    }
    request.messages = withToolUseGuidance(request.messages, toolConfig.tools);
  }

  if (isDeepSeekV4Model(model) && hasMissingDeepSeekThinkingReplay(request.messages)) {
    delete request.reasoning_effort;
    request.thinking = { type: 'disabled' };
    request.messages = stripReasoningContent(request.messages);
    logger.warn('Explicitly disabled DeepSeek V4 thinking for this request because prior tool-call reasoning_content is unavailable.');
  }

  if (model.extra) {
    for (const [key, value] of Object.entries(model.extra)) {
      if (value !== undefined) {
        request[key] = value;
      }
    }
  }

  return request;
}

function getConfiguredReasoningEffort(options: vscode.ProvideLanguageModelChatResponseOptions): string | undefined {
  const configurableOptions = options as ModelConfigurationOptions;
  const value =
    configurableOptions.modelConfiguration?.reasoningEffort ??
    configurableOptions.configuration?.reasoningEffort ??
    options.modelOptions?.reasoningEffort;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function withToolUseGuidance(messages: OpenAIMessage[], tools: OpenAIFunctionTool[]): OpenAIMessage[] {
  const toolNames = tools.map((tool) => tool.function.name).filter(Boolean).slice(0, 40).join(', ');
  const guidance = [
    'When the user asks about the current workspace, files, search results, codebase structure, or project contents, call the available VS Code tools before answering.',
    'Do not stop after saying that you will inspect or search; perform the relevant tool call in the same response.',
    toolNames ? `Available tool names include: ${toolNames}.` : '',
  ].filter(Boolean).join(' ');

  const first = messages[0];
  if (first?.role === 'system' && typeof first.content === 'string') {
    return [
      {
        ...first,
        content: `${guidance}\n\n${first.content}`,
      },
      ...messages.slice(1),
    ];
  }

  return [
    { role: 'system', content: guidance },
    ...messages,
  ];
}

function shouldRequireToolForWorkspaceRequest(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): boolean {
  const lastUserMessage = [...messages].reverse().find((message) =>
    message.role === vscode.LanguageModelChatMessageRole.User
  );
  if (!lastUserMessage) {
    return false;
  }

  const text = (lastUserMessage.content ?? []).map((part) => {
    if (part instanceof vscode.LanguageModelTextPart) {
      return part.value;
    }
    return '';
  }).join('\n').toLowerCase();

  return /完整.*(读|阅读|看|分析)|读.*项目|阅读.*项目|看.*项目|分析.*项目|搜索|查找|文件|目录|代码库|codebase|workspace|project|read.*project|search|find.*file/.test(text);
}

function normalizeReasoningEffort(value: string | undefined, model: ResolvedModelConfig): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (isDeepSeekV4Model(model)) {
    if (normalized === 'max' || normalized === 'xhigh') {
      return 'max';
    }
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      return 'high';
    }
    return undefined;
  }

  const openAIStyle = normalized === 'max' ? 'xhigh' : normalized;
  if (!isReasoningEffortSupported(model, openAIStyle)) {
    return undefined;
  }

  return openAIStyle;
}

function isReasoningEffortSupported(model: ResolvedModelConfig, value: string): boolean {
  const provider = model.provider.toLowerCase();
  const id = model.id.toLowerCase();

  if (provider.includes('deepseek')) {
    return isDeepSeekV4Model(model) && ['high', 'max'].includes(value);
  }

  if (provider.includes('gemini')) {
    return false;
  }

  if (id.startsWith('gpt-5.1')) {
    return ['none', 'low', 'medium', 'high'].includes(value);
  }

  if (provider.includes('anthropic')) {
    return false;
  }

  if (value === 'none') {
    return false;
  }

  return ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(value);
}

function shouldSendToolChoice(model: ResolvedModelConfig): boolean {
  return !isDeepSeekModel(model);
}

function selectToolChoice(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  fallback: OpenAIChatCompletionRequest['tool_choice'],
): OpenAIChatCompletionRequest['tool_choice'] | undefined {
  if (!shouldSendToolChoice(model)) {
    return undefined;
  }

  return shouldRequireToolForWorkspaceRequest(messages)
    ? 'required'
    : fallback;
}

function isDeepSeekModel(model: ResolvedModelConfig): boolean {
  const provider = model.provider.toLowerCase();
  const id = model.id.toLowerCase();
  return provider.includes('deepseek') || id.startsWith('deepseek-');
}

function isDeepSeekV4Model(model: ResolvedModelConfig): boolean {
  const id = model.id.toLowerCase();
  return isDeepSeekModel(model) && id.startsWith('deepseek-v4');
}

function hasMissingDeepSeekThinkingReplay(messages: OpenAIMessage[]): boolean {
  return messages.some((message) =>
    message.role === 'assistant' &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length > 0 &&
    !message.reasoning_content
  );
}

function stripReasoningContent(messages: OpenAIMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    if (!message.reasoning_content) {
      return message;
    }

    const { reasoning_content: _reasoningContent, ...rest } = message;
    return rest;
  });
}

export function buildHeaders(model: ResolvedModelConfig, apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...model.headers,
  };
}

export async function processChatCompletionStream(
  body: ReadableStream<Uint8Array>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken,
  reasoningTracker: ReasoningTracker,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolCalls = new Map<number, ToolCallBuffer>();
  let visibleText = '';
  let reasoningContent = '';
  let streamFinished = false;
  const stats: StreamStats = {
    chunkCount: 0,
    parseErrorCount: 0,
    textChars: 0,
    reasoningChars: 0,
    toolDeltaCount: 0,
    emittedToolCalls: 0,
    doneSignal: false,
  };
  const textToolCallExtractor = new TextToolCallExtractor(
    progress,
    toolCalls,
    stats,
    (delta) => {
      visibleText += delta;
    },
  );

  try {
    while (!token.isCancellationRequested && !streamFinished) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }

        const data = trimmed.slice('data:'.length).trim();
        if (!data) {
          continue;
        }
        if (data === '[DONE]') {
          stats.doneSignal = true;
          streamFinished = true;
          break;
        }

        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(data) as Record<string, unknown>;
        } catch (error) {
          stats.parseErrorCount += 1;
          logger.warn('Could not parse OpenAI stream chunk.', formatStreamError(error));
          continue;
        }
        processChunk(
          chunk,
          toolCalls,
          progress,
          stats,
          (delta) => {
            textToolCallExtractor.accept(delta);
          },
          (delta) => {
            reasoningContent += delta;
          },
        );
      }
    }
  } finally {
    reader.releaseLock();
  }

  textToolCallExtractor.finish();
  reasoningTracker.remember({
    reasoningContent,
    visibleSignature: buildAssistantVisibleSignature(visibleText, toolCalls),
  });
  flushToolCalls(toolCalls, progress, stats);
  logger.info('Stream complete.', stats);
}

function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  reasoningTracker: ReasoningTracker,
  model: ResolvedModelConfig,
): OpenAIMessage[] {
  const converted: OpenAIMessage[] = [];
  const toolCallNames = new Map<string, string>();
  const geminiCompatibility = shouldUseGeminiOpenAICompatibility(model);

  for (const message of messages) {
    const role = mapRole(message);
    const reasoningContent = reasoningTracker.consume(message);
    const textParts: string[] = [];
    const imageParts: vscode.LanguageModelDataPart[] = [];
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: OpenAIMessage[] = [];

    for (const part of message.content ?? []) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
        continue;
      }

      if (part instanceof vscode.LanguageModelDataPart && isSupportedImage(part.mimeType)) {
        imageParts.push(part);
        continue;
      }

      if (part instanceof vscode.LanguageModelToolCallPart) {
        const callId = part.callId || createToolCallId();
        const toolCall: OpenAIToolCall = {
          id: callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: stringifyToolInput(part.input),
          },
        };
        if (geminiCompatibility) {
          toolCall.extra_content = {
            google: {
              thought_signature: GEMINI_THOUGHT_SIGNATURE_BYPASS,
            },
          };
        }
        toolCalls.push(toolCall);
        toolCallNames.set(callId, part.name);
        continue;
      }

      if (isToolResultPart(part)) {
        const toolMessage: OpenAIMessage = {
          role: 'tool',
          tool_call_id: part.callId,
          content: collectToolResultText(part.content),
        };
        if (geminiCompatibility) {
          const name = toolCallNames.get(part.callId);
          if (name) {
            toolMessage.name = name;
          }
        }
        toolResults.push(toolMessage);
      }
    }

    const text = textParts.join('').trim();

    if (role === 'assistant') {
      const assistantMessage: OpenAIMessage = {
        role: 'assistant',
      };

      if (text) {
        assistantMessage.content = text;
      }

      if (reasoningContent) {
        assistantMessage.reasoning_content = reasoningContent;
      }

      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls;
        if (!assistantMessage.content) {
          assistantMessage.content = null;
        }
      }

      if (assistantMessage.content || assistantMessage.tool_calls) {
        converted.push(assistantMessage);
      }
    } else if (role === 'user') {
      if (imageParts.length > 0) {
        const content: OpenAIContentPart[] = [];
        if (text) {
          content.push({ type: 'text', text });
        }
        for (const image of imageParts) {
          content.push({
            type: 'image_url',
            image_url: {
              url: createDataUrl(image),
            },
          });
        }
        converted.push({ role: 'user', content });
      } else if (text) {
        converted.push({ role: 'user', content: text });
      }
    } else if (text) {
      converted.push({ role: 'system', content: text });
    }

    converted.push(...toolResults);
  }

  return converted;
}

function convertTools(options: vscode.ProvideLanguageModelChatResponseOptions): {
  tools?: OpenAIFunctionTool[];
  tool_choice?: OpenAIChatCompletionRequest['tool_choice'];
} {
  const tools = options.tools ?? [];
  if (tools.length === 0) {
    return {};
  }

  const convertedTools = tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));

  if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
    if (tools.length !== 1) {
      return {
        tools: convertedTools,
        tool_choice: 'required',
      };
    }

    return {
      tools: convertedTools,
      tool_choice: {
        type: 'function',
        function: {
          name: tools[0].name,
        },
      },
    };
  }

  return {
    tools: convertedTools,
    tool_choice: 'auto',
  };
}

function shouldUseGeminiOpenAICompatibility(model: ResolvedModelConfig): boolean {
  const provider = model.provider.toLowerCase();
  const id = model.id.toLowerCase();
  const baseUrl = model.baseUrl.toLowerCase();
  return provider.includes('gemini') ||
    provider.includes('google') ||
    id.startsWith('gemini-') ||
    baseUrl.includes('generativelanguage.googleapis.com');
}

function processChunk(
  chunk: Record<string, unknown>,
  toolCalls: Map<number, ToolCallBuffer>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  stats: StreamStats,
  onTextDelta: (delta: string) => void,
  onReasoningDelta: (delta: string) => void,
): void {
  stats.chunkCount += 1;
  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return;
  }

  const choice = choices[0] as Record<string, unknown>;
  const delta = readRecord(choice.delta) ?? readRecord(choice.message);
  const finishReason = readString(choice.finish_reason);
  if (finishReason) {
    stats.finishReason = finishReason;
  }
  if (!delta) {
    return;
  }

  const content = readContentDelta(delta.content);
  if (typeof content === 'string' && content.length > 0) {
    onTextDelta(content);
  }

  const reasoningDelta =
    readString(delta.reasoning_content) ??
    readReasoningText(delta.reasoning) ??
    readReasoningText(delta.thinking) ??
    readReasoningDetails(delta.reasoning_details);
  if (reasoningDelta) {
    stats.reasoningChars += reasoningDelta.length;
    onReasoningDelta(reasoningDelta);
  }

  const deltaToolCalls = delta.tool_calls;
  if (Array.isArray(deltaToolCalls)) {
    for (const rawToolCall of deltaToolCalls) {
      if (!rawToolCall || typeof rawToolCall !== 'object') {
        continue;
      }

      const toolCall = rawToolCall as Record<string, unknown>;
      const index = typeof toolCall.index === 'number' ? toolCall.index : 0;
      const buffer = toolCalls.get(index) ?? { arguments: '' };
      const id = toolCall.id;
      if (typeof id === 'string') {
        buffer.id = id;
      }

      const func = toolCall.function as Record<string, unknown> | undefined;
      if (func) {
        if (typeof func.name === 'string') {
          buffer.name = appendToolNameDelta(buffer.name, func.name);
        }
        const argumentsDelta = readToolArgumentDelta(func.arguments);
        if (argumentsDelta !== undefined) {
          buffer.arguments += argumentsDelta;
        }
      }

      toolCalls.set(index, buffer);
      stats.toolDeltaCount += 1;
    }
  }

  const legacyFunctionCall = readRecord(delta.function_call);
  if (legacyFunctionCall) {
    const buffer = toolCalls.get(0) ?? { arguments: '' };
    if (typeof legacyFunctionCall.name === 'string') {
      buffer.name = appendToolNameDelta(buffer.name, legacyFunctionCall.name);
    }
    const argumentsDelta = readToolArgumentDelta(legacyFunctionCall.arguments);
    if (argumentsDelta !== undefined) {
      buffer.arguments += argumentsDelta;
    }
    toolCalls.set(0, buffer);
    stats.toolDeltaCount += 1;
  }

}

class TextToolCallExtractor {
  private buffer = '';

  constructor(
    private readonly progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    private readonly toolCalls: Map<number, ToolCallBuffer>,
    private readonly stats: StreamStats,
    private readonly onVisibleText: (delta: string) => void,
  ) {}

  accept(delta: string): void {
    this.buffer += delta;
    this.drain(false);
  }

  finish(): void {
    this.drain(true);
    this.flushText(this.buffer);
    this.buffer = '';
  }

  private drain(final: boolean): void {
    while (this.buffer.length > 0) {
      const tagStart = findTextToolTagStart(this.buffer);
      if (tagStart < 0) {
        const keep = final ? 0 : trailingTextToolPrefixLength(this.buffer);
        const flushLength = this.buffer.length - keep;
        if (flushLength <= 0) {
          return;
        }
        this.flushText(this.buffer.slice(0, flushLength));
        this.buffer = this.buffer.slice(flushLength);
        return;
      }

      if (tagStart > 0) {
        this.flushText(this.buffer.slice(0, tagStart));
        this.buffer = this.buffer.slice(tagStart);
        continue;
      }

      const openTag = this.buffer.match(/^<tool_calls?\b[^>]*>/i)?.[0];
      if (!openTag) {
        if (final) {
          this.flushText(this.buffer);
          this.buffer = '';
        }
        return;
      }

      const tagName = /^<tool_calls\b/i.test(openTag) ? 'tool_calls' : 'tool_call';
      const closeTag = `</${tagName}>`;
      const closeIndex = this.buffer.toLowerCase().indexOf(closeTag, openTag.length);
      if (closeIndex < 0) {
        if (final) {
          this.flushText(this.buffer);
          this.buffer = '';
        }
        return;
      }

      const rawPayload = this.buffer.slice(openTag.length, closeIndex);
      const rawBlock = this.buffer.slice(0, closeIndex + closeTag.length);
      const parsedCalls = parseTextToolCallPayload(rawPayload);
      if (parsedCalls.length === 0) {
        this.flushText(rawBlock);
      } else {
        for (const parsedCall of parsedCalls) {
          this.emitToolCall(parsedCall);
        }
      }
      this.buffer = this.buffer.slice(closeIndex + closeTag.length);
    }
  }

  private flushText(text: string): void {
    if (!text) {
      return;
    }
    this.progress.report(new vscode.LanguageModelTextPart(text));
    this.stats.textChars += text.length;
    this.onVisibleText(text);
  }

  private emitToolCall(toolCall: ToolCallBuffer): void {
    const index = nextToolCallIndex(this.toolCalls);
    const id = toolCall.id || createToolCallId();
    const input = parseToolArguments(toolCall.arguments);
    this.progress.report(new vscode.LanguageModelToolCallPart(id, toolCall.name ?? '', input));
    this.toolCalls.set(index, {
      id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      emitted: true,
    });
    this.stats.toolDeltaCount += 1;
    this.stats.emittedToolCalls += 1;
  }
}

function findTextToolTagStart(value: string): number {
  const lower = value.toLowerCase();
  const callIndex = lower.indexOf('<tool_call');
  const callsIndex = lower.indexOf('<tool_calls');
  if (callIndex < 0) {
    return callsIndex;
  }
  if (callsIndex < 0) {
    return callIndex;
  }
  return Math.min(callIndex, callsIndex);
}

function trailingTextToolPrefixLength(value: string): number {
  const lower = value.toLowerCase();
  const prefixes = ['<tool_call', '<tool_calls'];
  let keep = 0;
  for (const prefix of prefixes) {
    for (let length = 1; length < prefix.length; length += 1) {
      if (lower.endsWith(prefix.slice(0, length))) {
        keep = Math.max(keep, length);
      }
    }
  }
  return keep;
}

function parseTextToolCallPayload(payload: string): ToolCallBuffer[] {
  const normalized = unwrapTextToolCallPayload(payload);
  if (!normalized) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return [];
  }

  return collectTextToolCalls(parsed);
}

function unwrapTextToolCallPayload(payload: string): string {
  const trimmed = payload.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

function collectTextToolCalls(value: unknown): ToolCallBuffer[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextToolCalls(item));
  }

  const record = readRecord(value);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.tool_calls)) {
    return record.tool_calls.flatMap((item) => collectTextToolCalls(item));
  }

  const directName = readString(record.name) ?? readString(record.tool_name);
  if (directName) {
    return [{
      id: readString(record.id),
      name: directName,
      arguments: normalizeTextToolArguments(record.arguments ?? record.input ?? record.args),
    }];
  }

  const functionRecord = readRecord(record.function);
  const functionName = readString(functionRecord?.name);
  if (functionName) {
    return [{
      id: readString(record.id),
      name: functionName,
      arguments: normalizeTextToolArguments(functionRecord?.arguments ?? functionRecord?.input),
    }];
  }

  return [];
}

function normalizeTextToolArguments(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return stringifyToolInput(value ?? {});
}

function nextToolCallIndex(toolCalls: Map<number, ToolCallBuffer>): number {
  const indexes = Array.from(toolCalls.keys());
  return indexes.length ? Math.max(...indexes) + 1 : 0;
}

function buildAssistantVisibleSignature(visibleText: string, toolCalls: Map<number, ToolCallBuffer>): string {
  const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];

  if (visibleText) {
    parts.push(new vscode.LanguageModelTextPart(visibleText));
  }

  for (const [index, toolCall] of Array.from(toolCalls.entries()).sort((a, b) => a[0] - b[0])) {
    if (!toolCall.name) {
      continue;
    }

    if (!toolCall.id) {
      toolCall.id = createToolCallId();
    }

    parts.push(new vscode.LanguageModelToolCallPart(
      toolCall.id,
      toolCall.name,
      parseToolArguments(toolCall.arguments),
    ));
  }

  return signatureForMessage({
    role: vscode.LanguageModelChatMessageRole.Assistant,
    content: parts,
    name: undefined,
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readContentDelta(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((part) => {
      const record = readRecord(part);
      return typeof record?.text === 'string' ? record.text : '';
    }).join('');
  }
  return undefined;
}

function readReasoningText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  return readString(record.text) ?? readString(record.summary);
}

function readReasoningDetails(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = readRecord(item);
    if (!record) {
      return '';
    }
    return readString(record.text) ?? readString(record.summary) ?? '';
  }).join('');
}

function readToolArgumentDelta(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    return stringifyToolInput(value);
  }
  return undefined;
}

function appendToolNameDelta(previous: string | undefined, delta: string): string {
  if (!previous || previous === delta) {
    return delta;
  }
  if (delta.startsWith(previous)) {
    return delta;
  }
  if (previous.endsWith(delta)) {
    return previous;
  }
  return `${previous}${delta}`;
}

function flushToolCalls(
  toolCalls: Map<number, ToolCallBuffer>,
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  stats?: StreamStats,
): void {
  for (const [index, toolCall] of Array.from(toolCalls.entries())) {
    if (!toolCall.name || toolCall.emitted) {
      continue;
    }

    const input = parseToolArguments(toolCall.arguments);
    if (!toolCall.id) {
      toolCall.id = createToolCallId();
    }
    progress.report(new vscode.LanguageModelToolCallPart(
      toolCall.id,
      toolCall.name,
      input,
    ));
    toolCall.emitted = true;
    toolCalls.set(index, toolCall);
    if (stats) {
      stats.emittedToolCalls += 1;
    }
  }
}

function mapRole(message: vscode.LanguageModelChatRequestMessage): 'user' | 'assistant' | 'system' {
  if (message.role === vscode.LanguageModelChatMessageRole.User) {
    return 'user';
  }

  if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
    return 'assistant';
  }

  return 'system';
}

function isToolResultPart(value: unknown): value is {
  callId: string;
  content?: readonly unknown[];
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.callId === 'string' && 'content' in record;
}

function collectToolResultText(parts?: readonly unknown[]): string {
  return (parts ?? []).map((part) => {
    if (part instanceof vscode.LanguageModelTextPart) {
      return part.value;
    }

    if (typeof part === 'string') {
      return part;
    }

    try {
      return JSON.stringify(part);
    } catch {
      return '';
    }
  }).join('');
}

function createDataUrl(part: vscode.LanguageModelDataPart): string {
  return `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`;
}

function isSupportedImage(mimeType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
}

function stringifyToolInput(input: unknown): string {
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return '{}';
  }
}

function parseToolArguments(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatStreamError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
