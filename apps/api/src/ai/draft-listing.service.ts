import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { ALLOWED_PHOTO_CONTENT_TYPES, DraftListingResponse, ListingCategory, ListingCondition, PhotoContentType } from '@marketplace/shared';
import { createS3Client } from '../uploads/s3-client.factory';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';
import { AiSchemaValidationError, AiTimeoutError, AiUnavailableError } from './ai-errors';
import { AnthropicClientService, StructuredImage } from './anthropic-client.service';
import { DRAFT_LISTING_MODEL } from './anthropic-models';

// The vision call gets diminishing returns past a handful of photos and
// direct S3 reads cost latency and money — 3 is enough context for a
// reasonable draft without ballooning the request.
const MAX_PHOTOS_SENT_TO_MODEL = 3;
const TIMEOUT_MS = 15_000;
const TOOL_NAME = 'emit_listing_draft';

const draftSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(ListingCategory),
  condition: z.enum(ListingCondition),
  suggestedPriceMin: z.number().nonnegative(),
  suggestedPriceMax: z.number().nonnegative(),
});

function buildJsonSchema() {
  return {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const, description: 'A short, marketplace-style listing title' },
      description: { type: 'string' as const, description: 'A 1-3 sentence description of the item for buyers' },
      category: { type: 'string' as const, enum: Object.values(ListingCategory) },
      condition: { type: 'string' as const, enum: Object.values(ListingCondition) },
      suggestedPriceMin: { type: 'number' as const, description: 'Lower bound of a fair resale price, in whole currency units' },
      suggestedPriceMax: { type: 'number' as const, description: 'Upper bound of a fair resale price, in whole currency units' },
    },
    required: ['title', 'description', 'category', 'condition', 'suggestedPriceMin', 'suggestedPriceMax'],
  };
}

function buildSystemPrompt(): string {
  return [
    'You draft secondhand marketplace listings from item photos for a contributor to review and edit.',
    'Describe only what is visibly present in the photos — never invent brand, model, or condition details you cannot see.',
    `category must be exactly one of: ${Object.values(ListingCategory).join(', ')}.`,
    `condition must be exactly one of: ${Object.values(ListingCondition).join(', ')}.`,
    'suggestedPriceMin and suggestedPriceMax are a fair resale price range, not a fixed price — they are shown to the contributor as a suggestion only.',
  ].join(' ');
}

@Injectable()
export class DraftListingService {
  private readonly logger = new Logger(DraftListingService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    config: ConfigService,
    private readonly ownership: PhotoOwnershipValidator,
    private readonly anthropic: AnthropicClientService,
  ) {
    this.s3 = createS3Client(config);
    this.bucket = config.getOrThrow<string>('S3_PHOTOS_BUCKET');
  }

  async draft(userId: string, photoKeys: string[]): Promise<DraftListingResponse> {
    await this.ownership.validate(userId, photoKeys);

    const images = await this.fetchImages(photoKeys.slice(0, MAX_PHOTOS_SENT_TO_MODEL));

    try {
      return await this.anthropic.generateStructured({
        model: DRAFT_LISTING_MODEL,
        system: buildSystemPrompt(),
        prompt: 'Draft a listing for the item shown in the attached photo(s).',
        images,
        toolName: TOOL_NAME,
        toolDescription: 'Emits a structured draft listing for a secondhand marketplace.',
        jsonSchema: buildJsonSchema(),
        schema: draftSchema,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof AiUnavailableError || err instanceof AiTimeoutError) {
        throw new ServiceUnavailableException('AI draft is unavailable right now — fill in the details manually.');
      }
      if (err instanceof AiSchemaValidationError) {
        throw new BadGatewayException('AI draft is unavailable right now — fill in the details manually.');
      }
      // AiProviderError and anything unrecognized: same client-facing message.
      // The status is logged for diagnosis but never leaked to the caller.
      this.logger.warn({ event: 'ai.draft.failed', error: err instanceof Error ? err.message : 'unknown error' });
      throw new ServiceUnavailableException('AI draft is unavailable right now — fill in the details manually.');
    }
  }

  private async fetchImages(photoKeys: string[]): Promise<StructuredImage[]> {
    const images: StructuredImage[] = [];
    for (const key of photoKeys) {
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await object.Body?.transformToByteArray();
      if (!bytes) continue;
      const mediaType = isSupportedMediaType(object.ContentType) ? object.ContentType : 'image/jpeg';
      images.push({ mediaType, base64: Buffer.from(bytes).toString('base64') });
    }
    return images;
  }
}

function isSupportedMediaType(value: string | undefined): value is PhotoContentType {
  return !!value && (ALLOWED_PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}
