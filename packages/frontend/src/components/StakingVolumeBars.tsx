import React from 'react';
import { buildBars } from '../lib/analytics-utils';

interface StakingVolumeBarsProps {
  data: { label: string; value: number }[];
  height?: number;
}

/** Simple staking-volume bar chart with value-scaled heights. */
export function StakingVolumeBars({ data, height = 120 }: StakingVolumeBarsProps) {
  const bars = buildBars(data, height);
  return (
    <div
      className="flex items-end justify-between gap-2"
      style={{ height }}
      data-testid="staking-bars"
    >
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-sky-500/70 transition-all"
            style={{ height: bar.height }}
            title={`${bar.label}: ${bar.value} USDC`}
            data-testid={`bar-${bar.label}`}
          />
          <span className="text-[10px] text-zinc-400">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}
