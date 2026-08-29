import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { AiSchemaValidationError, AiTimeoutError, AiUnavailableError } from './ai-errors';
import { AnthropicClientService } from './anthropic-client.service';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  const actual = jest.requireActual('@anthropic-ai/sdk');
  const MockAnthropic = jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
  Object.assign(MockAnthropic, {
    APIError: actual.default.APIError,
    APIConnectionTimeoutError: actual.default.APIConnectionTimeoutError,
    APIConnectionError: actual.default.APIConnectionError,
  });
  return { __esModule: true, default: MockAnthropic };
});

function buildConfig(apiKey: string | undefined): ConfigService {
  return { get: (key: string) => (key === 'ANTHROPIC_API_KEY' ? apiKey : undefined) } as unknown as ConfigService;
}

const schema = z.object({ title: z.string() });
const baseParams = {
  model: 'claude-sonnet-5',
  system: 'system prompt',
  prompt: 'user prompt',
  toolName: 'emit_draft',
  toolDescription: 'emits a draft',
  jsonSchema: { type: 'object' as const, properties: { title: { type: 'string' } }, required: ['title'] },
  schema,
};

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    content: [{ type: 'tool_use', id: 'tool_1', name: 'emit_draft', input: { title: 'A listing' } }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 } as Anthropic.Usage,
    ...overrides,
  } as Anthropic.Message;
}

describe('AnthropicClientService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws AiUnavailableError and never touches the SDK when the key is unset', async () => {
    const service = new AnthropicClientService(buildConfig(undefined));
    await expect(service.generateStructured(baseParams)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns typed, schema-validated output for a well-formed tool_use response', async () => {
    mockCreate.mockResolvedValue(message());
    const service = new AnthropicClientService(buildConfig('sk-test'));

    const result = await service.generateStructured(baseParams);

    expect(result).toEqual({ title: 'A listing' });
  });

  it('raises AiSchemaValidationError when no matching tool_use block is returned', async () => {
    mockCreate.mockResolvedValue(
      message({ content: [{ type: 'text', text: 'no tool call here' } as unknown as Anthropic.ContentBlock] }),
    );
    const service = new AnthropicClientService(buildConfig('sk-test'));

    await expect(service.generateStructured(baseParams)).rejects.toBeInstanceOf(AiSchemaValidationError);
  });

  it('raises AiSchemaValidationError when the tool_use input fails the zod schema', async () => {
    mockCreate.mockResolvedValue(
      message({
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'emit_draft', input: { title: 123 } } as unknown as Anthropic.ContentBlock,
        ],
      }),
    );
    const service = new AnthropicClientService(buildConfig('sk-test'));

    await expect(service.generateStructured(baseParams)).rejects.toBeInstanceOf(AiSchemaValidationError);
  });

  it('maps a connection timeout to AiTimeoutError', async () => {
    mockCreate.mockRejectedValue(
      new Anthropic.APIConnectionTimeoutError({ message: 'Request timed out.' }),
    );
    const service = new AnthropicClientService(buildConfig('sk-test'));

    await expect(service.generateStructured(baseParams)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it('maps any other APIError to AiProviderError, carrying the status code', async () => {
    mockCreate.mockRejectedValue(
      new Anthropic.APIError(429, { error: { message: 'rate limited' } }, 'rate limited', new Headers()),
    );
    const service = new AnthropicClientService(buildConfig('sk-test'));

    await expect(service.generateStructured(baseParams)).rejects.toMatchObject({
      name: 'AiProviderError',
      status: 429,
    });
  });

  it('redacts the API key from a logged failure, even from an unrecognized error type', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    mockCreate.mockRejectedValue(new Error('boom near sk-secret-value-123'));
    const service = new AnthropicClientService(buildConfig('sk-secret-value-123'));

    await expect(service.generateStructured(baseParams)).rejects.toThrow();

    const loggedPayload = warnSpy.mock.calls[0][0] as { error: string };
    expect(loggedPayload.error).not.toContain('sk-secret-value-123');
    expect(loggedPayload.error).toContain('[REDACTED]');
    warnSpy.mockRestore();
  });
});
