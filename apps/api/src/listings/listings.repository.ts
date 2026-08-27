import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ListingStatus, UserRole } from '@marketplace/shared';
import { Listing } from './listing.entity';

// Plain class over a TypeORM Repository<Listing>, not a NestJS
// @Injectable — no module wires this into DI yet (that lands with the
// controller in MAR-21). Keeping it Nest-free until something actually
// needs the DI wiring matches the pure-function convention already used
// for listing-state-machine.ts and cursor.ts.

export type Viewer =
  | { role: null }
  | { role: UserRole.CONTRIBUTOR; userId: string }
  | { role: UserRole.MODERATOR | UserRole.ADMIN };

const NOT_DELETED = 'listing.deletedAt IS NULL';
const IS_PUBLISHED = 'listing.status = :published';

// Enforces visibility where the data is fetched, not where the request
// arrives (MAR-15): every accessor on this repository must route through
// here, so there is no query path that can hand back an unpublished
// listing to an unauthorised viewer.
//
// Delete is moderator-only (PLAN.md §soft-delete) — a soft-deleted
// listing was taken down BY a moderator, not by its owner, so deleted_at
// is a hard exclusion for everyone except moderator/admin, including the
// listing's own contributor. "Contributors see their own listings in any
// status" (the issue's wording) is read as "any value of the status
// column" — deleted_at is a separate axis, not a status value, and isn't
// covered by that grant.
function scopeToVisible(qb: SelectQueryBuilder<Listing>, viewer: Viewer): SelectQueryBuilder<Listing> {
  if (viewer.role === UserRole.MODERATOR || viewer.role === UserRole.ADMIN) {
    return qb;
  }

  if (viewer.role === UserRole.CONTRIBUTOR) {
    // NOT_DELETED as its own andWhere() keeps it a single top-level AND
    // term (TypeORM wraps each where()/andWhere() call in its own parens),
    // so it can't be pulled into the OR below by accident — no Brackets
    // nesting needed for this part, only for the status/owner OR itself.
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

  // Returns null both when the row does not exist and when it exists but
  // the viewer isn't allowed to see it — those two cases are
  // indistinguishable by construction, which is what makes a 403 leak
  // impossible for any caller built on top of this.
  findVisibleById(id: string, viewer: Viewer): Promise<Listing | null> {
    const qb = this.repo.createQueryBuilder('listing').where('listing.id = :id', { id });
    return scopeToVisible(qb, viewer).getOne();
  }
}
