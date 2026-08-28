import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LISTING_LIMITS, ListingDetail, ListingStatus, RiskLevel, UserRole, runDeterministicChecks } from '@marketplace/shared';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
import { UpdateListingRequestDto } from './dto/update-listing-request.dto';
import { transition as transitionListing } from './listing-state-machine';
import { ListingsRepository, Viewer } from './listings.repository';

@Injectable()
export class ListingsService {
  constructor(
    private readonly listings: ListingsRepository,
    private readonly photoOwnership: PhotoOwnershipValidator,
  ) {}

  async create(contributorId: string, dto: CreateListingRequestDto): Promise<ListingDetail> {
    await this.photoOwnership.validate(contributorId, dto.photoKeys);

    const screen = runDeterministicChecks({
      title: dto.title,
      description: dto.description,
      price: dto.price,
      category: dto.category,
    });
    if (screen.level === RiskLevel.HIGH) {
      throw new BadRequestException(`This listing cannot be submitted: ${screen.reasons.join(', ')}.`);
    }

    // Pre-screen queue publish is deliberately not wired up — no queue
    // consumer exists yet.
    return this.listings.create(contributorId, dto);
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
    });
    if (screen.level === RiskLevel.HIGH) {
      throw new BadRequestException(`This listing cannot be submitted: ${screen.reasons.join(', ')}.`);
    }

    const nextStatus = transitionListing(listing.status, 'edit', { role: actor.role });
    const rejectionReason = nextStatus === ListingStatus.PENDING ? null : listing.rejectionReason;

    // Pre-screen re-enqueue is deliberately not wired up — no queue
    // consumer exists yet, same as create() above.
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

    const viewer: Viewer =
      actor.role === UserRole.CONTRIBUTOR ? { role: UserRole.CONTRIBUTOR, userId: actor.id } : { role: actor.role };
    // findEditableById already proved the row exists, so this can't be null.
    return (await this.listings.findDetail(listingId, viewer))!;
  }
}
