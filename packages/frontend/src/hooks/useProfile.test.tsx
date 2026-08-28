import React from 'react';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { useProfile, type ProfileTransport } from './useProfile';
import { ProfileHeader } from '../components/ProfileHeader';
import type { CallHistoryEntry } from '../lib/reputation';

const WALLET = '0xabc';

const historyRow: CallHistoryEntry = {
  id: 'c1',
  token: 'XLM',
  direction: 'up',
  stake: 100,
  pnl: 25,
  reputationDelta: 4,
  outcome: 'won',
  createdAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: '2026-01-05T00:00:00.000Z',
};

function transport(overrides: Partial<ProfileTransport> = {}): ProfileTransport {
  return {
    getUser: vi.fn().mockResolvedValue({
      wallet: WALLET,
      displayName: 'Ada',
      reputationScore: 72,
    }),
    getHistory: vi.fn().mockResolvedValue([historyRow]),
    exportHistory: vi.fn().mockResolvedValue('id,token'),
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useProfile', () => {
  it('loads the user and their history', async () => {
    const { result } = renderHook(() => useProfile(WALLET, { transport: transport() }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.user?.displayName).toBe('Ada'));
    expect(result.current.history).toEqual([historyRow]);
  });

  it('starts with an empty history rather than undefined', () => {
    const { result } = renderHook(() => useProfile(WALLET, { transport: transport() }), {
      wrapper,
    });

    expect(result.current.history).toEqual([]);
  });

  it('does not fetch without a wallet', () => {
    const stub = transport();

    renderHook(() => useProfile(undefined, { transport: stub }), { wrapper });

    expect(stub.getUser).not.toHaveBeenCalled();
    expect(stub.getHistory).not.toHaveBeenCalled();
  });

  it('surfaces a failed profile load', async () => {
    const stub = transport({ getUser: vi.fn().mockRejectedValue(new Error('Loading profile failed (404)')) });

    const { result } = renderHook(() => useProfile(WALLET, { transport: stub }), { wrapper });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Loading profile failed (404)'),
    );
  });

  // The header should paint as soon as the user record lands; a history page
  // can run to hundreds of calls.
  it('shows the profile even when the history request fails', async () => {
    const stub = transport({ getHistory: vi.fn().mockRejectedValue(new Error('nope')) });

    const { result } = renderHook(() => useProfile(WALLET, { transport: stub }), { wrapper });

    await waitFor(() => expect(result.current.user?.displayName).toBe('Ada'));
    expect(result.current.history).toEqual([]);
  });

  it('passes the format through to the export endpoint', async () => {
    const stub = transport();

    const { result } = renderHook(() => useProfile(WALLET, { transport: stub }), { wrapper });

    await waitFor(() => expect(result.current.user).toBeDefined());
    await result.current.exportHistory('json');

    expect(stub.exportHistory).toHaveBeenCalledWith(WALLET, 'json');
  });
});

describe('ProfileHeader extensions', () => {
  const user = { wallet: WALLET, displayName: 'Ada', avatar: 'bg-blue-500' };
  const stats = { followersCount: 10, followingCount: 5 };

  it('shows the reputation score when one is known', () => {
    render(<ProfileHeader user={user} socialStats={stats} reputationScore={72} />);

    expect(screen.getByTestId('reputation-score')).toHaveTextContent('72');
  });

  // "—" beats a fabricated zero on a profile that simply has not loaded.
  it('omits the badge when the score is unknown', () => {
    render(<ProfileHeader user={user} socialStats={stats} reputationScore={null} />);

    expect(screen.queryByTestId('reputation-badge')).not.toBeInTheDocument();
  });

  it('shows a zero score rather than hiding it', () => {
    render(<ProfileHeader user={user} socialStats={stats} reputationScore={0} />);

    expect(screen.getByTestId('reputation-score')).toHaveTextContent('0');
  });

  it('renders action controls beside the header', () => {
    render(
      <ProfileHeader
        user={user}
        socialStats={stats}
        actions={<button data-testid="custom-action">Follow</button>}
      />,
    );

    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
  });

  it('hides the edit button on someone else’s profile', () => {
    render(<ProfileHeader user={user} socialStats={stats} showEditButton={false} />);

    expect(screen.queryByTestId('edit-profile-button')).not.toBeInTheDocument();
  });

  it('still shows the edit button by default', () => {
    render(<ProfileHeader user={user} socialStats={stats} />);

    expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
  });
});
