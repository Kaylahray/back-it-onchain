import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  poolSplit,
  roomFor,
  useCallLive,
  type CallLiveUpdate,
  type LiveSocket,
  type Participant,
} from './useCallLive';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    wallet: '0x1234567890abcdef',
    side: 'yes',
    amount: 100,
    joinedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** A socket whose handlers can be fired by the test. */
function fakeSocket() {
  const handlers = new Map<string, ((payload: CallLiveUpdate) => void)[]>();
  const joined: string[] = [];
  let disconnected = false;

  const socket: LiveSocket = {
    on: (event, handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    off: (event, handler) => {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, handler ? existing.filter((h) => h !== handler) : []);
    },
    emit: (event, ...args) => {
      if (event === 'join') joined.push(String(args[0]));
    },
    disconnect: () => {
      disconnected = true;
    },
  };

  return {
    socket,
    joined,
    get disconnected() {
      return disconnected;
    },
    emitUpdate(payload: CallLiveUpdate) {
      for (const handler of handlers.get('update') ?? []) handler(payload);
    },
    handlerCount(event: string) {
      return (handlers.get(event) ?? []).length;
    },
  };
}

describe('roomFor', () => {
  it('namespaces the room by call id', () => {
    expect(roomFor('42')).toBe('market:42');
  });
});

describe('poolSplit', () => {
  it('splits proportionally', () => {
    expect(poolSplit({ yesTotal: 75, noTotal: 25 })).toEqual({ yesPercent: 75, noPercent: 25 });
  });

  // An empty pool carries no information; 50/50 says that honestly, where
  // 100/0 would imply a consensus nobody expressed.
  it('shows an even split for an empty pool', () => {
    expect(poolSplit({ yesTotal: 0, noTotal: 0 })).toEqual({ yesPercent: 50, noPercent: 50 });
  });

  it('always sums to 100', () => {
    for (const pool of [
      { yesTotal: 1, noTotal: 2 },
      { yesTotal: 999, noTotal: 1 },
      { yesTotal: 0, noTotal: 5 },
    ]) {
      const { yesPercent, noPercent } = poolSplit(pool);

      expect(yesPercent + noPercent).toBeCloseTo(100);
    }
  });
});

describe('useCallLive', () => {
  it('joins the call-specific room', () => {
    const fake = fakeSocket();

    renderHook(() => useCallLive('42', { socketFactory: () => fake.socket }));

    expect(fake.joined).toContain('market:42');
  });

  it('applies a pool update pushed over the socket', async () => {
    const fake = fakeSocket();

    const { result } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    expect(result.current.pool).toEqual({ yesTotal: 0, noTotal: 0 });

    act(() => fake.emitUpdate({ pool: { yesTotal: 300, noTotal: 100 } }));

    await waitFor(() => expect(result.current.pool.yesTotal).toBe(300));
    expect(result.current.yesPercent).toBe(75);
    expect(result.current.total).toBe(400);
  });

  it('keeps the other side when only one is pushed', async () => {
    const fake = fakeSocket();
    const { result } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    act(() => fake.emitUpdate({ pool: { yesTotal: 100, noTotal: 100 } }));
    await waitFor(() => expect(result.current.total).toBe(200));

    act(() => fake.emitUpdate({ pool: { yesTotal: 500 } }));

    await waitFor(() => expect(result.current.pool.yesTotal).toBe(500));
    expect(result.current.pool.noTotal).toBe(100);
  });

  it('replaces the participant list when a full list arrives', async () => {
    const fake = fakeSocket();
    const { result } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    act(() => fake.emitUpdate({ participants: [participant(), participant({ id: 'p2' })] }));

    await waitFor(() => expect(result.current.participants).toHaveLength(2));
  });

  it('prepends an incrementally pushed participant', async () => {
    const fake = fakeSocket();
    const { result } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    act(() => fake.emitUpdate({ participants: [participant({ id: 'p1' })] }));
    await waitFor(() => expect(result.current.participants).toHaveLength(1));

    act(() => fake.emitUpdate({ participant: participant({ id: 'p2', amount: 50 }) }));

    await waitFor(() => expect(result.current.participants).toHaveLength(2));
    expect(result.current.participants[0].id).toBe('p2');
  });

  // Someone raising their stake is an update, not a second entry — otherwise
  // the list double-counts them.
  it('replaces rather than duplicates a participant already present', async () => {
    const fake = fakeSocket();
    const { result } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    act(() => fake.emitUpdate({ participant: participant({ id: 'p1', amount: 100 }) }));
    await waitFor(() => expect(result.current.participants).toHaveLength(1));

    act(() => fake.emitUpdate({ participant: participant({ id: 'p1', amount: 250 }) }));

    await waitFor(() => expect(result.current.participants[0].amount).toBe(250));
    expect(result.current.participants).toHaveLength(1);
  });

  it('records when the last update arrived', async () => {
    const fake = fakeSocket();
    const { result } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    expect(result.current.lastUpdateAt).toBeNull();

    act(() => fake.emitUpdate({ pool: { yesTotal: 1, noTotal: 0 } }));

    await waitFor(() => expect(result.current.lastUpdateAt).not.toBeNull());
  });

  it('unsubscribes and disconnects on unmount', () => {
    const fake = fakeSocket();

    const { unmount } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    expect(fake.handlerCount('update')).toBe(1);

    unmount();

    expect(fake.handlerCount('update')).toBe(0);
    expect(fake.disconnected).toBe(true);
  });

  it('seeds state from a polled snapshot when there is no socket', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({
      pool: { yesTotal: 10, noTotal: 30 },
      participants: [participant()],
    });

    const { result } = renderHook(() => useCallLive('42', { fetchSnapshot }));

    await waitFor(() => expect(result.current.total).toBe(40));
    expect(result.current.participants).toHaveLength(1);
    expect(result.current.yesPercent).toBe(25);
  });

  // A failing poll must not take the page down; the socket may still be fine
  // and the next tick retries.
  it('survives a failing poll', async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useCallLive('42', { fetchSnapshot }));

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalled());
    expect(result.current.pool).toEqual({ yesTotal: 0, noTotal: 0 });
  });

  it('does nothing when disabled', async () => {
    const fetchSnapshot = vi.fn();
    const fake = fakeSocket();

    renderHook(() =>
      useCallLive('42', { fetchSnapshot, socketFactory: () => fake.socket, enabled: false }),
    );

    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(fake.joined).toHaveLength(0);
  });

  it('reports connection state from the socket lifecycle', async () => {
    const fake = fakeSocket();

    const { result, unmount } = renderHook(() =>
      useCallLive('42', { socketFactory: () => fake.socket }),
    );

    await waitFor(() => expect(result.current.connected).toBe(true));

    unmount();
  });
});
