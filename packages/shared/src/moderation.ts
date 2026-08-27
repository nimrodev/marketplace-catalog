import type { RiskLevel } from './enums';
import type { ListingSummary } from './listings';

export interface ListingRisk {
  level: RiskLevel;
  reasons: string[];
  flags: string[];
  model: string;
  evaluatedAt: string;
}

export interface ModerationQueueItem extends ListingSummary {
  contributorEmail: string;
  submittedAt: string;
  risk: ListingRisk | null;
}

export interface RejectRequest {
  reason: string;
}
