import { ListingCondition } from '@marketplace/shared';
import type { BadgeTone } from '../primitives';

const CONDITION_TONE: Record<ListingCondition, BadgeTone> = {
  [ListingCondition.NEW]: 'accent',
  [ListingCondition.LIKE_NEW]: 'accentSoft',
  [ListingCondition.GOOD]: 'neutral',
  [ListingCondition.FAIR]: 'neutral',
  [ListingCondition.FOR_PARTS]: 'outline',
};

const CONDITION_LABEL: Record<ListingCondition, string> = {
  [ListingCondition.NEW]: 'New',
  [ListingCondition.LIKE_NEW]: 'Like New',
  [ListingCondition.GOOD]: 'Good',
  [ListingCondition.FAIR]: 'Fair',
  [ListingCondition.FOR_PARTS]: 'For Parts',
};

export function conditionTone(condition: ListingCondition): BadgeTone {
  return CONDITION_TONE[condition];
}

export function conditionLabel(condition: ListingCondition): string {
  return CONDITION_LABEL[condition];
}
