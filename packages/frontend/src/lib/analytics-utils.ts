/**
 * analytics-utils.ts
 *
 * Pure geometry / normalisation helpers backing the analytics visualisations
 * (reputation radar, accuracy area chart, staking-volume bars). Kept free of
 * React so the maths is unit-testable in isolation.
 */

export interface RadarAxis {
  label: string;
  /** Normalised 0–100 score for this dimension. */
  value: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bar {
  label: string;
  value: number;
  /** Height in px scaled to the tallest bar. */
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute the vertex coordinates of a radar polygon. Axes are distributed
 * evenly around a circle starting from the top (12 o'clock), each vertex placed
 * at a radius proportional to its 0–100 value.
 */
export function computeRadarPoints(
  axes: RadarAxis[],
  radius: number,
  center: Point = { x: radius, y: radius },
): Point[] {
  const n = axes.length;
  if (n === 0) return [];
  return axes.map((axis, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (clamp(axis.value, 0, 100) / 100) * radius;
    return {
      x: center.x + r * Math.cos(angle),
      y: center.y + r * Math.sin(angle),
    };
  });
}

/** Serialise points into an SVG polygon `points` attribute string. */
export function toPolygonString(points: Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

/**
 * Map a numeric series to SVG coordinates for an area/line chart within a
 * width×height viewport. X is evenly spaced; Y is inverted (SVG origin is
 * top-left) and scaled between the series min and max.
 */
export function seriesToPoints(
  values: number[],
  width: number,
  height: number,
): Point[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: height / 2 }];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: (i / (n - 1)) * width,
    y: height - ((v - min) / span) * height,
  }));
}

/** Build a closed SVG path (area fill) from a series. */
export function buildAreaPath(
  values: number[],
  width: number,
  height: number,
): string {
  const pts = seriesToPoints(values, width, height);
  if (pts.length === 0) return '';
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`)
    .join(' ');
  return `${line} L${round(width)},${round(height)} L0,${round(height)} Z`;
}

/** Scale bar values so the tallest reaches `maxHeight` px. */
export function buildBars(
  data: { label: string; value: number }[],
  maxHeight: number,
): Bar[] {
  const max = Math.max(0, ...data.map((d) => d.value));
  return data.map((d) => ({
    ...d,
    height: max === 0 ? 0 : Math.round((d.value / max) * maxHeight),
  }));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
