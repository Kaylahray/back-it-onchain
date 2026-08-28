import React from 'react';
import { formatChartData, type RawChartData } from '../lib/chart-utils';
import {
  buildAreaPath,
  seriesToPoints,
  toPolygonString,
} from '../lib/analytics-utils';

interface AccuracyChartProps {
  data: RawChartData[];
  width?: number;
  height?: number;
}

/**
 * Accuracy-over-time area chart. Reuses `formatChartData` from chart-utils for
 * axis labels and the analytics geometry helpers for the SVG path.
 */
export function AccuracyChart({
  data,
  width = 320,
  height = 120,
}: AccuracyChartProps) {
  const formatted = formatChartData(data);
  const values = data.map((d) => d.price);
  const areaPath = buildAreaPath(values, width, height);
  const linePoints = toPolygonString(seriesToPoints(values, width, height));
  const latest = formatted[formatted.length - 1];

  return (
    <div className="space-y-1" data-testid="accuracy-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Accuracy over time"
        preserveAspectRatio="none"
      >
        <path d={areaPath} fill="rgba(52,211,153,0.18)" />
        <polyline
          points={linePoints}
          fill="none"
          stroke="rgb(52,211,153)"
          strokeWidth={2}
        />
      </svg>
      {latest && (
        <p className="text-right text-xs text-zinc-400">
          Latest: <span className="text-emerald-400">{latest.value}%</span> ·{' '}
          {latest.time}
        </p>
      )}
    </div>
  );
}
