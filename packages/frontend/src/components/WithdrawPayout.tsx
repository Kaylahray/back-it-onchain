'use client';

import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { computePayout, type PayoutInput } from '../lib/payout-utils';
import {
  useWithdrawBase,
  type WithdrawReceipt,
} from '../hooks/useWithdrawBase';
import { useWithdrawStellar } from '../hooks/useWithdrawStellar';

interface WithdrawPayoutProps {
  chain: 'base' | 'stellar';
  /** Pool figures used to preview the claimable amount (frontend-only calc). */
  position: PayoutInput;
  /** Whether the underlying call has settled and is claimable. */
  settled?: boolean;
}

/**
 * FE-19 — Withdraw payout / claim flow. Shows the claimable amount, a withdraw
 * button (mock wagmi/Freighter), tx pending/success/error receipts with an
 * explorer link, and a running history log of claims.
 */
export function WithdrawPayout({
  chain,
  position,
  settled = true,
}: WithdrawPayoutProps) {
  const base = useWithdrawBase();
  const stellar = useWithdrawStellar();
  const active = chain === 'base' ? base : stellar;

  const [history, setHistory] = useState<WithdrawReceipt[]>([]);
  const preview = computePayout(position);
  const claimable = preview.net;
  const disabled =
    !settled || claimable <= 0 || active.status === 'pending';

  const onClaim = async () => {
    try {
      const receipt = await active.withdraw(claimable);
      setHistory((h) => [receipt, ...h]);
    } catch {
      // error surfaced via active.error
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            Claimable
          </p>
          <p className="text-2xl font-semibold text-emerald-400">
            {claimable.toFixed(2)} USDC
          </p>
          <p className="text-xs text-zinc-500">
            {(preview.share * 100).toFixed(2)}% pool share · profit{' '}
            {preview.profit.toFixed(2)} · fee {preview.fee.toFixed(2)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClaim}
          disabled={disabled}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            disabled
              ? 'cursor-not-allowed bg-white/10 text-zinc-500'
              : 'bg-emerald-500 text-black hover:bg-emerald-400',
          )}
        >
          {active.status === 'pending' ? 'Claiming…' : 'Withdraw payout'}
        </button>
      </div>

      {!settled && (
        <p className="text-xs text-amber-400" data-testid="not-settled">
          This call has not settled yet.
        </p>
      )}

      {active.status === 'pending' && (
        <p className="text-sm text-sky-400" data-testid="receipt-pending">
          Waiting for transaction confirmation…
        </p>
      )}

      {active.status === 'error' && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          data-testid="receipt-error"
        >
          Claim failed: {active.error}
          <button
            type="button"
            onClick={onClaim}
            className="ml-2 underline hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {active.status === 'success' && active.receipt && (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"
          data-testid="receipt-success"
        >
          Claimed {active.receipt.amount.toFixed(2)} USDC ·{' '}
          <a
            href={active.receipt.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-emerald-100"
          >
            View on {chain === 'base' ? 'BaseScan' : 'Stellar Expert'}
          </a>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-400">Claim history</p>
          <ul className="space-y-1" data-testid="history-log">
            {history.map((r) => (
              <li
                key={r.txHash}
                className="flex items-center justify-between text-xs text-zinc-400"
              >
                <span>{r.amount.toFixed(2)} USDC</span>
                <a
                  href={r.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-zinc-500 underline"
                >
                  {r.txHash.slice(0, 10)}…
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
