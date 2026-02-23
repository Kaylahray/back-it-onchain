export interface ReputationInput {
  totalResolvedCalls: number;
  winCount: number;
}

const CONFIDENCE_THRESHOLDS = [
  { min: 0, multiplier: 0.15 },
  { min: 5, multiplier: 0.4 },
  { min: 10, multiplier: 0.65 },
  { min: 25, multiplier: 0.85 },
  { min: 50, multiplier: 1.0 },
];

function getConfidenceMultiplier(totalResolved: number): number {
  let multiplier = CONFIDENCE_THRESHOLDS[0].multiplier;
  for (const tier of CONFIDENCE_THRESHOLDS) {
    if (totalResolved >= tier.min) {
      multiplier = tier.multiplier;
    }
  }
  return multiplier;
}

export function computeReputationScore(input: ReputationInput): number {
  const { totalResolvedCalls, winCount } = input;

  if (totalResolvedCalls === 0) return 0;

  const winRate = winCount / totalResolvedCalls;
  const confidence = getConfidenceMultiplier(totalResolvedCalls);
  const raw = winRate * 100 * confidence;

  return Math.min(100, Math.max(0, Math.round(raw)));
}
