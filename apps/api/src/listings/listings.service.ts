import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LISTING_LIMITS, ListingDetail, ListingStatus, RiskLevel, UserRole, runDeterministicChecks } from '@marketplace/shared';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { PreScreenQueueService } from '../pre-screen/pre-screen-queue.service';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
import { UpdateListingRequestDto } from './dto/update-listing-request.dto';
import { transition as transitionListing } from './listing-state-machine';
import { ListingsRepository, Viewer } from './listings.repository';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly listings: ListingsRepository,
    private readonly photoOwnership: PhotoOwnershipValidator,
    private readonly preScreenQueue: PreScreenQueueService,
  ) {}

  async create(contributorId: string, dto: CreateListingRequestDto): Promise<ListingDetail> {
    await this.photoOwnership.validate(contributorId, dto.photoKeys);

    const screen = runDeterministicChecks({
      title: dto.title,
      description: dto.description,
      price: dto.price,
      category: dto.category,
      photoCount: dto.photoKeys.length,
    });
    if (screen.level === RiskLevel.HIGH) {
      throw new BadRequestException(`This listing cannot be submitted: ${screen.reasons.join(', ')}.`);
    }

    const created = await this.listings.create(contributorId, dto);
    // After the transaction, never inside it — the worker must never pick
    // up a listing that isn't durably committed yet.
    await this.preScreenQueue.enqueue(created.id);
    return created;
  }

  async update(actor: AuthenticatedUser, listingId: string, dto: UpdateListingRequestDto): Promise<ListingDetail> {
    const listing = await this.listings.findEditableById(listingId);
    if (!listing) {
      throw new NotFoundException();
    }
    if (actor.role === UserRole.CONTRIBUTOR && listing.contributorId !== actor.id) {
      throw new ForbiddenException();
    }

    if (dto.photoKeys) {
      // Photos always live under the listing owner's namespace, regardless
      // of who is editing — a moderator edit doesn't re-home them.
      await this.photoOwnership.validate(listing.contributorId, dto.photoKeys);
    }

    const screen = runDeterministicChecks({
      title: dto.title ?? listing.title,
      description: dto.description ?? listing.description,
      price: dto.price ?? Number(listing.price),
      category: dto.category ?? listing.category,
      // Photos unchanged when photoKeys is absent from the update — the
      // existing row is guaranteed non-zero (photoOwnership.validate above
      // enforces layer-1's minimum whenever photoKeys is provided).
      photoCount: dto.photoKeys?.length ?? 1,
    });
    if (screen.level === RiskLevel.HIGH) {
      throw new BadRequestException(`This listing cannot be submitted: ${screen.reasons.join(', ')}.`);
    }

    const nextStatus = transitionListing(listing.status, 'edit', { role: actor.role });
    const rejectionReason = nextStatus === ListingStatus.PENDING ? null : listing.rejectionReason;
    const entersReview = listing.status !== ListingStatus.PENDING && nextStatus === ListingStatus.PENDING;

    let minPrice: string | null | undefined;
    if (dto.minPrice !== undefined) {
      minPrice = dto.minPrice.toFixed(LISTING_LIMITS.price.maxDecimals);
    } else if (dto.isNegotiable === false) {
      minPrice = null;
    }

    await this.listings.update(
      listingId,
      {
        title: dto.title,
        description: dto.description,
        price: dto.price !== undefined ? dto.price.toFixed(LISTING_LIMITS.price.maxDecimals) : undefined,
        condition: dto.condition,
        category: dto.category,
        isNegotiable: dto.isNegotiable,
        minPrice,
        options: dto.options,
      },
      { status: nextStatus, rejectionReason },
      dto.photoKeys,
    );

    if (entersReview) {
      // After the transaction, never inside it — same reasoning as create().
      await this.preScreenQueue.enqueue(listingId);
    }

    const viewer: Viewer =
      actor.role === UserRole.CONTRIBUTOR ? { role: UserRole.CONTRIBUTOR, userId: actor.id } : { role: actor.role };
    // findEditableById already proved the row exists, so this can't be null.
    return (await this.listings.findDetail(listingId, viewer))!;
  }

  // findEditableById already excludes soft-deleted rows, so a second
  // delete of the same listing lands here too — 404 both times is what
  // makes this idempotent, not a second no-op success response.
  async remove(actor: AuthenticatedUser, listingId: string): Promise<void> {
    const listing = await this.listings.findEditableById(listingId);
    if (!listing) {
      throw new NotFoundException();
    }
    await this.listings.softDelete(listingId);
    this.logger.log({ event: 'listing.deleted', listingId, moderatorId: actor.id });
  }
}
