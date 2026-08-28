'use client';

/**
 * Token search (FE-03).
 *
 * Wraps `GET /tokens/search?q=` behind a debounce and react-query, and keeps a
 * small cache of recent result sets.
 *
 * The debounce is the point: a search fires per keystroke otherwise, and a
 * token symbol is short enough that a user types the whole thing inside one
 * network round trip. 300ms is long enough to swallow a burst of typing and
 * short enough not to feel laggy.
 */

import * as React from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/** Debounce applied to the raw query before it reaches the network. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Shortest query worth sending; one character matches nearly everything. */
export const MIN_QUERY_LENGTH = 2;

/** How many recent result sets are retained. */
export const RECENT_CACHE_SIZE = 10;

export interface TokenSearchResult {
  address: string;
  symbol: string;
  name: string;
  /** Total liquidity in USD. */
  liquidityUsd: number;
  /** Trailing 24h volume in USD. */
  volume24hUsd: number;
  /** Age of the trading pair in hours. */
  pairAgeHours: number;
  /** Flagged by the upstream honeypot check. */
  isHoneypot: boolean;
  /** Free-form warnings from the upstream safety provider. */
  warnings?: string[];
  /**
   * True when the row came from the DexScreener fallback rather than the
   * primary index — the data is thinner and the UI says so.
   */
  fromDexScreenerFallback?: boolean;
}

export interface TokenSearchResponse {
  results: TokenSearchResult[];
  /** Set when the primary source was unavailable and DexScreener answered. */
  usedFallback?: boolean;
}

export type SafetyLevel = 'safe' | 'caution' | 'danger';

/** Thresholds below which a token is treated as thin rather than tradable. */
export const SAFETY_THRESHOLDS = {
  minLiquidityUsd: 50_000,
  minVolume24hUsd: 10_000,
  minPairAgeHours: 72,
} as const;

/**
 * Reduce a token's metrics to one of three levels.
 *
 * A honeypot is always `danger` regardless of how healthy the other numbers
 * look — that is precisely the shape of the scam, and letting good liquidity
 * outvote the flag would defeat the check.
 */
export function safetyLevelFor(token: TokenSearchResult): SafetyLevel {
  if (token.isHoneypot) return 'danger';

  const failures = [
    token.liquidityUsd < SAFETY_THRESHOLDS.minLiquidityUsd,
    token.volume24hUsd < SAFETY_THRESHOLDS.minVolume24hUsd,
    token.pairAgeHours < SAFETY_THRESHOLDS.minPairAgeHours,
  ].filter(Boolean).length;

  if (failures === 0) return 'safe';
  if (failures === 1) return 'caution';

  return 'danger';
}

/** Human-readable reasons a token is not `safe`. */
export function safetyWarningsFor(token: TokenSearchResult): string[] {
  const warnings: string[] = [];

  if (token.isHoneypot) warnings.push('Flagged as a honeypot — you may not be able to sell');
  if (token.liquidityUsd < SAFETY_THRESHOLDS.minLiquidityUsd) warnings.push('Low liquidity');
  if (token.volume24hUsd < SAFETY_THRESHOLDS.minVolume24hUsd) warnings.push('Low 24h volume');
  if (token.pairAgeHours < SAFETY_THRESHOLDS.minPairAgeHours) warnings.push('Newly created pair');

  return [...warnings, ...(token.warnings ?? [])];
}

/** Debounce a value, returning the settled one. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);

    // Clearing on every change is what makes this a debounce rather than a
    // series of delayed updates.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

async function fetchTokenSearch(
  query: string,
  signal?: AbortSignal,
): Promise<TokenSearchResponse> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  const response = await fetch(`${base}/tokens/search?q=${encodeURIComponent(query)}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Token search failed (${response.status})`);
  }

  const body = (await response.json()) as TokenSearchResponse | TokenSearchResult[];

  // Accept a bare array as well as the wrapper, so a simpler backend response
  // still renders rather than blowing up on `.results`.
  return Array.isArray(body) ? { results: body } : body;
}

export interface UseTokenSearchResult {
  query: string;
  setQuery: (next: string) => void;
  /** The query actually sent, after debouncing. */
  debouncedQuery: string;
  results: TokenSearchResult[];
  usedFallback: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** True while the user has typed but the debounce has not settled. */
  isDebouncing: boolean;
  /** Result sets for recent queries, most recent first. */
  recent: { query: string; results: TokenSearchResult[] }[];
  query_: UseQueryResult<TokenSearchResponse, Error>;
}

export function useTokenSearch(initialQuery = ''): UseTokenSearchResult {
  const [query, setQuery] = React.useState(initialQuery);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const trimmed = debouncedQuery.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;

  const result = useQuery<TokenSearchResponse, Error>({
    queryKey: ['tokens', 'search', trimmed],
    queryFn: ({ signal }) => fetchTokenSearch(trimmed, signal),
    enabled,
    staleTime: 30_000,
  });

  // The last N result sets, so retyping a recent query paints instantly and a
  // transient network failure still has something to show.
  //
  // State rather than a ref: a ref would update without re-rendering, so a
  // consumer reading `recent` would keep seeing the value captured at its last
  // render and the cache would appear never to fill.
  const [recent, setRecent] = React.useState<{ query: string; results: TokenSearchResult[] }[]>(
    [],
  );

  const results = React.useMemo(() => result.data?.results ?? [], [result.data]);

  React.useEffect(() => {
    if (!enabled || !result.data) return;

    setRecent((previous) => {
      const without = previous.filter((entry) => entry.query !== trimmed);

      return [{ query: trimmed, results }, ...without].slice(0, RECENT_CACHE_SIZE);
    });
  }, [enabled, result.data, results, trimmed]);

  return {
    query,
    setQuery,
    debouncedQuery: trimmed,
    results,
    usedFallback: Boolean(result.data?.usedFallback),
    isLoading: enabled && result.isPending,
    isError: result.isError,
    error: result.error ?? null,
    isDebouncing: query.trim() !== trimmed,
    recent,
    query_: result,
  };
}
