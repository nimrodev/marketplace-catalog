import { UserRole, ListingStatus } from '@marketplace/shared';
import { transition, IllegalListingTransitionError } from './listing-state-machine';

const moderator = { role: UserRole.MODERATOR };
const admin = { role: UserRole.ADMIN };
const contributor = { role: UserRole.CONTRIBUTOR };

describe('transition', () => {
  describe('approve', () => {
    it('PENDING -> PUBLISHED for a moderator', () => {
      expect(transition(ListingStatus.PENDING, 'approve', moderator)).toBe(ListingStatus.PUBLISHED);
    });

    it('PENDING -> PUBLISHED for an admin (rank admits moderator-gated actions)', () => {
      expect(transition(ListingStatus.PENDING, 'approve', admin)).toBe(ListingStatus.PUBLISHED);
    });

    it('throws for a contributor (insufficient role)', () => {
      expect(() => transition(ListingStatus.PENDING, 'approve', contributor)).toThrow(
        IllegalListingTransitionError,
      );
    });

    it('throws when the listing is not PENDING', () => {
      expect(() => transition(ListingStatus.PUBLISHED, 'approve', moderator)).toThrow(
        IllegalListingTransitionError,
      );
      expect(() => transition(ListingStatus.REJECTED, 'approve', moderator)).toThrow(
        IllegalListingTransitionError,
      );
    });
  });

  describe('reject', () => {
    it('PENDING -> REJECTED for a moderator with a reason', () => {
      expect(transition(ListingStatus.PENDING, 'reject', moderator, 'Prohibited item')).toBe(
        ListingStatus.REJECTED,
      );
    });

    it('PENDING -> REJECTED for an admin with a reason', () => {
      expect(transition(ListingStatus.PENDING, 'reject', admin, 'Prohibited item')).toBe(
        ListingStatus.REJECTED,
      );
    });

    it('throws for a contributor (insufficient role)', () => {
      expect(() => transition(ListingStatus.PENDING, 'reject', contributor, 'x')).toThrow(
        IllegalListingTransitionError,
      );
    });

    it('throws without a reason', () => {
      expect(() => transition(ListingStatus.PENDING, 'reject', moderator)).toThrow(
        IllegalListingTransitionError,
      );
    });

    it('throws with an empty or whitespace-only reason', () => {
      expect(() => transition(ListingStatus.PENDING, 'reject', moderator, '')).toThrow(
        IllegalListingTransitionError,
      );
      expect(() => transition(ListingStatus.PENDING, 'reject', moderator, '   ')).toThrow(
        IllegalListingTransitionError,
      );
    });

    it('throws when the listing is not PENDING', () => {
      expect(() => transition(ListingStatus.PUBLISHED, 'reject', moderator, 'x')).toThrow(
        IllegalListingTransitionError,
      );
      expect(() => transition(ListingStatus.REJECTED, 'reject', moderator, 'x')).toThrow(
        IllegalListingTransitionError,
      );
    });
  });

  describe('edit', () => {
    it('PUBLISHED -> PENDING for a contributor — this is what makes moderation meaningful', () => {
      expect(transition(ListingStatus.PUBLISHED, 'edit', contributor)).toBe(ListingStatus.PENDING);
    });

    it('REJECTED -> PENDING for a contributor', () => {
      expect(transition(ListingStatus.REJECTED, 'edit', contributor)).toBe(ListingStatus.PENDING);
    });

    it('never changes status for a moderator, regardless of current status', () => {
      expect(transition(ListingStatus.PUBLISHED, 'edit', moderator)).toBe(ListingStatus.PUBLISHED);
      expect(transition(ListingStatus.REJECTED, 'edit', moderator)).toBe(ListingStatus.REJECTED);
      expect(transition(ListingStatus.PENDING, 'edit', moderator)).toBe(ListingStatus.PENDING);
    });

    it('never changes status for an admin, regardless of current status', () => {
      expect(transition(ListingStatus.PUBLISHED, 'edit', admin)).toBe(ListingStatus.PUBLISHED);
      expect(transition(ListingStatus.REJECTED, 'edit', admin)).toBe(ListingStatus.REJECTED);
    });

    it('is a no-op for a contributor editing an already-PENDING listing', () => {
      // Not one of the four listed transitions, but the sensible reading of
      // "everything else throws": that rule governs status CHANGES, and a
      // contributor editing their own already-pending listing shouldn't be
      // an error — there's nothing to revert, it's already awaiting review.
      expect(transition(ListingStatus.PENDING, 'edit', contributor)).toBe(ListingStatus.PENDING);
    });
  });
});
