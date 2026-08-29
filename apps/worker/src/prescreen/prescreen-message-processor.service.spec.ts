import { ListingCategory, ListingStatus, PreScreenMessage, RiskLevel } from '@marketplace/shared';
import { AiProviderError, AiSchemaValidationError, AiTimeoutError, AiUnavailableError } from '../ai/ai-errors';
import { PhotoFetcherService } from '../ai/photo-fetcher.service';
import { PrescreenAiService } from '../ai/prescreen-ai.service';
import { ListingLookupRepository } from '../risk/listing-lookup.repository';
import { ListingRiskRepository } from '../risk/listing-risk.repository';
import { PrescreenMessageProcessor } from './prescreen-message-processor.service';

describe('PrescreenMessageProcessor', () => {
  const listing = {
    id: 'listing-1',
    title: 'A perfectly normal listing',
    description: 'A perfectly normal description that is long enough to pass the checks.',
    price: '100.00',
    category: ListingCategory.ELECTRONICS,
    status: ListingStatus.PENDING,
  };
  const photo = { id: 'photo-1', listingId: 'listing-1', s3Key: 'listings/u/1.jpg', sortOrder: 0 };
  const message: PreScreenMessage = { listingId: 'listing-1', reqId: 'req-1' };

  let lookup: jest.Mocked<ListingLookupRepository>;
  let photoFetcher: jest.Mocked<PhotoFetcherService>;
  let ai: jest.Mocked<PrescreenAiService>;
  let riskRepo: jest.Mocked<ListingRiskRepository>;
  let processor: PrescreenMessageProcessor;

  beforeEach(() => {
    lookup = { findForPrescreen: jest.fn() } as unknown as jest.Mocked<ListingLookupRepository>;
    photoFetcher = { fetch: jest.fn() } as unknown as jest.Mocked<PhotoFetcherService>;
    ai = { screen: jest.fn() } as unknown as jest.Mocked<PrescreenAiService>;
    riskRepo = { upsert: jest.fn() } as unknown as jest.Mocked<ListingRiskRepository>;
    processor = new PrescreenMessageProcessor(lookup, photoFetcher, ai, riskRepo);
  });

  it('returns not-found and never upserts when the listing no longer exists', async () => {
    lookup.findForPrescreen.mockResolvedValue(null);

    const outcome = await processor.process(message);

    expect(outcome).toEqual({ status: 'not-found' });
    expect(riskRepo.upsert).not.toHaveBeenCalled();
  });

  it('combines deterministic and AI results to the higher level on the happy path', async () => {
    lookup.findForPrescreen.mockResolvedValue({ listing, photos: [photo] });
    photoFetcher.fetch.mockResolvedValue([]);
    ai.screen.mockResolvedValue({ level: RiskLevel.MEDIUM, reasons: ['ai reason'], flags: ['ai flag'] });

    const outcome = await processor.process(message);

    expect(outcome).toEqual({ status: 'processed', level: RiskLevel.MEDIUM });
    expect(riskRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 'listing-1',
        level: RiskLevel.MEDIUM,
        reasons: expect.arrayContaining(['ai reason']),
        flags: expect.arrayContaining(['ai flag']),
        model: 'claude-haiku-4-5-20251001',
      }),
    );
  });

  it.each([
    ['missing API key', new AiUnavailableError()],
    ['a schema-violating response', new AiSchemaValidationError('bad shape')],
    ['a timeout', new AiTimeoutError()],
    ['a 429 rate-limit response', new AiProviderError(429, 'rate limited')],
    ['a 500 provider error', new AiProviderError(500, 'internal error')],
    ['an unrecognized error', new Error('unexpected')],
  ])('persists the deterministic-only result rather than nothing when the AI call fails with %s', async (_label, error) => {
    lookup.findForPrescreen.mockResolvedValue({ listing, photos: [photo] });
    photoFetcher.fetch.mockResolvedValue([]);
    ai.screen.mockRejectedValue(error);

    const outcome = await processor.process(message);

    expect(outcome.status).toBe('processed');
    expect(riskRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: 'listing-1',
        model: 'deterministic-only',
      }),
    );
  });

  it('falls back to deterministic-only when the photo fetch itself fails', async () => {
    lookup.findForPrescreen.mockResolvedValue({ listing, photos: [photo] });
    photoFetcher.fetch.mockRejectedValue(new Error('S3 unreachable'));

    const outcome = await processor.process(message);

    expect(outcome.status).toBe('processed');
    expect(ai.screen).not.toHaveBeenCalled();
    expect(riskRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ model: 'deterministic-only' }));
  });
});
