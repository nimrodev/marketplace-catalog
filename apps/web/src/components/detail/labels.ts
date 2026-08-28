import { ListingOption, ListingStatus, RiskLevel } from '@marketplace/shared';
import type { BadgeTone } from '../primitives';

const OPTION_LABEL: Record<ListingOption, string> = {
  [ListingOption.DELIVERY_AVAILABLE]: 'Delivery available',
  [ListingOption.LOCAL_PICKUP]: 'Local pickup',
  [ListingOption.OPEN_TO_TRADES]: 'Open to trades',
  [ListingOption.ORIGINAL_PACKAGING]: 'Original packaging',
  [ListingOption.WARRANTY_INCLUDED]: 'Warranty included',
  [ListingOption.BUNDLE_DEAL]: 'Bundle deal',
};

export function optionLabel(option: ListingOption): string {
  return OPTION_LABEL[option];
}

const STATUS_TONE: Record<ListingStatus, BadgeTone> = {
  [ListingStatus.PENDING]: 'warning',
  [ListingStatus.PUBLISHED]: 'success',
  [ListingStatus.REJECTED]: 'danger',
};

export function statusTone(status: ListingStatus): BadgeTone {
  return STATUS_TONE[status];
}

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  [RiskLevel.LOW]: 'success',
  [RiskLevel.MEDIUM]: 'warning',
  [RiskLevel.HIGH]: 'danger',
};

export function riskTone(level: RiskLevel): BadgeTone {
  return RISK_TONE[level];
}
