'use client';

/**
 * Profile data for `/profile/[wallet]` (FE-07).
 *
 * Profile and history are separate queries: the header should paint as soon
 * as the user record lands rather than waiting on a history page that can run
 * to hundreds of calls.
 */

import { useQuery } from '@tanstack/react-query';
import type { CallHistoryEntry } from '../lib/reputation';

export interface ProfileUser {
  wallet: string;
  displayName?: string;
  handle?: string;
  bio?: string;
  avatar?: string;
  createdAt?: string;
  reputationScore?: number;
}

export interface ProfileTransport {
  getUser(wallet: string): Promise<ProfileUser>;
  getHistory(wallet: string): Promise<CallHistoryEntry[]>;
  exportHistory(wallet: string, format: 'csv' | 'json'): Promise<string>;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

async function expectOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${action} failed (${response.status})`);
  }
}

export const defaultProfileTransport: ProfileTransport = {
  async getUser(wallet) {
    const response = await fetch(`${apiBase()}/users/${encodeURIComponent(wallet)}`);

    await expectOk(response, 'Loading profile');

    return (await response.json()) as ProfileUser;
  },

  async getHistory(wallet) {
    const response = await fetch(`${apiBase()}/users/${encodeURIComponent(wallet)}/calls`);

    await expectOk(response, 'Loading call history');

    const payload = await response.json();

    // The endpoint has been seen returning both a bare array and a wrapper.
    return (Array.isArray(payload) ? payload : (payload?.calls ?? [])) as CallHistoryEntry[];
  },

  async exportHistory(wallet, format) {
    const response = await fetch(
      `${apiBase()}/users/${encodeURIComponent(wallet)}/calls/export?format=${format}`,
    );

    await expectOk(response, 'Export');

    return await response.text();
  },
};

export interface UseProfileOptions {
  transport?: ProfileTransport;
  enabled?: boolean;
}

export function useProfile(wallet: string | undefined, options: UseProfileOptions = {}) {
  const { transport = defaultProfileTransport, enabled = true } = options;
  const active = Boolean(wallet) && enabled;

  const profile = useQuery({
    queryKey: ['profile', wallet],
    queryFn: () => transport.getUser(wallet as string),
    enabled: active,
    retry: false,
  });

  const history = useQuery({
    queryKey: ['profile-history', wallet],
    queryFn: () => transport.getHistory(wallet as string),
    enabled: active,
    retry: false,
  });

  return {
    user: profile.data,
    history: history.data ?? [],
    isLoading: profile.isLoading,
    isHistoryLoading: history.isLoading,
    error: (profile.error ?? history.error) as Error | undefined,
    refetch: () => {
      void profile.refetch();
      void history.refetch();
    },
    exportHistory: (format: 'csv' | 'json') =>
      transport.exportHistory(wallet as string, format),
  };
}
