'use client';

import * as React from 'react';
import { Badge } from '../../components/ui/Badge';
import { describeCondition, parseCondition } from '../lib/condition';

export interface CallDetailHeaderProps {
  title?: string;
  /** Thesis text, once resolved from IPFS. */
  thesis?: string;
  ipfsCid?: string;
  creatorName?: string;
  creatorWallet?: string;
  /** Raw `condition_json` as stored. */
  conditionJson?: unknown;
  deadline?: string;
  live?: boolean;
  loading?: boolean;
}

function shortWallet(wallet?: string): string {
  if (!wallet) return 'Anonymous';

  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

/** Title, creator, condition and thesis for a call (FE-05). */
export function CallDetailHeader({
  title,
  thesis,
  ipfsCid,
  creatorName,
  creatorWallet,
  conditionJson,
  deadline,
  live,
  loading,
}: CallDetailHeaderProps) {
  if (loading) {
    return (
      <div data-testid="call-header-skeleton" aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-6 w-2/3 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
        <div className="h-20 w-full animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  const condition = parseCondition(conditionJson);

  return (
    <header data-testid="call-header" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 data-testid="call-title" className="text-xl font-bold">
          {title || 'Untitled call'}
        </h1>
        {live ? (
          <Badge tone="green" data-testid="call-live-badge">
            Live
          </Badge>
        ) : null}
      </div>

      <p data-testid="call-creator" className="text-sm text-gray-600">
        by {creatorName || shortWallet(creatorWallet)}
      </p>

      <p data-testid="call-condition" className="text-sm">
        {condition ? describeCondition(condition) : 'Condition unavailable'}
      </p>

      {deadline ? (
        <p data-testid="call-deadline" className="text-sm text-gray-600">
          Resolves {new Date(deadline).toLocaleString()}
        </p>
      ) : null}

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Thesis</h2>
        {thesis ? (
          <p data-testid="call-thesis" className="whitespace-pre-wrap text-sm">
            {thesis}
          </p>
        ) : (
          <p data-testid="call-thesis-unavailable" className="text-sm text-gray-500">
            {ipfsCid
              ? `Thesis is pinned at ${ipfsCid} but could not be loaded.`
              : 'No thesis was provided.'}
          </p>
        )}
      </section>

      <section data-testid="evidence-panel" className="rounded border border-dashed p-3">
        <h2 className="text-sm font-semibold">Evidence</h2>
        <p className="text-sm text-gray-500">
          Evidence submissions will appear here once resolution opens.
        </p>
      </section>
    </header>
  );
}

export default CallDetailHeader;
