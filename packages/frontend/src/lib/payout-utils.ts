/**
 * payout-utils.ts
 *
 * Frontend-only pull-payout preview maths for the withdraw/claim flow. Mirrors
 * the on-chain settlement rule: a winner's payout is their proportional share
 * of the total pool (winning + losing stakes), minus the platform fee.
 */

export interface PayoutInput {
  /** The claimant's stake on the winning outcome (USDC). */
  userStake: number;
  /** Total stake on the winning outcome (USDC). */
  winningPoolTotal: number;
  /** Total stake on the losing outcome(s) (USDC). */
  losingPoolTotal: number;
  /** Platform fee in basis points (e.g. 200 = 2%). */
  feeBps?: number;
}

export interface PayoutPreview {
  /** Proportional share of the total pool before fees. */
  gross: number;
  /** Platform fee deducted from gross. */
  fee: number;
  /** Amount actually claimable after fees. */
  net: number;
  /** Net minus original stake (pure winnings). */
  profit: number;
  /** Claimant's fractional share of the winning pool (0–1). */
  share: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePayout({
  userStake,
  winningPoolTotal,
  losingPoolTotal,
  feeBps = 0,
}: PayoutInput): PayoutPreview {
  const stake = Math.max(0, userStake);
  const winPool = Math.max(0, winningPoolTotal);
  const losePool = Math.max(0, losingPoolTotal);

  if (winPool === 0 || stake === 0) {
    return { gross: 0, fee: 0, net: 0, profit: -stake, share: 0 };
  }

  const share = Math.min(stake / winPool, 1);
  const totalPool = winPool + losePool;
  const gross = share * totalPool;
  const fee = gross * (Math.max(0, feeBps) / 10_000);
  const net = gross - fee;

  return {
    gross: round2(gross),
    fee: round2(fee),
    net: round2(net),
    profit: round2(net - stake),
    share: Math.round(share * 10_000) / 10_000,
  };
}

/** Build a chain-appropriate explorer URL for a transaction hash. */
export function explorerTxUrl(
  chain: 'base' | 'stellar',
  txHash: string,
): string {
  return chain === 'base'
    ? `https://basescan.org/tx/${txHash}`
    : `https://stellar.expert/explorer/public/tx/${txHash}`;
}
