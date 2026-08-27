import { describe, it, expect } from 'vitest';
import {
  BADGE_DEFINITIONS,
  buildBadgeStates,
  computeBadgeState,
} from './badge-defs';

const firstCall = BADGE_DEFINITIONS.find((b) => b.id === 'first-call')!;
const whale = BADGE_DEFINITIONS.find((b) => b.id === 'whale-staker')!;

describe('badge-defs', () => {
  describe('computeBadgeState', () => {
    it('marks a badge unlocked when the threshold is met', () => {
      const state = computeBadgeState(firstCall, 1);
      expect(state.unlocked).toBe(true);
      expect(state.percent).toBe(100);
      expect(state.remaining).toBe(0);
    });

    it('computes a partial percentage below the threshold', () => {
      const state = computeBadgeState(whale, 2500);
      expect(state.unlocked).toBe(false);
      expect(state.percent).toBe(25);
      expect(state.remaining).toBe(7500);
    });

    it('clamps negative / non-finite current values to zero', () => {
      expect(computeBadgeState(whale, -50).current).toBe(0);
      expect(computeBadgeState(whale, Number.NaN).percent).toBe(0);
    });

    it('never exceeds 100 percent when over the threshold', () => {
      expect(computeBadgeState(firstCall, 99).percent).toBe(100);
    });
  });

  describe('buildBadgeStates', () => {
    it('returns a state for every definition by default', () => {
      expect(buildBadgeStates({})).toHaveLength(BADGE_DEFINITIONS.length);
    });

    it('filters by rarity', () => {
      const epics = buildBadgeStates({}, 'epic');
      expect(epics.every((s) => s.definition.rarity === 'epic')).toBe(true);
      expect(epics.length).toBeGreaterThan(0);
    });

    it('sorts unlocked badges first', () => {
      const states = buildBadgeStates({ 'first-call': 1 });
      expect(states[0].unlocked).toBe(true);
    });
  });
});
