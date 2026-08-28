/**
 * Reputation timeline + history export helpers (FE-07).
 *
 * Everything here is pure so the chart and the export button can be tested
 * without a canvas or a download.
 */

export type CallOutcome = 'won' | 'lost' | 'open';

export interface CallHistoryEntry {
  id: string;
  token: string;
  direction: 'up' | 'down';
  /** Amount staked, in the call's quote currency. */
  stake: number;
  /** Realized profit or loss. Zero while the call is still open. */
  pnl: number;
  /** Reputation points gained or lost when the call resolved. */
  reputationDelta: number;
  outcome: CallOutcome;
  createdAt: string;
  resolvedAt?: string;
  note?: string;
}

export interface TimelinePoint {
  /** `YYYY-MM-DD`, the business-day form lightweight-charts accepts. */
  time: string;
  value: number;
}

export interface ReputationSummary {
  totalCalls: number;
  wins: number;
  losses: number;
  open: number;
  /** Share of *resolved* calls that won, 0–1. Zero when nothing has resolved. */
  winRate: number;
  netPnl: number;
  currentScore: number;
}

export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

/** The moment a call counts toward reputation — resolution, or creation while open. */
export function effectiveDate(entry: CallHistoryEntry): string {
  return entry.resolvedAt ?? entry.createdAt;
}

export function toBusinessDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function sortHistory(entries: CallHistoryEntry[]): CallHistoryEntry[] {
  return [...entries].sort((a, b) => {
    const delta = Date.parse(effectiveDate(a)) - Date.parse(effectiveDate(b));

    // Ties broken by id so the series is stable across renders.
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

export function clampScore(score: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

/**
 * Collapse a cumulative walk into one point per day.
 *
 * lightweight-charts rejects a series whose times are not strictly ascending,
 * and several calls resolving on one day is the normal case — so the last
 * value of each day wins rather than the whole series being dropped.
 */
function collapseByDay(points: TimelinePoint[]): TimelinePoint[] {
  const byDay = new Map<string, number>();

  for (const point of points) byDay.set(point.time, point.value);

  return [...byDay.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Running reputation score, clamped to the 0–100 the backend reports. */
export function buildReputationSeries(
  entries: CallHistoryEntry[],
  startingScore = 0,
): TimelinePoint[] {
  let score = clampScore(startingScore);

  const points = sortHistory(entries).map((entry) => {
    score = clampScore(score + entry.reputationDelta);

    return { time: toBusinessDay(effectiveDate(entry)), value: score };
  });

  return collapseByDay(points);
}

/** Running realized PnL — the sparkline on the profile. */
export function buildPnlSeries(entries: CallHistoryEntry[]): TimelinePoint[] {
  let total = 0;

  const points = sortHistory(entries).map((entry) => {
    total = roundMoney(total + entry.pnl);

    return { time: toBusinessDay(effectiveDate(entry)), value: total };
  });

  return collapseByDay(points);
}

/** Cents, not float noise: 0.1 + 0.2 has no business reaching the UI. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function summarize(entries: CallHistoryEntry[], currentScore = 0): ReputationSummary {
  const wins = entries.filter((entry) => entry.outcome === 'won').length;
  const losses = entries.filter((entry) => entry.outcome === 'lost').length;
  const open = entries.filter((entry) => entry.outcome === 'open').length;
  const resolved = wins + losses;

  return {
    totalCalls: entries.length,
    wins,
    losses,
    open,
    winRate: resolved === 0 ? 0 : wins / resolved,
    netPnl: roundMoney(entries.reduce((total, entry) => total + entry.pnl, 0)),
    currentScore: clampScore(currentScore),
  };
}

export const EXPORT_COLUMNS = [
  'id',
  'token',
  'direction',
  'stake',
  'pnl',
  'reputationDelta',
  'outcome',
  'createdAt',
  'resolvedAt',
  'note',
] as const;

/**
 * RFC 4180 quoting.
 *
 * A note reading `Sold, then regretted it` would otherwise shift every later
 * column by one and silently corrupt the export.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(entries: CallHistoryEntry[]): string {
  const rows = entries.map((entry) =>
    EXPORT_COLUMNS.map((column) => escapeCsvField(entry[column])).join(','),
  );

  return [EXPORT_COLUMNS.join(','), ...rows].join('\n');
}

export function toJson(entries: CallHistoryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export type ExportFormat = 'csv' | 'json';

export const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
};

export function serializeHistory(entries: CallHistoryEntry[], format: ExportFormat): string {
  return format === 'csv' ? toCsv(entries) : toJson(entries);
}

/** `backitonchain-history-0xabc1234-2026-08-21.csv` */
export function exportFilename(wallet: string, format: ExportFormat, isoDate: string): string {
  const safeWallet = wallet.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'wallet';

  return `backitonchain-history-${safeWallet}-${isoDate.slice(0, 10)}.${format}`;
}
