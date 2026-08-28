import React from 'react';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FOLLOW_SEARCH_DEBOUNCE_MS,
  applyFollowToStats,
  useFollow,
  useFollowList,
  type FollowTransport,
} from './useFollow';
import { FollowButton } from '../components/follow/FollowButton';

const PROFILE = '0xprofile';
const VIEWER = '0xviewer';

function transport(overrides: Partial<FollowTransport> = {}): FollowTransport {
  return {
    getStats: vi.fn().mockResolvedValue({
      followersCount: 10,
      followingCount: 5,
      isFollowing: false,
    }),
    follow: vi.fn().mockResolvedValue(undefined),
    unfollow: vi.fn().mockResolvedValue(undefined),
    listFollows: vi.fn().mockResolvedValue({ users: [], hasMore: false }),
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('applyFollowToStats', () => {
  it('increments on follow and decrements on unfollow', () => {
    const stats = { followersCount: 10, followingCount: 5, isFollowing: false };

    expect(applyFollowToStats(stats, true)).toMatchObject({
      followersCount: 11,
      isFollowing: true,
    });
    expect(applyFollowToStats(stats, false)).toMatchObject({
      followersCount: 9,
      isFollowing: false,
    });
  });

  // A stale cache plus a double-click would otherwise render "-1 followers".
  it('never produces a negative count', () => {
    const stats = { followersCount: 0, followingCount: 0, isFollowing: true };

    expect(applyFollowToStats(stats, false)?.followersCount).toBe(0);
  });

  it('leaves an absent cache alone', () => {
    expect(applyFollowToStats(undefined, true)).toBeUndefined();
  });
});

describe('useFollow', () => {
  it('loads follow stats', async () => {
    const { result } = renderHook(() => useFollow(PROFILE, VIEWER, { transport: transport() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.stats?.followersCount).toBe(10));
    expect(result.current.isFollowing).toBe(false);
  });

  // The reason optimism is used here at all: the toggle must not wait for a
  // round trip.
  it('flips the state before the request resolves', async () => {
    let resolveFollow: (() => void) | undefined;

    const api = transport({
      follow: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveFollow = resolve;
          }),
      ),
    });

    const { result } = renderHook(() => useFollow(PROFILE, VIEWER, { transport: api }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.stats).toBeDefined());

    act(() => result.current.follow());

    // Already true while the request is still in flight.
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    expect(result.current.stats?.followersCount).toBe(11);

    act(() => resolveFollow?.());
  });

  it('rolls back when the request fails', async () => {
    const api = transport({ follow: vi.fn().mockRejectedValue(new Error('offline')) });

    const { result } = renderHook(() => useFollow(PROFILE, VIEWER, { transport: api }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.stats?.followersCount).toBe(10));

    act(() => result.current.follow());

    await waitFor(() => expect(result.current.lastMutationError?.message).toBe('offline'));

    // Restored to exactly what was there before.
    await waitFor(() => expect(result.current.stats?.followersCount).toBe(10));
    expect(result.current.isFollowing).toBe(false);
  });

  // Rolling back by inverting would let two failures drift the count.
  it('restores the snapshot rather than inverting the change', async () => {
    const api = transport({ unfollow: vi.fn().mockRejectedValue(new Error('nope')) });

    const { result } = renderHook(
      () =>
        useFollow(PROFILE, VIEWER, {
          transport: transport({
            ...api,
            getStats: vi
              .fn()
              .mockResolvedValue({ followersCount: 10, followingCount: 5, isFollowing: true }),
          }),
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isFollowing).toBe(true));

    act(() => result.current.unfollow());
    await waitFor(() => expect(result.current.lastMutationError).not.toBeNull());
    await waitFor(() => expect(result.current.stats?.followersCount).toBe(10));

    act(() => result.current.unfollow());
    await waitFor(() => expect(result.current.stats?.followersCount).toBe(10));
  });

  it('toggles in the correct direction', async () => {
    const api = transport();

    const { result } = renderHook(() => useFollow(PROFILE, VIEWER, { transport: api }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.stats).toBeDefined());

    act(() => result.current.toggle());

    await waitFor(() => expect(api.follow).toHaveBeenCalledWith(PROFILE, VIEWER));
  });

  it('refuses to mutate without a connected wallet', async () => {
    const api = transport();

    const { result } = renderHook(() => useFollow(PROFILE, undefined, { transport: api }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.stats).toBeDefined());

    act(() => result.current.follow());

    await waitFor(() =>
      expect(result.current.lastMutationError?.message).toContain('Connect a wallet'),
    );
    expect(api.follow).not.toHaveBeenCalled();
  });
});

describe('useFollowList', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces the search term before querying', async () => {
    const api = transport();

    const { result } = renderHook(() => useFollowList(PROFILE, 'followers', { transport: api }), {
      wrapper,
    });

    act(() => result.current.setSearch('al'));
    act(() => result.current.setSearch('ali'));
    act(() => result.current.setSearch('alice'));

    // Only the settled term should ever reach the transport.
    act(() => void vi.advanceTimersByTime(FOLLOW_SEARCH_DEBOUNCE_MS));

    await vi.waitFor(() =>
      expect(api.listFollows).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'alice' }),
      ),
    );

    const searched = (api.listFollows as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0].search)
      .filter(Boolean);

    expect(searched).toEqual(['alice']);
  });

  it('reports that a search is pending while debouncing', () => {
    const { result } = renderHook(() => useFollowList(PROFILE, 'followers', { transport: transport() }), {
      wrapper,
    });

    act(() => result.current.setSearch('a'));
    expect(result.current.isSearching).toBe(true);

    act(() => void vi.advanceTimersByTime(FOLLOW_SEARCH_DEBOUNCE_MS));
    expect(result.current.isSearching).toBe(false);
  });

  // Page 3 of a previous result set is meaningless for a new search.
  it('resets to the first page when the search changes', () => {
    const { result } = renderHook(() => useFollowList(PROFILE, 'followers', { transport: transport() }), {
      wrapper,
    });

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    act(() => result.current.setSearch('bob'));
    act(() => void vi.advanceTimersByTime(FOLLOW_SEARCH_DEBOUNCE_MS));

    expect(result.current.page).toBe(1);
  });
});

describe('FollowButton', () => {
  function renderButton(props: Partial<React.ComponentProps<typeof FollowButton>> = {}) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    return render(
      <QueryClientProvider client={client}>
        <FollowButton
          profileAddress={PROFILE}
          viewerAddress={VIEWER}
          transport={transport()}
          {...props}
        />
      </QueryClientProvider>,
    );
  }

  it('labels itself by the current state', async () => {
    renderButton();

    await waitFor(() => expect(screen.getByTestId('follow-button')).toHaveTextContent('Follow'));
    expect(screen.getByTestId('follow-button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('flips the label on click and keeps it once the server agrees', async () => {
    // A stateful stub, because the mutation invalidates and refetches on
    // settle: a stub that always answers `isFollowing: false` would correctly
    // overwrite the optimistic value and the test would be asserting a lie.
    let following = false;

    renderButton({
      transport: transport({
        getStats: vi.fn(async () => ({
          followersCount: following ? 11 : 10,
          followingCount: 5,
          isFollowing: following,
        })),
        follow: vi.fn(async () => {
          following = true;
        }),
      }),
    });

    await waitFor(() => expect(screen.getByTestId('follow-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('follow-button'));

    await waitFor(() =>
      expect(screen.getByTestId('follow-button')).toHaveTextContent('Following'),
    );
    expect(screen.getByTestId('follow-button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reverts and explains when the request fails', async () => {
    renderButton({
      transport: transport({ follow: vi.fn().mockRejectedValue(new Error('offline')) }),
    });

    await waitFor(() => expect(screen.getByTestId('follow-button')).toBeEnabled());

    fireEvent.click(screen.getByTestId('follow-button'));

    await waitFor(() => expect(screen.getByTestId('follow-error')).toHaveTextContent('offline'));
    expect(screen.getByTestId('follow-button')).toHaveTextContent('Follow');
  });

  it('asks for a wallet when none is connected', async () => {
    renderButton({ viewerAddress: undefined });

    await waitFor(() => expect(screen.getByTestId('follow-needs-wallet')).toBeInTheDocument());
    expect(screen.getByTestId('follow-button')).toBeDisabled();
  });

  // Following yourself is not a meaningful action and the backend rejects it.
  it('renders nothing on your own profile', () => {
    renderButton({ viewerAddress: PROFILE });

    expect(screen.queryByTestId('follow-button')).not.toBeInTheDocument();
  });
});
