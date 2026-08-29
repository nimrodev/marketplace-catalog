import { RiskLevel } from '@marketplace/shared';
import { AiProviderError, AiSchemaValidationError, AiTimeoutError, AiUnavailableError } from './ai-errors';
import { AnthropicClientService } from './anthropic-client.service';
import { PrescreenAiService } from './prescreen-ai.service';

function buildAnthropic(overrides: Partial<AnthropicClientService> = {}): jest.Mocked<AnthropicClientService> {
  return { generateStructured: jest.fn(), ...overrides } as unknown as jest.Mocked<AnthropicClientService>;
}

const input = { title: 'Wooden dining chair', description: 'A sturdy chair in good condition.', images: [] };

describe('PrescreenAiService', () => {
  it('returns a well-formed risk assessment for a valid response', async () => {
    const result = { level: RiskLevel.LOW, reasons: [], flags: [] };
    const anthropic = buildAnthropic({ generateStructured: jest.fn().mockResolvedValue(result) });
    const service = new PrescreenAiService(anthropic);

    await expect(service.screen(input)).resolves.toEqual(result);
    expect(anthropic.generateStructured).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 15_000 }));
  });

  // The processor (prescreen-message-processor.service.spec.ts) asserts
  // these fall back to a persisted deterministic-only result — this file
  // only asserts screen() itself doesn't swallow or reshape the error,
  // since that degradation decision belongs one layer up, not here.
  it.each([
    ['missing API key', new AiUnavailableError()],
    ['a schema-violating response', new AiSchemaValidationError('bad shape')],
    ['a timeout', new AiTimeoutError()],
    ['a 429 rate-limit response', new AiProviderError(429, 'rate limited')],
    ['a 500 provider error', new AiProviderError(500, 'internal error')],
  ])('propagates %s unchanged rather than swallowing or reshaping it', async (_label, error) => {
    const anthropic = buildAnthropic({ generateStructured: jest.fn().mockRejectedValue(error) });
    const service = new PrescreenAiService(anthropic);

    await expect(service.screen(input)).rejects.toBe(error);
  });
});
