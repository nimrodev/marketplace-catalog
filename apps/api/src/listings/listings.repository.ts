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

// Enforces visibility where the data is fetched, not where the request
// arrives (MAR-15): every accessor on this repository must route through
// here, so there is no query path that can hand back an unpublished
// listing to an unauthorised viewer.
//
// Contributors see their own listings in ANY status per the issue's
// literal wording — that is read here as "any value of the status
// column", not as also overriding deleted_at. A contributor's own
// soft-deleted listing is untested by the acceptance criteria; this
// implementation leaves it visible to its owner. Worth flagging as a
// judgement call, not a settled spec answer.
function scopeToVisible(qb: SelectQueryBuilder<Listing>, viewer: Viewer): SelectQueryBuilder<Listing> {
  if (viewer.role === UserRole.MODERATOR || viewer.role === UserRole.ADMIN) {
    return qb;
  }

  if (viewer.role === UserRole.CONTRIBUTOR) {
    // TypeORM does not wrap a raw andWhere() string in its own parens, so
    // an inline OR here would escape any preceding AND (e.g. the id
    // filter in findVisibleById) rather than staying scoped to this
    // condition. Brackets is what actually groups it — caught live by a
    // failing leak test, not assumed.
    return qb.andWhere(
      new Brackets((sub) => {
        sub
          .where('listing.status = :published AND listing.deletedAt IS NULL', { published: ListingStatus.PUBLISHED })
          .orWhere('listing.contributorId = :userId', { userId: viewer.userId });
      }),
    );
  }

  return qb.andWhere('listing.status = :published AND listing.deletedAt IS NULL', {
    published: ListingStatus.PUBLISHED,
  });
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
