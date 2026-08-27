'use client';

/**
 * Token search and safety panel (FE-03).
 *
 * Every result carries a safety verdict, because the failure this screen
 * guards against is not "no result" — it is a plausible-looking token with no
 * liquidity or an unsellable balance. The badge states the verdict in words as
 * well as colour, and the reasons are listed rather than summarised away.
 */

import * as React from 'react';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import {
  safetyLevelFor,
  safetyWarningsFor,
  useTokenSearch,
  type SafetyLevel,
  type TokenSearchResult,
} from '../hooks/useTokenSearch';

const TONE_FOR_LEVEL: Record<SafetyLevel, BadgeTone> = {
  safe: 'green',
  caution: 'yellow',
  danger: 'red',
};

const LABEL_FOR_LEVEL: Record<SafetyLevel, string> = {
  safe: 'Looks healthy',
  caution: 'Caution',
  danger: 'High risk',
};

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;

  return `$${value.toFixed(0)}`;
}

function formatPairAge(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 24) return `${Math.max(0, Math.round(hours))}h old`;

  return `${Math.round(hours / 24)}d old`;
}

/** Placeholder rows shown while a search is in flight. */
export function TokenSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul data-testid="token-skeleton" aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="h-16 animate-pulse rounded bg-gray-100" />
      ))}
    </ul>
  );
}

export function TokenRow({
  token,
  onSelect,
  selected,
}: {
  token: TokenSearchResult;
  onSelect?: (token: TokenSearchResult) => void;
  selected?: boolean;
}) {
  const level = safetyLevelFor(token);
  const warnings = safetyWarningsFor(token);

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected ?? false}
        data-testid={`token-row-${token.address}`}
        onClick={() => onSelect?.(token)}
        className="flex w-full flex-col gap-1 rounded border p-3 text-left hover:bg-gray-50"
      >
        <span className="flex items-center gap-2">
          <span className="font-semibold">{token.symbol}</span>
          <span className="text-sm text-gray-500">{token.name}</span>
          <Badge tone={TONE_FOR_LEVEL[level]} data-testid={`token-safety-${token.address}`}>
            {LABEL_FOR_LEVEL[level]}
          </Badge>
          {token.isHoneypot ? (
            <Badge tone="red" data-testid={`token-honeypot-${token.address}`}>
              Honeypot
            </Badge>
          ) : null}
        </span>

        <span className="flex flex-wrap gap-3 text-xs text-gray-600">
          <span data-testid={`token-liquidity-${token.address}`}>
            Liquidity {formatUsd(token.liquidityUsd)}
          </span>
          <span data-testid={`token-volume-${token.address}`}>
            24h volume {formatUsd(token.volume24hUsd)}
          </span>
          <span data-testid={`token-age-${token.address}`}>{formatPairAge(token.pairAgeHours)}</span>
        </span>

        {warnings.length > 0 ? (
          <ul data-testid={`token-warnings-${token.address}`} className="text-xs text-amber-700">
            {warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}

        {token.fromDexScreenerFallback ? (
          <span className="text-xs text-gray-500">Data from DexScreener fallback</span>
        ) : null}
      </button>
    </li>
  );
}

export interface TokenSelectorProps {
  onSelect?: (token: TokenSearchResult) => void;
  selectedAddress?: string;
  initialQuery?: string;
}

export function TokenSelector({ onSelect, selectedAddress, initialQuery }: TokenSelectorProps) {
  const {
    query,
    setQuery,
    debouncedQuery,
    results,
    usedFallback,
    isLoading,
    isError,
    error,
    isDebouncing,
  } = useTokenSearch(initialQuery);

  const showSkeleton = isLoading || isDebouncing;
  const searched = debouncedQuery.length > 0;

  return (
    <section className="flex flex-col gap-3" data-testid="token-selector">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Search tokens</span>
        <input
          type="search"
          aria-label="Search tokens"
          data-testid="token-search-input"
          placeholder="Symbol, name, or address"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded border px-2 py-1"
        />
      </label>

      {usedFallback ? (
        <p data-testid="token-fallback-notice" className="text-xs text-amber-700">
          Primary token index unavailable — showing DexScreener results, which may be incomplete.
        </p>
      ) : null}

      {isError ? (
        <p role="alert" data-testid="token-search-error" className="text-sm text-red-600">
          {error?.message ?? 'Token search failed'}
        </p>
      ) : null}

      {showSkeleton ? <TokenSkeleton /> : null}

      {!showSkeleton && !isError && searched && results.length === 0 ? (
        <p data-testid="token-search-empty" className="text-sm text-gray-500">
          No tokens matched “{debouncedQuery}”.
        </p>
      ) : null}

      {!showSkeleton && results.length > 0 ? (
        <ul data-testid="token-results" className="flex flex-col gap-2">
          {results.map((token) => (
            <TokenRow
              key={token.address}
              token={token}
              onSelect={onSelect}
              selected={token.address === selectedAddress}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default TokenSelector;
