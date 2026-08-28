'use client';

/**
 * Live call state (FE-05).
 *
 * A call's pool moves while you are looking at it, so the detail page needs
 * both a push channel and a fallback:
 *
 * - **Socket.io** room `market:<id>` delivers updates as they happen.
 * - **Polling** covers the socket being unavailable, blocked, or lagging. It
 *   backs off to a slow interval while the socket is connected rather than
 *   stopping, so a silently dead socket still self-corrects.
 *
 * The transport is injectable. Tests drive a fake socket rather than standing
 * up a server, and the page can run entirely offline against a mock — which is
 * what FE-05 asks for while the backend channel does not exist yet.
 */

import * as React from 'react';

export interface Participant {
  id: string;
  wallet: string;
  displayName?: string;
  side: 'yes' | 'no';
  amount: number;
  joinedAt: string;
}

export interface CallPool {
  yesTotal: number;
  noTotal: number;
}

/** Payload broadcast on the `market:<id>` room. */
export interface CallLiveUpdate {
  pool?: Partial<CallPool>;
  participants?: Participant[];
  /** A single participant to append, for incremental updates. */
  participant?: Participant;
}

/** Minimal surface this hook needs from a socket. */
export interface LiveSocket {
  on: (event: string, handler: (payload: CallLiveUpdate) => void) => void;
  off: (event: string, handler?: (payload: CallLiveUpdate) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  disconnect: () => void;
  connected?: boolean;
}

export type SocketFactory = (room: string) => LiveSocket;

/** Poll interval while the socket is down. */
export const POLL_INTERVAL_MS = 10_000;

/** Slower poll retained while the socket is up, to catch a silent failure. */
export const BACKGROUND_POLL_INTERVAL_MS = 60_000;

export interface UseCallLiveOptions {
  socketFactory?: SocketFactory;
  fetchSnapshot?: (callId: string) => Promise<CallLiveUpdate>;
  pollIntervalMs?: number;
  backgroundPollIntervalMs?: number;
  /** Disable both transports — used for static rendering and tests. */
  enabled?: boolean;
}

export interface UseCallLiveResult {
  pool: CallPool;
  participants: Participant[];
  connected: boolean;
  lastUpdateAt: number | null;
  /** Total staked across both sides. */
  total: number;
  /** YES share of the pool, 0–100. Exactly 50 when the pool is empty. */
  yesPercent: number;
  noPercent: number;
}

/** The room name a call broadcasts on. */
export function roomFor(callId: string): string {
  return `market:${callId}`;
}

/** Percentage split of a pool, defaulting to an even split when empty. */
export function poolSplit(pool: CallPool): { yesPercent: number; noPercent: number } {
  const total = pool.yesTotal + pool.noTotal;

  // An empty pool has no information in it. Showing 50/50 is honest; showing
  // 0/0 or 100/0 would imply a consensus that does not exist.
  if (total <= 0) return { yesPercent: 50, noPercent: 50 };

  const yesPercent = (pool.yesTotal / total) * 100;

  return { yesPercent, noPercent: 100 - yesPercent };
}

export function useCallLive(
  callId: string,
  options: UseCallLiveOptions = {},
): UseCallLiveResult {
  const {
    socketFactory,
    fetchSnapshot,
    pollIntervalMs = POLL_INTERVAL_MS,
    backgroundPollIntervalMs = BACKGROUND_POLL_INTERVAL_MS,
    enabled = true,
  } = options;

  const [pool, setPool] = React.useState<CallPool>({ yesTotal: 0, noTotal: 0 });
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [lastUpdateAt, setLastUpdateAt] = React.useState<number | null>(null);

  const applyUpdate = React.useCallback((update: CallLiveUpdate) => {
    if (update.pool) {
      setPool((current) => ({
        yesTotal: update.pool?.yesTotal ?? current.yesTotal,
        noTotal: update.pool?.noTotal ?? current.noTotal,
      }));
    }

    if (update.participants) {
      setParticipants(update.participants);
    }

    if (update.participant) {
      const incoming = update.participant;

      setParticipants((current) => {
        // Replace rather than append when the id is already present: a
        // participant raising their stake is an update, not a second row.
        const without = current.filter((entry) => entry.id !== incoming.id);

        return [incoming, ...without];
      });
    }

    setLastUpdateAt(Date.now());
  }, []);

  // Socket subscription.
  React.useEffect(() => {
    if (!enabled || !socketFactory || !callId) return;

    const socket = socketFactory(roomFor(callId));
    const handler = (payload: CallLiveUpdate) => applyUpdate(payload);

    socket.on('update', handler);
    socket.emit('join', roomFor(callId));
    setConnected(true);

    return () => {
      socket.off('update', handler);
      socket.disconnect();
      setConnected(false);
    };
  }, [applyUpdate, callId, enabled, socketFactory]);

  // Polling. Kept running while the socket is up, but slowed down — a socket
  // that stops delivering without disconnecting is otherwise undetectable.
  React.useEffect(() => {
    if (!enabled || !fetchSnapshot || !callId) return;

    let cancelled = false;

    const load = async () => {
      try {
        const snapshot = await fetchSnapshot(callId);

        if (!cancelled) applyUpdate(snapshot);
      } catch {
        // A failed poll is not fatal: the socket may still be delivering, and
        // the next tick will try again.
      }
    };

    void load();

    const interval = setInterval(load, connected ? backgroundPollIntervalMs : pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    applyUpdate,
    backgroundPollIntervalMs,
    callId,
    connected,
    enabled,
    fetchSnapshot,
    pollIntervalMs,
  ]);

  const { yesPercent, noPercent } = poolSplit(pool);

  return {
    pool,
    participants,
    connected,
    lastUpdateAt,
    total: pool.yesTotal + pool.noTotal,
    yesPercent,
    noPercent,
  };
}

/**
 * A stand-in for the Socket.io channel while the backend room does not exist
 * (FE-05 specifies a mock).
 *
 * It emits small, plausible pool movements on an interval so the live UI can
 * be exercised end to end. Swapping it for the real transport is a one-line
 * change at the call site — `socketFactory` is the seam.
 */
export function createMockCallSocket(options: { intervalMs?: number; seed?: CallPool } = {}) {
  const { intervalMs = 4_000, seed = { yesTotal: 1_200, noTotal: 800 } } = options;

  return (): LiveSocket => {
    const handlers = new Map<string, ((payload: CallLiveUpdate) => void)[]>();
    let pool = { ...seed };
    let tick = 0;

    const timer = setInterval(() => {
      tick += 1;

      // Deterministic drift rather than randomness, so a screenshot or a test
      // of this mock is reproducible.
      const delta = ((tick * 37) % 50) + 10;

      pool =
        tick % 2 === 0
          ? { ...pool, yesTotal: pool.yesTotal + delta }
          : { ...pool, noTotal: pool.noTotal + delta };

      for (const handler of handlers.get('update') ?? []) {
        handler({
          pool,
          participant: {
            id: `mock-${tick}`,
            wallet: `0x${tick.toString(16).padStart(40, '0')}`,
            side: tick % 2 === 0 ? 'yes' : 'no',
            amount: delta,
            joinedAt: new Date().toISOString(),
          },
        });
      }
    }, intervalMs);

    return {
      on: (event, handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      off: (event, handler) => {
        const existing = handlers.get(event) ?? [];
        handlers.set(event, handler ? existing.filter((h) => h !== handler) : []);
      },
      emit: () => {},
      disconnect: () => {
        clearInterval(timer);
        handlers.clear();
      },
      connected: true,
    };
  };
}
