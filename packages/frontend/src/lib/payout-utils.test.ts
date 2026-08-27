import { describe, it, expect } from 'vitest';
import { computePayout, explorerTxUrl } from './payout-utils';

describe('payout-utils', () => {
  describe('computePayout', () => {
    it('gives the full pool to a sole winner (minus fee)', () => {
      const p = computePayout({
        userStake: 100,
        winningPoolTotal: 100,
        losingPoolTotal: 100,
        feeBps: 200,
      });
      // gross = (100/100) * 200 = 200; fee = 2% = 4; net = 196
      expect(p.gross).toBe(200);
      expect(p.fee).toBe(4);
      expect(p.net).toBe(196);
      expect(p.profit).toBe(96);
      expect(p.share).toBe(1);
    });

    it('splits proportionally among winners', () => {
      const p = computePayout({
        userStake: 25,
        winningPoolTotal: 100,
        losingPoolTotal: 300,
        feeBps: 0,
      });
      // share = 0.25; totalPool = 400; gross = 100
      expect(p.share).toBe(0.25);
      expect(p.gross).toBe(100);
      expect(p.net).toBe(100);
      expect(p.profit).toBe(75);
    });

    it('returns a full loss when there is no winning stake', () => {
      const p = computePayout({
        userStake: 50,
        winningPoolTotal: 0,
        losingPoolTotal: 100,
      });
      expect(p.net).toBe(0);
      expect(p.profit).toBe(-50);
    });

    it('handles a losing-pool of zero (only winners staked)', () => {
      const p = computePayout({
        userStake: 40,
        winningPoolTotal: 80,
        losingPoolTotal: 0,
        feeBps: 0,
      });
      // gross = 0.5 * 80 = 40 → no profit
      expect(p.gross).toBe(40);
      expect(p.profit).toBe(0);
    });
  });

  describe('explorerTxUrl', () => {
    it('builds a BaseScan url for base', () => {
      expect(explorerTxUrl('base', '0xabc')).toBe(
        'https://basescan.org/tx/0xabc',
      );
    });
    it('builds a stellar.expert url for stellar', () => {
      expect(explorerTxUrl('stellar', 'HASH')).toContain(
        'stellar.expert/explorer/public/tx/HASH',
      );
    });
  });
});
