import { RiskLevel } from '@marketplace/shared';
import { combineRiskLevels } from './combine-risk-levels';

describe('combineRiskLevels', () => {
  it.each([
    [RiskLevel.LOW, RiskLevel.LOW, RiskLevel.LOW],
    [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.MEDIUM],
    [RiskLevel.LOW, RiskLevel.HIGH, RiskLevel.HIGH],
    [RiskLevel.MEDIUM, RiskLevel.LOW, RiskLevel.MEDIUM],
    [RiskLevel.MEDIUM, RiskLevel.MEDIUM, RiskLevel.MEDIUM],
    [RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.HIGH],
    [RiskLevel.HIGH, RiskLevel.LOW, RiskLevel.HIGH],
    [RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.HIGH],
    [RiskLevel.HIGH, RiskLevel.HIGH, RiskLevel.HIGH],
  ])('combineRiskLevels(%s, %s) -> %s', (a, b, expected) => {
    expect(combineRiskLevels(a, b)).toBe(expected);
  });
});
