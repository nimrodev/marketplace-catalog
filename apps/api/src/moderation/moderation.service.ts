import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ListingDetail, ListingStatus, UserRole } from '@marketplace/shared';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { IllegalListingTransitionError, transition } from '../listings/listing-state-machine';
import { ListingsRepository, Viewer } from '../listings/listings.repository';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly listings: ListingsRepository) {}

  async approve(moderator: AuthenticatedUser, listingId: string): Promise<ListingDetail> {
    const listing = await this.listings.findEditableById(listingId);
    if (!listing) {
      throw new NotFoundException();
    }

    const nextStatus = this.applyTransition(listing.status, 'approve', moderator, undefined);
    await this.listings.setModerationStatus(listingId, {
      status: nextStatus,
      rejectionReason: null,
      publishedAt: new Date(),
    });

    this.logger.log({ event: 'listing.approved', listingId, moderatorId: moderator.id });
    return this.reload(listingId, moderator);
  }

  async reject(moderator: AuthenticatedUser, listingId: string, reason: string): Promise<ListingDetail> {
    const listing = await this.listings.findEditableById(listingId);
    if (!listing) {
      throw new NotFoundException();
    }

    const nextStatus = this.applyTransition(listing.status, 'reject', moderator, reason);
    await this.listings.setModerationStatus(listingId, { status: nextStatus, rejectionReason: reason });

    this.logger.log({ event: 'listing.rejected', listingId, moderatorId: moderator.id, reason });
    return this.reload(listingId, moderator);
  }

  // requireAtLeast(MODERATOR) inside transition() is a backstop here —
  // @Roles(MODERATOR) on the controller already turned an under-privileged
  // caller into a 403 before this ever runs. What this actually surfaces
  // as a 400 is an illegal status transition (e.g. approving twice).
  private applyTransition(
    current: ListingStatus,
    action: 'approve' | 'reject',
    moderator: AuthenticatedUser,
    reason: string | undefined,
  ): ListingStatus {
    try {
      return transition(current, action, { role: moderator.role }, reason);
    } catch (err) {
      if (err instanceof IllegalListingTransitionError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // moderator.role is MODERATOR or ADMIN here — @Roles(MODERATOR) on the
  // controller already rejected anything lower before this runs.
  private async reload(listingId: string, moderator: AuthenticatedUser): Promise<ListingDetail> {
    const viewer: Viewer = { role: moderator.role as UserRole.MODERATOR | UserRole.ADMIN };
    // findEditableById already proved the row exists, so this can't be null.
    return (await this.listings.findDetail(listingId, viewer))!;
  }
}
