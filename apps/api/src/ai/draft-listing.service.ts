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
import { MAX_PHOTO_KEYS } from './dto/draft-listing-request.dto';

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
      title: { type: 'string' as const, description: "The product's name — brand, model, and variant, not a description of the photo" },
      description: { type: 'string' as const, description: 'A short intro plus a spec list relevant to the product type, for buyers' },
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
    'title: the product\'s actual name — brand, model, and distinguishing variant (e.g. "Apple MacBook Air 13\\" (Starlight)", "Nike Air Max 90"). Never describe the photo itself (never write things like "Keyboard/Trackpad View" or "Front view").',
    'description: 1-2 sentences, then a short spec list of whatever applies to this kind of product (electronics: Storage, Memory, Processor, Screen size; furniture: Material, Dimensions; clothing: Size, Material — use your judgement for the category). State a spec you can confidently determine from visible branding, model markings, or well-known specs for that exact model. If a spec cannot be determined from the photos, write "Not specified — please confirm" for that line rather than omitting it or guessing a number.',
    'Condition is different: only describe wear, damage, or cosmetic condition you can actually see in the photos — never assume "like new" or invent flaws that aren\'t visible.',
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

    const images = await this.fetchImages(photoKeys.slice(0, MAX_PHOTO_KEYS));

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
