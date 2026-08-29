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

// The pre-screen queue message contract — published by the API (MAR-33),
// consumed by the worker (MAR-34). One definition so the two can't drift.
export interface PreScreenMessage {
  listingId: string;
  // Not yet populated — lands once structured logging introduces a
  // correlation id; the shape is ready for it so the worker doesn't need
  // a second message-format change later.
  reqId?: string;
}
