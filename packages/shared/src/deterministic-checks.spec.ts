import { ListingCategory } from './enums';
import { RiskLevel } from './enums';
import { runDeterministicChecks } from './deterministic-checks';

function listing(overrides: Partial<Parameters<typeof runDeterministicChecks>[0]> = {}) {
  return {
    title: 'Vintage bicycle, great condition',
    description: 'A well-loved bicycle, barely used, ready for a new home.',
    price: 150,
    category: ListingCategory.SPORTS_OUTDOORS,
    ...overrides,
  };
}

describe('runDeterministicChecks', () => {
  it('LOW for a clean listing — no reasons, no flags', () => {
    const result = runDeterministicChecks(listing());
    expect(result).toEqual({ level: RiskLevel.LOW, reasons: [], flags: [] });
  });

  describe('hard hits — HIGH, rejected outright', () => {
    it.each([
      ['weapons', 'Selling a used rifle, barely fired'],
      ['drugs', 'High quality cocaine available'],
      ['counterfeit', 'Selling a counterfeit designer bag'],
      ['adult content', 'Offering an escort service'],
    ])('flags %s content in the description', (expectedReason, description) => {
      const result = runDeterministicChecks(listing({ description }));
      expect(result.level).toBe(RiskLevel.HIGH);
      expect(result.reasons).toContain(expectedReason);
    });

    it('matches in the title too, not just the description', () => {
      const result = runDeterministicChecks(listing({ title: 'Brand new pistol for sale' }));
      expect(result.level).toBe(RiskLevel.HIGH);
      expect(result.reasons).toContain('weapons');
    });

    it('is case-insensitive', () => {
      const result = runDeterministicChecks(listing({ description: 'COCAINE for sale, best price' }));
      expect(result.level).toBe(RiskLevel.HIGH);
    });

    it('does not false-positive on a substring inside an unrelated word', () => {
      const result = runDeterministicChecks(listing({ description: 'A rugged, fireguns-proof storage case' }));
      expect(result.level).toBe(RiskLevel.LOW);
    });

    it('a hard hit short-circuits before soft-hit checks run — flags stay empty', () => {
      const result = runDeterministicChecks(
        listing({ description: 'Selling a rifle, call 555-123-4567 or see http://example.com' }),
      );
      expect(result.level).toBe(RiskLevel.HIGH);
      expect(result.flags).toEqual([]);
    });
  });

  describe('soft hits — MEDIUM, accepted but flagged', () => {
    it('flags a URL in the description', () => {
      const result = runDeterministicChecks(listing({ description: 'Message me at https://my-shop.example.com' }));
      expect(result.level).toBe(RiskLevel.MEDIUM);
      expect(result.flags.length).toBeGreaterThan(0);
      expect(result.reasons).toEqual([]);
    });

    it('flags a www.-prefixed URL with no scheme', () => {
      const result = runDeterministicChecks(listing({ description: 'Check out www.my-shop-example.com for more' }));
      expect(result.level).toBe(RiskLevel.MEDIUM);
    });

    it('flags a phone number in the description', () => {
      const result = runDeterministicChecks(listing({ description: 'Call me directly at 555-123-4567 to arrange' }));
      expect(result.level).toBe(RiskLevel.MEDIUM);
    });

    it('flags an email address in the description', () => {
      const result = runDeterministicChecks(listing({ description: 'Reach out at buyer.contact@example.com please' }));
      expect(result.level).toBe(RiskLevel.MEDIUM);
    });

    it('flags a price far below the category norm', () => {
      const result = runDeterministicChecks(listing({ category: ListingCategory.VEHICLES, price: 1 }));
      expect(result.level).toBe(RiskLevel.MEDIUM);
    });

    it('flags a price far above the category norm', () => {
      const result = runDeterministicChecks(listing({ category: ListingCategory.TOYS_GAMES, price: 999_999 }));
      expect(result.level).toBe(RiskLevel.MEDIUM);
    });

    it('does not flag a price merely at the edge of the category range', () => {
      const result = runDeterministicChecks(listing({ category: ListingCategory.VEHICLES, price: 200 }));
      expect(result.level).toBe(RiskLevel.LOW);
    });
  });
});
