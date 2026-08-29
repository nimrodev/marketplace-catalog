import { Injectable, Logger } from '@nestjs/common';
import { PreScreenMessage, RiskLevel, runDeterministicChecks } from '@marketplace/shared';
import { PhotoFetcherService } from '../ai/photo-fetcher.service';
import { PrescreenAiService } from '../ai/prescreen-ai.service';
import { PRESCREEN_MODEL } from '../ai/anthropic-models';
import { combineRiskLevels } from '../risk/combine-risk-levels';
import { ListingLookupRepository } from '../risk/listing-lookup.repository';
import { ListingRiskRepository } from '../risk/listing-risk.repository';

// Same cap and reasoning as apps/api's DraftListingService (MAX_PHOTO_KEYS):
// controls vision-call cost/latency, and 3 photos is plenty of signal for
// a policy screen.
const MAX_PRESCREEN_PHOTOS = 3;
const DETERMINISTIC_ONLY_MODEL = 'deterministic-only';

export type PrescreenOutcome = { status: 'processed'; level: RiskLevel } | { status: 'not-found' };

@Injectable()
export class PrescreenMessageProcessor {
  private readonly logger = new Logger(PrescreenMessageProcessor.name);

  constructor(
    private readonly lookup: ListingLookupRepository,
    private readonly photoFetcher: PhotoFetcherService,
    private readonly ai: PrescreenAiService,
    private readonly riskRepo: ListingRiskRepository,
  ) {}

  async process(message: PreScreenMessage): Promise<PrescreenOutcome> {
    const found = await this.lookup.findForPrescreen(message.listingId);
    if (!found) {
      return { status: 'not-found' };
    }
    const { listing, photos } = found;

    const deterministic = runDeterministicChecks({
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      category: listing.category,
      photoCount: photos.length,
    });

    let level = deterministic.level;
    let reasons = deterministic.reasons;
    let flags = deterministic.flags;
    let model = DETERMINISTIC_ONLY_MODEL;

    try {
      const photoKeys = photos.slice(0, MAX_PRESCREEN_PHOTOS).map((photo) => photo.s3Key);
      const images = await this.photoFetcher.fetch(photoKeys);
      const aiResult = await this.ai.screen({ title: listing.title, description: listing.description, images });
      level = combineRiskLevels(deterministic.level, aiResult.level);
      reasons = [...deterministic.reasons, ...aiResult.reasons];
      flags = [...deterministic.flags, ...aiResult.flags];
      model = PRESCREEN_MODEL;
    } catch (err) {
      // AI unavailable, timed out, returned an unparseable result, or the
      // photo fetch itself failed — the deterministic result still gets
      // persisted below rather than losing the message's work entirely.
      this.logger.warn({
        event: 'prescreen.ai_failed',
        listingId: message.listingId,
        reqId: message.reqId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await this.riskRepo.upsert({
      listingId: message.listingId,
      level,
      reasons,
      flags,
      model,
      evaluatedAt: new Date(),
    });

    return { status: 'processed', level };
  }
}
