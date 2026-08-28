/**
 * Reputation engine.
 *
 * A user's reputation is the running sum of per-resolution contributions:
 *
 *   score = Σ (outcomeCorrect ? +1 : -1) * stakeWeight * timeDecay
 *
 *   - outcomeCorrect : whether the user's call/outcome matched the result
 *   - stakeWeight    : larger stakes weigh more: 1 + ln(1 + stake)
 *   - timeDecay      : exponential half-life of 30 days (recent results count
 *                      more): 0.5 ^ (ageDays / 30)
 *
 * Draws / UNRESOLVED outcomes (outcome === null) contribute nothing.
 */

const HALF_LIFE_DAYS = 30;

export interface ReputationCallInput {
  /** Resolved outcome. `null` means a draw / UNRESOLVED -> no contribution. */
  outcome: boolean | null;
  /** Stake size used to weight the contribution. */
  stakeAmount: number;
  /** Resolution timestamp used for time decay. */
  resolvedAt: Date;
}

export function stakeWeight(stakeAmount: number): number {
  return 1 + Math.log1p(Math.max(stakeAmount, 0));
}

export function timeDecay(resolvedAt: Date, now = Date.now()): number {
  const ageDays = Math.max(0, (now - resolvedAt.getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

export function computeReputationScore(calls: ReputationCallInput[]): number {
  let score = 0;
  for (const call of calls) {
    if (call.outcome === null || call.outcome === undefined) continue;
    const correct = call.outcome ? 1 : -1;
    score +=
      correct * stakeWeight(call.stakeAmount) * timeDecay(call.resolvedAt);
  }
  return Math.round(score * 100) / 100;
}
