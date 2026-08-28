import { describe, it, expect } from 'vitest';
import {
  buildAreaPath,
  buildBars,
  computeRadarPoints,
  seriesToPoints,
  toPolygonString,
} from './analytics-utils';

describe('analytics-utils', () => {
  describe('computeRadarPoints', () => {
    it('places the first axis at the top (12 o’clock)', () => {
      const pts = computeRadarPoints([{ label: 'a', value: 100 }], 100, {
        x: 100,
        y: 100,
      });
      expect(pts[0].x).toBeCloseTo(100);
      expect(pts[0].y).toBeCloseTo(0);
    });

    it('scales radius by the 0–100 value', () => {
      const [pt] = computeRadarPoints([{ label: 'a', value: 50 }], 100, {
        x: 100,
        y: 100,
      });
      expect(pt.y).toBeCloseTo(50); // half radius up from center
    });

    it('returns an empty array for no axes', () => {
      expect(computeRadarPoints([], 100)).toEqual([]);
    });
  });

  describe('toPolygonString', () => {
    it('serialises points to an SVG points string', () => {
      expect(
        toPolygonString([
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]),
      ).toBe('1,2 3,4');
    });
  });

  describe('seriesToPoints', () => {
    it('inverts Y and spaces X evenly', () => {
      const pts = seriesToPoints([0, 10], 100, 50);
      expect(pts[0]).toEqual({ x: 0, y: 50 }); // min → bottom
      expect(pts[1]).toEqual({ x: 100, y: 0 }); // max → top
    });

    it('centers a single-point series', () => {
      expect(seriesToPoints([5], 100, 50)).toEqual([{ x: 0, y: 25 }]);
    });
  });

  describe('buildAreaPath', () => {
    it('produces a closed path', () => {
      const path = buildAreaPath([1, 2, 3], 100, 50);
      expect(path.startsWith('M')).toBe(true);
      expect(path.trim().endsWith('Z')).toBe(true);
    });
  });

  describe('buildBars', () => {
    it('scales the tallest bar to maxHeight', () => {
      const bars = buildBars(
        [
          { label: 'a', value: 5 },
          { label: 'b', value: 10 },
        ],
        100,
      );
      expect(bars[1].height).toBe(100);
      expect(bars[0].height).toBe(50);
    });

    it('returns zero heights when all values are zero', () => {
      const bars = buildBars([{ label: 'a', value: 0 }], 100);
      expect(bars[0].height).toBe(0);
    });
  });
});
