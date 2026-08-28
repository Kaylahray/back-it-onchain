import { describe, it, expect } from 'vitest';
import {
  buildPnlSeries,
  buildReputationSeries,
  clampScore,
  escapeCsvField,
  exportFilename,
  serializeHistory,
  sortHistory,
  summarize,
  toCsv,
  toJson,
  type CallHistoryEntry,
} from './reputation';

function entry(overrides: Partial<CallHistoryEntry> = {}): CallHistoryEntry {
  return {
    id: 'c1',
    token: 'XLM',
    direction: 'up',
    stake: 100,
    pnl: 0,
    reputationDelta: 0,
    outcome: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sortHistory', () => {
  it('orders by resolution date, falling back to creation', () => {
    const sorted = sortHistory([
      entry({ id: 'b', createdAt: '2026-01-03T00:00:00.000Z' }),
      entry({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'c', createdAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts a resolved call by when it resolved, not when it opened', () => {
    const sorted = sortHistory([
      entry({ id: 'late-open', createdAt: '2026-01-05T00:00:00.000Z' }),
      entry({
        id: 'early-open',
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-09T00:00:00.000Z',
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['late-open', 'early-open']);
  });

  it('does not mutate its input', () => {
    const input = [entry({ id: 'b', createdAt: '2026-01-03T00:00:00.000Z' }), entry({ id: 'a' })];

    sortHistory(input);

    expect(input.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('clampScore', () => {
  it('holds the score inside 0–100', () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(140)).toBe(100);
    expect(clampScore(42)).toBe(42);
  });
});

describe('buildReputationSeries', () => {
  it('accumulates deltas from the starting score', () => {
    const series = buildReputationSeries(
      [
        entry({ id: 'a', reputationDelta: 5, createdAt: '2026-01-01T00:00:00.000Z' }),
        entry({ id: 'b', reputationDelta: 3, createdAt: '2026-01-02T00:00:00.000Z' }),
      ],
      50,
    );

    expect(series).toEqual([
      { time: '2026-01-01', value: 55 },
      { time: '2026-01-02', value: 58 },
    ]);
  });

  // lightweight-charts silently rejects a series whose times repeat, and
  // several calls resolving on one day is the normal case.
  it('emits one point per day, keeping the day’s final score', () => {
    const series = buildReputationSeries([
      entry({ id: 'a', reputationDelta: 5, createdAt: '2026-01-01T01:00:00.000Z' }),
      entry({ id: 'b', reputationDelta: 5, createdAt: '2026-01-01T20:00:00.000Z' }),
    ]);

    expect(series).toEqual([{ time: '2026-01-01', value: 10 }]);
  });

  it('never drops below zero on a losing streak', () => {
    const series = buildReputationSeries(
      [
        entry({ id: 'a', reputationDelta: -30, createdAt: '2026-01-01T00:00:00.000Z' }),
        entry({ id: 'b', reputationDelta: -30, createdAt: '2026-01-02T00:00:00.000Z' }),
      ],
      10,
    );

    expect(series.map((point) => point.value)).toEqual([0, 0]);
  });

  it('returns nothing for an empty history', () => {
    expect(buildReputationSeries([])).toEqual([]);
  });

  it('returns points in ascending time order regardless of input order', () => {
    const series = buildReputationSeries([
      entry({ id: 'b', reputationDelta: 1, createdAt: '2026-03-01T00:00:00.000Z' }),
      entry({ id: 'a', reputationDelta: 1, createdAt: '2026-02-01T00:00:00.000Z' }),
    ]);

    expect(series.map((point) => point.time)).toEqual(['2026-02-01', '2026-03-01']);
  });
});

describe('buildPnlSeries', () => {
  it('accumulates realized profit and loss', () => {
    const series = buildPnlSeries([
      entry({ id: 'a', pnl: 120.5, createdAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'b', pnl: -20.25, createdAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(series).toEqual([
      { time: '2026-01-01', value: 120.5 },
      { time: '2026-01-02', value: 100.25 },
    ]);
  });

  // 0.1 + 0.2 has no business reaching a currency label.
  it('rounds to cents rather than carrying float noise', () => {
    const series = buildPnlSeries([
      entry({ id: 'a', pnl: 0.1, createdAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'b', pnl: 0.2, createdAt: '2026-01-02T00:00:00.000Z' }),
    ]);

    expect(series[1].value).toBe(0.3);
  });
});

describe('summarize', () => {
  const history = [
    entry({ id: 'a', outcome: 'won', pnl: 50 }),
    entry({ id: 'b', outcome: 'lost', pnl: -20 }),
    entry({ id: 'c', outcome: 'won', pnl: 10 }),
    entry({ id: 'd', outcome: 'open', pnl: 0 }),
  ];

  it('counts outcomes', () => {
    const summary = summarize(history, 70);

    expect(summary.totalCalls).toBe(4);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.open).toBe(1);
  });

  // An open call has not been judged; counting it as a loss would understate
  // every active user's win rate.
  it('computes win rate over resolved calls only', () => {
    expect(summarize(history).winRate).toBeCloseTo(2 / 3);
  });

  it('reports zero win rate when nothing has resolved', () => {
    expect(summarize([entry({ outcome: 'open' })]).winRate).toBe(0);
  });

  it('sums net PnL and clamps the score', () => {
    const summary = summarize(history, 250);

    expect(summary.netPnl).toBe(40);
    expect(summary.currentScore).toBe(100);
  });
});

describe('escapeCsvField', () => {
  it('leaves a plain value alone', () => {
    expect(escapeCsvField('XLM')).toBe('XLM');
  });

  // Without quoting, a comma in a note shifts every later column by one and
  // silently corrupts the file.
  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsvField('Sold, then regretted it')).toBe('"Sold, then regretted it"');
    expect(escapeCsvField('He said "no"')).toBe('"He said ""no"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders a missing value as an empty cell', () => {
    expect(escapeCsvField(undefined)).toBe('');
    expect(escapeCsvField(null)).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header and one row per entry', () => {
    const csv = toCsv([entry({ id: 'a' }), entry({ id: 'b' })]);
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'id,token,direction,stake,pnl,reputationDelta,outcome,createdAt,resolvedAt,note',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('a,XLM,up,100,0,0,open,')).toBe(true);
  });

  it('writes a header-only file for an empty history', () => {
    expect(toCsv([]).split('\n')).toHaveLength(1);
  });

  it('quotes a note containing a comma', () => {
    expect(toCsv([entry({ note: 'a, b' })])).toContain('"a, b"');
  });
});

describe('toJson', () => {
  it('round-trips the entries', () => {
    const history = [entry({ id: 'a' })];

    expect(JSON.parse(toJson(history))).toEqual(history);
  });
});

describe('serializeHistory', () => {
  it('picks the serializer from the format', () => {
    const history = [entry()];

    expect(serializeHistory(history, 'csv')).toBe(toCsv(history));
    expect(serializeHistory(history, 'json')).toBe(toJson(history));
  });
});

describe('exportFilename', () => {
  it('names the file after the wallet and day', () => {
    expect(exportFilename('0xAbC123', 'csv', '2026-08-21T09:30:00.000Z')).toBe(
      'backitonchain-history-0xAbC123-2026-08-21.csv',
    );
  });

  // A Stellar address or an ENS name can carry characters a filesystem will
  // not take.
  it('strips punctuation and caps the length', () => {
    const name = exportFilename('GABC/../DEF:1234567890', 'json', '2026-08-21T00:00:00.000Z');

    expect(name).toBe('backitonchain-history-GABCDEF12345-2026-08-21.json');
  });

  it('falls back when the wallet has nothing usable', () => {
    expect(exportFilename('///', 'csv', '2026-08-21T00:00:00.000Z')).toContain('wallet');
  });
});
