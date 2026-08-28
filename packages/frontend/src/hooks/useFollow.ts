'use client';

/**
 * Follow graph (FE-08).
 *
 * The follow button is the case optimistic updates exist for: the user has
 * already decided, the server will almost always agree, and a spinner on a
 * toggle feels broken. So the cache is updated first and rolled back if the
 * request fails — including the follower count, because a button that flips
 * while the count beside it lags looks like a bug.
 */

import * as React from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

/** Debounce applied to search inside the followers/following modal. */
export const FOLLOW_SEARCH_DEBOUNCE_MS = 300;

export interface FollowUser {
  id: string;
  address: string;
  username?: string;
  avatar?: string;
  trustScore?: number;
  followedAt: string;
}

export interface FollowStatsData {
  followersCount: number;
  followingCount: number;
  /** Whether the viewer follows this profile. */
  isFollowing?: boolean;
}

export type FollowTab = 'followers' | 'following';

export interface FollowTransport {
  getStats(profileAddress: string, viewerAddress?: string): Promise<FollowStatsData>;
  follow(profileAddress: string, viewerAddress: string): Promise<void>;
  unfollow(profileAddress: string, viewerAddress: string): Promise<void>;
  listFollows(params: {
    profileAddress: string;
    tab: FollowTab;
    search?: string;
    page?: number;
  }): Promise<{ users: FollowUser[]; hasMore?: boolean }>;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

async function expectOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${action} failed (${response.status})`);
  }
}

export const defaultFollowTransport: FollowTransport = {
  async getStats(profileAddress, viewerAddress) {
    const params = viewerAddress ? `?viewer=${encodeURIComponent(viewerAddress)}` : '';
    const response = await fetch(
      `${apiBase()}/users/${encodeURIComponent(profileAddress)}/follow-stats${params}`,
    );

    await expectOk(response, 'Loading follow stats');

    return (await response.json()) as FollowStatsData;
  },

  async follow(profileAddress, viewerAddress) {
    const response = await fetch(`${apiBase()}/users/${encodeURIComponent(profileAddress)}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower: viewerAddress }),
    });

    await expectOk(response, 'Follow');
  },

  async unfollow(profileAddress, viewerAddress) {
    const response = await fetch(`${apiBase()}/users/${encodeURIComponent(profileAddress)}/follow`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower: viewerAddress }),
    });

    await expectOk(response, 'Unfollow');
  },

  async listFollows({ profileAddress, tab, search, page = 1 }) {
    const params = new URLSearchParams({ page: String(page) });

    if (search) params.set('q', search);

    const response = await fetch(
      `${apiBase()}/users/${encodeURIComponent(profileAddress)}/${tab}?${params.toString()}`,
    );

    await expectOk(response, 'Loading follow list');

    const body = (await response.json()) as { users: FollowUser[]; hasMore?: boolean } | FollowUser[];

    return Array.isArray(body) ? { users: body, hasMore: false } : body;
  },
};

export function followStatsKey(profileAddress: string): [string, string] {
  return ['follow-stats', profileAddress];
}

export function followListKey(
  profileAddress: string,
  tab: FollowTab,
  search: string,
  page: number,
): [string, string, FollowTab, string, number] {
  return ['follow-list', profileAddress, tab, search, page];
}

/** Apply a follow/unfollow to a cached stats object. */
export function applyFollowToStats(
  stats: FollowStatsData | undefined,
  following: boolean,
): FollowStatsData | undefined {
  if (!stats) return stats;

  const delta = following ? 1 : -1;

  return {
    ...stats,
    isFollowing: following,
    // Never let an optimistic decrement produce a negative count — a stale
    // cache plus a double-click would otherwise render "-1 followers".
    followersCount: Math.max(0, stats.followersCount + delta),
  };
}

export interface UseFollowOptions {
  transport?: FollowTransport;
  /** Injectable for tests; defaults to the surrounding provider's client. */
  queryClient?: QueryClient;
}

export interface UseFollowResult {
  stats: FollowStatsData | undefined;
  isFollowing: boolean;
  isLoading: boolean;
  isError: boolean;
  /** True while a follow/unfollow is in flight. */
  isMutating: boolean;
  error: Error | null;
  follow: () => void;
  unfollow: () => void;
  toggle: () => void;
  /** Set when the last mutation failed and the UI was rolled back. */
  lastMutationError: Error | null;
}

export function useFollow(
  profileAddress: string,
  viewerAddress?: string,
  options: UseFollowOptions = {},
): UseFollowResult {
  const { transport = defaultFollowTransport } = options;
  const client = useQueryClient();

  const stats = useQuery({
    queryKey: followStatsKey(profileAddress),
    queryFn: () => transport.getStats(profileAddress, viewerAddress),
    enabled: Boolean(profileAddress),
  });

  const mutation = useMutation<void, Error, boolean, { previous?: FollowStatsData }>({
    mutationFn: async (following: boolean) => {
      if (!viewerAddress) {
        throw new Error('Connect a wallet to follow');
      }

      return following
        ? transport.follow(profileAddress, viewerAddress)
        : transport.unfollow(profileAddress, viewerAddress);
    },

    async onMutate(following) {
      // Stop an in-flight refetch from landing on top of the optimistic value
      // and undoing it.
      await client.cancelQueries({ queryKey: followStatsKey(profileAddress) });

      const previous = client.getQueryData<FollowStatsData>(followStatsKey(profileAddress));

      client.setQueryData<FollowStatsData | undefined>(
        followStatsKey(profileAddress),
        (current) => applyFollowToStats(current, following),
      );

      return { previous };
    },

    onError(_error, _following, context) {
      // Roll back to exactly what was there, rather than inverting the
      // optimistic change — two failures in a row would otherwise leave the
      // count drifting.
      if (context && 'previous' in context) {
        client.setQueryData(followStatsKey(profileAddress), context.previous);
      }
    },

    onSettled() {
      void client.invalidateQueries({ queryKey: followStatsKey(profileAddress) });
    },
  });

  const isFollowing = stats.data?.isFollowing ?? false;

  return {
    stats: stats.data,
    isFollowing,
    isLoading: stats.isPending,
    isError: stats.isError,
    isMutating: mutation.isPending,
    error: stats.error ?? null,
    follow: () => mutation.mutate(true),
    unfollow: () => mutation.mutate(false),
    toggle: () => mutation.mutate(!isFollowing),
    lastMutationError: mutation.error ?? null,
  };
}

/** Debounce a value, returning the settled one. */
export function useDebounced<T>(value: T, delayMs = FOLLOW_SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

export interface UseFollowListResult {
  users: FollowUser[];
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  search: string;
  setSearch: (next: string) => void;
  /** True while the user has typed but the debounce has not settled. */
  isSearching: boolean;
  page: number;
  setPage: (next: number) => void;
}

/** Paginated followers/following list with debounced search (FE-08). */
export function useFollowList(
  profileAddress: string,
  tab: FollowTab,
  options: UseFollowOptions & { enabled?: boolean } = {},
): UseFollowListResult {
  const { transport = defaultFollowTransport, enabled = true } = options;

  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);

  // A new search term restarts paging; keeping the old page would show
  // page 3 of a result set that may only have one page.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tab]);

  const query = useQuery({
    queryKey: followListKey(profileAddress, tab, debouncedSearch, page),
    queryFn: () =>
      transport.listFollows({ profileAddress, tab, search: debouncedSearch || undefined, page }),
    enabled: enabled && Boolean(profileAddress),
  });

  return {
    users: query.data?.users ?? [],
    hasMore: Boolean(query.data?.hasMore),
    isLoading: query.isPending,
    isError: query.isError,
    search,
    setSearch,
    isSearching: search !== debouncedSearch,
    page,
    setPage,
  };
}
