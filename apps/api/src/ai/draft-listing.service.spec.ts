import { ConfigService } from '@nestjs/config';
import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ListingCategory, ListingCondition } from '@marketplace/shared';
import { AiProviderError, AiSchemaValidationError, AiTimeoutError, AiUnavailableError } from './ai-errors';
import { AnthropicClientService } from './anthropic-client.service';
import { DraftListingService } from './draft-listing.service';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';

function buildConfig(): ConfigService {
  const values: Record<string, string> = {
    AWS_REGION: 'eu-central-1',
    S3_PHOTOS_BUCKET: 'marketplace-catalog-photos',
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

function buildOwnership(overrides: Partial<PhotoOwnershipValidator> = {}): jest.Mocked<PhotoOwnershipValidator> {
  return { validate: jest.fn().mockResolvedValue(undefined), ...overrides } as unknown as jest.Mocked<PhotoOwnershipValidator>;
}

function buildAnthropic(overrides: Partial<AnthropicClientService> = {}): jest.Mocked<AnthropicClientService> {
  return { generateStructured: jest.fn(), ...overrides } as unknown as jest.Mocked<AnthropicClientService>;
}

const draftPayload = {
  title: 'Wooden dining chair',
  description: 'A sturdy wooden dining chair in good condition.',
  category: ListingCategory.FURNITURE,
  condition: ListingCondition.GOOD,
  suggestedPriceMin: 20,
  suggestedPriceMax: 40,
};

describe('DraftListingService', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentType: 'image/jpeg',
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
    } as never);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('re-runs ownership validation and rejects before touching S3 or the model when it fails', async () => {
    const ownership = buildOwnership({ validate: jest.fn().mockRejectedValue(new BadRequestException('not yours')) });
    const anthropic = buildAnthropic();
    const service = new DraftListingService(buildConfig(), ownership, anthropic);

    await expect(service.draft('user-1', ['listings/other-user/photo.jpg'])).rejects.toBeInstanceOf(BadRequestException);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(anthropic.generateStructured).not.toHaveBeenCalled();
  });

  it('returns a well-formed draft for a valid photo', async () => {
    const ownership = buildOwnership();
    const anthropic = buildAnthropic({ generateStructured: jest.fn().mockResolvedValue(draftPayload) });
    const service = new DraftListingService(buildConfig(), ownership, anthropic);

    const result = await service.draft('user-1', ['listings/user-1/photo.jpg']);

    expect(result).toEqual(draftPayload);
    expect(ownership.validate).toHaveBeenCalledWith('user-1', ['listings/user-1/photo.jpg']);
    expect(anthropic.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 15_000, images: [{ mediaType: 'image/jpeg', base64: expect.any(String) }] }),
    );
  });

  it('caps the photos sent to the model at 3', async () => {
    const ownership = buildOwnership();
    const anthropic = buildAnthropic({ generateStructured: jest.fn().mockResolvedValue(draftPayload) });
    const service = new DraftListingService(buildConfig(), ownership, anthropic);

    await service.draft('user-1', ['a', 'b', 'c', 'd', 'e'].map((k) => `listings/user-1/${k}.jpg`));

    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['missing API key', new AiUnavailableError()],
    ['a timeout', new AiTimeoutError()],
    ['a 429 rate-limit response', new AiProviderError(429, 'rate limited')],
    ['a 500 provider error', new AiProviderError(500, 'internal error')],
  ])('degrades %s to a clean 503 instead of crashing', async (_label, error) => {
    const ownership = buildOwnership();
    const anthropic = buildAnthropic({ generateStructured: jest.fn().mockRejectedValue(error) });
    const service = new DraftListingService(buildConfig(), ownership, anthropic);

    await expect(service.draft('user-1', ['listings/user-1/photo.jpg'])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('degrades AiSchemaValidationError to a 502, distinct from a caller-side failure', async () => {
    const ownership = buildOwnership();
    const anthropic = buildAnthropic({ generateStructured: jest.fn().mockRejectedValue(new AiSchemaValidationError('bad shape')) });
    const service = new DraftListingService(buildConfig(), ownership, anthropic);

    await expect(service.draft('user-1', ['listings/user-1/photo.jpg'])).rejects.toBeInstanceOf(BadGatewayException);
  });
});
