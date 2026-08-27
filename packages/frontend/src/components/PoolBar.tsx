'use client';

import * as React from 'react';
import { poolSplit, type CallPool } from '../hooks/useCallLive';

export interface PoolBarProps {
  pool: CallPool;
  /** Rendered instead of the bar while the first snapshot is loading. */
  loading?: boolean;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;

  return value.toFixed(0);
}

/**
 * YES/NO split of a call's pool (FE-05).
 *
 * The percentages are exposed as text as well as bar widths — a bar alone is
 * unreadable to a screen reader and hard to compare precisely by eye.
 */
export function PoolBar({ pool, loading }: PoolBarProps) {
  if (loading) {
    return (
      <div data-testid="pool-bar-skeleton" aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  const { yesPercent, noPercent } = poolSplit(pool);
  const total = pool.yesTotal + pool.noTotal;

  return (
    <div data-testid="pool-bar" className="flex flex-col gap-2">
      <div
        role="meter"
        aria-label="Pool split"
        aria-valuenow={Math.round(yesPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(yesPercent)}% YES, ${Math.round(noPercent)}% NO`}
        className="flex h-4 w-full overflow-hidden rounded bg-gray-100"
      >
        <div
          data-testid="pool-bar-yes"
          style={{ width: `${yesPercent}%` }}
          className="bg-green-500"
        />
        <div
          data-testid="pool-bar-no"
          style={{ width: `${noPercent}%` }}
          className="bg-red-500"
        />
      </div>

      <div className="flex justify-between text-xs">
        <span data-testid="pool-yes-label" className="text-green-700">
          YES {yesPercent.toFixed(1)}% · {formatAmount(pool.yesTotal)}
        </span>
        <span data-testid="pool-total" className="text-gray-500">
          {total > 0 ? `${formatAmount(total)} staked` : 'No stakes yet'}
        </span>
        <span data-testid="pool-no-label" className="text-red-700">
          NO {noPercent.toFixed(1)}% · {formatAmount(pool.noTotal)}
        </span>
      </div>
    </div>
  );
}

export default PoolBar;
