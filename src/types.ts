export type ApiType = 'openai' | 'anthropic';

export interface ModelConfig {
  id: string;
  apiType?: ApiType;
  configId?: string;
  displayName?: string;
  provider?: string;
  baseUrl?: string;
  family?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  vision?: boolean;
  toolCalling?: boolean;
  temperature?: number | null;
  topP?: number | null;
  reasoningEffort?: string;
  thinkingBudgetTokens?: number;
  headers?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ResolvedModelConfig extends ModelConfig {
  id: string;
  apiType: ApiType;
  registeredId: string;
  provider: string;
  baseUrl: string;
  displayName: string;
  family: string;
  contextLength: number;
  maxOutputTokens: number;
  vision: boolean;
  toolCalling: boolean;
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  stream: true;
  stream_options?: {
    include_usage?: boolean;
  };
  tools?: OpenAIFunctionTool[];
  tool_choice?: 'auto' | 'required' | {
    type: 'function';
    function: {
      name: string;
    };
  };
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  reasoning_effort?: string;
  [key: string]: unknown;
}

export interface RetryConfig {
  maxAttempts: number;
  intervalMs: number;
}
