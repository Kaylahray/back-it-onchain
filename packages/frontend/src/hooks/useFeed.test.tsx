import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { FEED_TABS, computeWindow, useFeed, type FeedPage } from './useFeed';
import type { Call } from '../../lib/types';

function call(id: string): Call {
  return { id, title: `Call ${id}` };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('FEED_TABS', () => {
  it('exposes the three tabs the issue specifies', () => {
    expect(FEED_TABS).toEqual(['for-you', 'following', 'trending']);
  });
});

describe('useFeed', () => {
  it('loads the first page', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [call('1')], nextCursor: null });

    const { result } = renderHook(() => useFeed('for-you', { fetchPage }), { wrapper });

    await waitFor(() => expect(result.current.calls).toHaveLength(1));
    expect(fetchPage).toHaveBeenCalledWith('for-you', undefined);
  });

  it('requests the tab it was given', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [], nextCursor: null });

    renderHook(() => useFeed('trending', { fetchPage }), { wrapper });

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('trending', undefined));
  });

  it('appends the next page and passes the cursor through', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [call('1')], nextCursor: 'c1' } satisfies FeedPage)
      .mockResolvedValueOnce({ items: [call('2')], nextCursor: null } satisfies FeedPage);

    const { result } = renderHook(() => useFeed('for-you', { fetchPage }), { wrapper });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.calls).toHaveLength(2));
    expect(fetchPage).toHaveBeenLastCalledWith('for-you', 'c1');
    expect(result.current.hasNextPage).toBe(false);
  });

  // An intersection observer can fire repeatedly while the sentinel is in
  // view, so the guard lives in the hook rather than in every caller.
  it('ignores a request for the next page when there is none', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [call('1')], nextCursor: null });

    const { result } = renderHook(() => useFeed('for-you', { fetchPage }), { wrapper });

    await waitFor(() => expect(result.current.calls).toHaveLength(1));

    act(() => result.current.fetchNextPage());
    act(() => result.current.fetchNextPage());

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failure', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('feed down'));

    const { result } = renderHook(() => useFeed('for-you', { fetchPage }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('feed down');
  });

  it('refreshes from the first page', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [call('1')], nextCursor: null });

    const { result } = renderHook(() => useFeed('for-you', { fetchPage }), { wrapper });

    await waitFor(() => expect(result.current.calls).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('does not fetch when disabled', () => {
    const fetchPage = vi.fn();

    renderHook(() => useFeed('for-you', { fetchPage, enabled: false }), { wrapper });

    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('computeWindow', () => {
  const base = { itemHeight: 100, itemCount: 100, viewportHeight: 500, scrollTop: 0 };

  it('renders the first screenful plus overscan at the top', () => {
    const window = computeWindow(base);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBeGreaterThanOrEqual(5);
    expect(window.paddingTop).toBe(0);
  });

  it('moves the window as the list scrolls', () => {
    const window = computeWindow({ ...base, scrollTop: 5_000 });

    expect(window.startIndex).toBeGreaterThan(40);
    expect(window.paddingTop).toBe(window.startIndex * 100);
  });

  // The padding is what keeps the scrollbar honest — without it the track
  // would shrink to the rendered slice and jump as you scroll.
  it('pads above and below so the scroll height is unchanged', () => {
    const window = computeWindow({ ...base, scrollTop: 5_000 });
    const rendered = (window.endIndex - window.startIndex) * 100;

    expect(window.paddingTop + rendered + window.paddingBottom).toBe(100 * 100);
  });

  it('never runs past the end of the list', () => {
    const window = computeWindow({ ...base, scrollTop: 999_999 });

    expect(window.endIndex).toBeLessThanOrEqual(100);
    expect(window.paddingBottom).toBe(0);
  });

  // jsdom reports every height as zero, and so does the first paint before
  // layout. Rendering nothing would leave the list blank until a resize.
  it('renders a screenful when the viewport has not been measured', () => {
    const window = computeWindow({ ...base, viewportHeight: 0 });

    expect(window.endIndex).toBeGreaterThan(0);
  });

  it('renders everything for an empty or unmeasured list', () => {
    expect(computeWindow({ ...base, itemCount: 0 })).toMatchObject({ startIndex: 0, endIndex: 0 });
    expect(computeWindow({ ...base, itemHeight: 0 })).toMatchObject({ endIndex: 100 });
  });
});
