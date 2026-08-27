import { ListingStatus, USER_ROLE_RANK, UserRole } from '@marketplace/shared';

export type ListingAction = 'approve' | 'reject' | 'edit';

export interface ListingActor {
  role: UserRole;
}

export class IllegalListingTransitionError extends Error {}

function requireAtLeast(actor: ListingActor, role: UserRole): void {
  if (USER_ROLE_RANK[actor.role] < USER_ROLE_RANK[role]) {
    throw new IllegalListingTransitionError(
      `Role ${actor.role} cannot perform this action — requires at least ${role}.`,
    );
  }
}

// Pure state machine — no TypeORM, no Nest, testable in isolation.
// "Everything else throws" governs status CHANGES; edit is legal from any
// status, it just doesn't always change anything (see the edit case below).
export function transition(
  current: ListingStatus,
  action: ListingAction,
  actor: ListingActor,
  reason?: string,
): ListingStatus {
  switch (action) {
    case 'approve': {
      requireAtLeast(actor, UserRole.MODERATOR);
      if (current !== ListingStatus.PENDING) {
        throw new IllegalListingTransitionError(`Cannot approve a listing that is ${current}.`);
      }
      return ListingStatus.PUBLISHED;
    }

    case 'reject': {
      requireAtLeast(actor, UserRole.MODERATOR);
      if (current !== ListingStatus.PENDING) {
        throw new IllegalListingTransitionError(`Cannot reject a listing that is ${current}.`);
      }
      if (!reason || reason.trim().length === 0) {
        throw new IllegalListingTransitionError('Rejecting a listing requires a reason.');
      }
      return ListingStatus.REJECTED;
    }

    case 'edit': {
      // A contributor editing a PUBLISHED or REJECTED listing sends it back
      // for review — the rule that makes moderation meaningful, since
      // otherwise publish-then-edit would bypass review entirely. A
      // moderator's edit never changes status (no self-review loop), and a
      // contributor editing an already-PENDING listing is a no-op — it's
      // already awaiting review, there's nothing to revert.
      const isContributor = actor.role === UserRole.CONTRIBUTOR;
      const revertsToReview =
        current === ListingStatus.PUBLISHED || current === ListingStatus.REJECTED;
      return isContributor && revertsToReview ? ListingStatus.PENDING : current;
    }
  }
}
