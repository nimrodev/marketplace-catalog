import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { AiProviderError, AiSchemaValidationError, AiTimeoutError, AiUnavailableError } from './ai-errors';

// Duplicated from apps/api/src/ai/anthropic-client.service.ts — identical
// behavior (same tool-forced structured output, same error mapping), kept
// in the worker's own tree since it can't import the API's source at runtime.

export interface StructuredImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  base64: string;
}

export interface StructuredCallParams<T> {
  model: string;
  system: string;
  prompt: string;
  images?: StructuredImage[];
  toolName: string;
  toolDescription: string;
  jsonSchema: Anthropic.Tool.InputSchema;
  schema: ZodType<T>;
  maxTokens?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
// The SDK retries 408/409/429/5xx and connection errors, so this needs no
// hand-rolled backoff on top.
const MAX_RETRIES = 2;

@Injectable()
export class AnthropicClientService {
  private readonly logger = new Logger(AnthropicClientService.name);
  private readonly client: Anthropic | null;
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = this.apiKey ? new Anthropic({ apiKey: this.apiKey, maxRetries: MAX_RETRIES }) : null;
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  async generateStructured<T>(params: StructuredCallParams<T>): Promise<T> {
    if (!this.client) {
      throw new AiUnavailableError();
    }

    const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: params.prompt }];
    for (const image of params.images ?? []) {
      content.unshift({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } });
    }

    const startedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model: params.model,
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          system: params.system,
          messages: [{ role: 'user', content }],
          tools: [{ name: params.toolName, description: params.toolDescription, input_schema: params.jsonSchema }],
          tool_choice: { type: 'tool', name: params.toolName },
        },
        { timeout: params.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      );
    } catch (err) {
      const failure = this.toAiError(err);
      this.logger.warn({
        event: 'ai.call.failed',
        model: params.model,
        tool: params.toolName,
        latencyMs: Date.now() - startedAt,
        error: this.redactKey(failure.message),
      });
      throw failure;
    }

    this.logger.log({
      event: 'ai.call.completed',
      model: params.model,
      tool: params.toolName,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === params.toolName,
    );
    if (!toolUse) {
      throw new AiSchemaValidationError(`Model did not return a ${params.toolName} tool call`);
    }

    const parsed = params.schema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new AiSchemaValidationError(`${params.toolName} output failed schema validation: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  private redactKey(message: string): string {
    if (!this.apiKey) return message;
    return message.split(this.apiKey).join('[REDACTED]');
  }

  private toAiError(err: unknown): Error {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return new AiTimeoutError();
    }
    if (err instanceof Anthropic.APIError) {
      return new AiProviderError(err.status ?? null, err.message);
    }
    return new AiProviderError(null, err instanceof Error ? err.message : 'Unknown Anthropic client error');
  }
}
