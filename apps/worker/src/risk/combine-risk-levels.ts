import { RiskLevel } from '@marketplace/shared';

const RISK_LEVEL_RANK: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
};

// PLAN.md §6: "The combined level is the higher of the two." Pure so it's
// trivially table-tested without standing up the consumer or a mocked AI call.
export function combineRiskLevels(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_LEVEL_RANK[a] >= RISK_LEVEL_RANK[b] ? a : b;
}
