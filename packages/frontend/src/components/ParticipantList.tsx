'use client';

import * as React from 'react';
import { Badge } from '../../components/ui/Badge';
import type { Participant } from '../hooks/useCallLive';

export interface ParticipantListProps {
  participants: Participant[];
  loading?: boolean;
  /** Rows shown before "show all" is pressed. */
  previewCount?: number;
}

function shortWallet(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

/** Who has backed a call, and on which side (FE-05). */
export function ParticipantList({
  participants,
  loading,
  previewCount = 5,
}: ParticipantListProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (loading) {
    return (
      <ul data-testid="participant-skeleton" aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="h-10 animate-pulse rounded bg-gray-100" />
        ))}
      </ul>
    );
  }

  if (participants.length === 0) {
    return (
      <p data-testid="participant-empty" className="text-sm text-gray-500">
        No one has backed this call yet.
      </p>
    );
  }

  const visible = expanded ? participants : participants.slice(0, previewCount);
  const hidden = participants.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <ul data-testid="participant-list" className="flex flex-col gap-1">
        {visible.map((participant) => (
          <li
            key={participant.id}
            data-testid={`participant-${participant.id}`}
            className="flex items-center justify-between rounded border px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">
                {participant.displayName || shortWallet(participant.wallet)}
              </span>
              <Badge tone={participant.side === 'yes' ? 'green' : 'red'}>
                {participant.side.toUpperCase()}
              </Badge>
            </span>
            <span className="text-gray-600">{participant.amount}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          data-testid="participant-show-all"
          onClick={() => setExpanded(true)}
          className="self-start text-xs underline"
        >
          Show {hidden} more
        </button>
      ) : null}
    </div>
  );
}

export default ParticipantList;
