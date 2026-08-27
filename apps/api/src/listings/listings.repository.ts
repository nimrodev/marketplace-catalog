import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ListingStatus, UserRole } from '@marketplace/shared';
import { Listing } from './listing.entity';

export type Viewer =
  | { role: null }
  | { role: UserRole.CONTRIBUTOR; userId: string }
  | { role: UserRole.MODERATOR | UserRole.ADMIN };

const NOT_DELETED = 'listing.deletedAt IS NULL';
const IS_PUBLISHED = 'listing.status = :published';

// Every accessor must route through here (MAR-15) — visibility is
// enforced where data is fetched, not at the controller.
//
// deleted_at excludes everyone but moderator/admin, owner included:
// delete is moderator-only (PLAN.md), so a soft-deleted listing was
// taken down BY a moderator, not its owner.
function scopeToVisible(qb: SelectQueryBuilder<Listing>, viewer: Viewer): SelectQueryBuilder<Listing> {
  if (viewer.role === UserRole.MODERATOR || viewer.role === UserRole.ADMIN) {
    return qb;
  }

  if (viewer.role === UserRole.CONTRIBUTOR) {
    // NOT_DELETED as its own andWhere() call stays outside the OR below
    // (each where()/andWhere() call is auto-parenthesized by TypeORM).
    return qb.andWhere(NOT_DELETED).andWhere(
      new Brackets((sub) => {
        sub
          .where(IS_PUBLISHED, { published: ListingStatus.PUBLISHED })
          .orWhere('listing.contributorId = :userId', { userId: viewer.userId });
      }),
    );
  }

  return qb.andWhere(NOT_DELETED).andWhere(IS_PUBLISHED, { published: ListingStatus.PUBLISHED });
}

export class ListingsRepository {
  constructor(private readonly repo: Repository<Listing>) {}

  // null for "doesn't exist" and "exists but hidden" alike — no signal
  // to leak, so no path to a 403.
  findVisibleById(id: string, viewer: Viewer): Promise<Listing | null> {
    const qb = this.repo.createQueryBuilder('listing').where('listing.id = :id', { id });
    return scopeToVisible(qb, viewer).getOne();
  }
}
