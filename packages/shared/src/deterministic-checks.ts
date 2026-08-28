import { ListingCategory, RiskLevel } from './enums';

export interface DeterministicCheckInput {
  title: string;
  description: string;
  price: number;
  category: ListingCategory;
}

export interface DeterministicCheckResult {
  level: RiskLevel;
  reasons: string[];
  flags: string[];
}

// Word-boundary, case-insensitive — hard hits reject the submission
// outright (MAR-17), so this list stays narrow and literal rather than
// broad/fuzzy; a false positive here blocks a legitimate listing.
// Known gap, not a silent one: ASCII \b doesn't reason about Unicode, so
// a zero-width character inserted mid-word or a homoglyph substitution
// slips through undetected. Acceptable for a deterministic first pass
// backed by the AI model (MAR-32/34) — not the last line of defense.
const HARD_HIT_PATTERNS: { reason: string; pattern: RegExp }[] = [
  { reason: 'weapons', pattern: /\b(firearms?|guns?|rifles?|pistols?|ammunition|ammo|explosives?)\b/i },
  { reason: 'drugs', pattern: /\b(cocaine|heroin|methamphetamine|meth|mdma|fentanyl)\b/i },
  { reason: 'counterfeit', pattern: /\bcounterfeit\b/i },
  { reason: 'adult content', pattern: /\b(escort service|explicit content)\b/i },
];

const URL_PATTERN = /https?:\/\/\S+|\bwww\.\S+/i;
const PHONE_PATTERN = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;

// Deliberately rough, order-of-magnitude reference ranges — not real
// market data. This only exists to catch obvious pricing mistakes/scams
// (an item priced ~1000x too cheap or too expensive for its category),
// not to judge fair pricing within a category.
const CATEGORY_PRICE_RANGE: Record<ListingCategory, { min: number; max: number }> = {
  [ListingCategory.ELECTRONICS]: { min: 5, max: 5000 },
  [ListingCategory.FURNITURE]: { min: 5, max: 3000 },
  [ListingCategory.CLOTHING]: { min: 1, max: 500 },
  [ListingCategory.VEHICLES]: { min: 200, max: 200_000 },
  [ListingCategory.HOME_GARDEN]: { min: 1, max: 2000 },
  [ListingCategory.SPORTS_OUTDOORS]: { min: 1, max: 3000 },
  [ListingCategory.TOYS_GAMES]: { min: 1, max: 300 },
  [ListingCategory.OTHER]: { min: 1, max: 5000 },
};

const ORDER_OF_MAGNITUDE = 10;

// Pure, no I/O — shared between the synchronous submit path (MAR-17) and
// the pre-screen worker (MAR-32/34), so moderation still functions when
// the AI model is unavailable. Callers decide what HIGH means for them:
// the submit path rejects outright, the worker just records the risk.
export function runDeterministicChecks(input: DeterministicCheckInput): DeterministicCheckResult {
  const text = `${input.title} ${input.description}`;
  const reasons: string[] = [];

  for (const { reason, pattern } of HARD_HIT_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push(reason);
    }
  }

  if (reasons.length > 0) {
    return { level: RiskLevel.HIGH, reasons, flags: [] };
  }

  const flags: string[] = [];

  if (URL_PATTERN.test(input.description) || PHONE_PATTERN.test(input.description) || EMAIL_PATTERN.test(input.description)) {
    flags.push('contact details or a URL in the description');
  }

  const range = CATEGORY_PRICE_RANGE[input.category];
  if (input.price < range.min / ORDER_OF_MAGNITUDE || input.price > range.max * ORDER_OF_MAGNITUDE) {
    flags.push('price is far outside the typical range for this category');
  }

  return { level: flags.length > 0 ? RiskLevel.MEDIUM : RiskLevel.LOW, reasons, flags };
}
