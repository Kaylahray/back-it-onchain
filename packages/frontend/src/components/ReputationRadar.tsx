import React from 'react';
import {
  computeRadarPoints,
  toPolygonString,
  type RadarAxis,
} from '../lib/analytics-utils';

interface ReputationRadarProps {
  axes: RadarAxis[];
  size?: number;
}

/**
 * Lightweight dependency-free SVG radar chart of reputation dimensions.
 */
export function ReputationRadar({ axes, size = 220 }: ReputationRadarProps) {
  const radius = size / 2;
  const center = { x: radius, y: radius };
  const points = computeRadarPoints(axes, radius * 0.8, center);
  const labelPoints = computeRadarPoints(
    axes.map((a) => ({ ...a, value: 100 })),
    radius * 0.92,
    center,
  );
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Reputation radar"
      data-testid="reputation-radar"
    >
      {rings.map((r) => (
        <circle
          key={r}
          cx={center.x}
          cy={center.y}
          r={radius * 0.8 * r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
        />
      ))}
      {points.map((p, i) => (
        <line
          key={`spoke-${i}`}
          x1={center.x}
          y1={center.y}
          x2={labelPoints[i].x}
          y2={labelPoints[i].y}
          stroke="rgba(255,255,255,0.08)"
        />
      ))}
      <polygon
        points={toPolygonString(points)}
        fill="rgba(56,189,248,0.25)"
        stroke="rgb(56,189,248)"
        strokeWidth={2}
        data-testid="radar-polygon"
      />
      {axes.map((axis, i) => (
        <text
          key={axis.label}
          x={labelPoints[i].x}
          y={labelPoints[i].y}
          fontSize={10}
          fill="rgba(255,255,255,0.7)"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {axis.label}
        </text>
      ))}
    </svg>
  );
}
