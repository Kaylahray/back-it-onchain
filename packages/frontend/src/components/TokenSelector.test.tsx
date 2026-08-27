import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenSelector } from './TokenSelector';
import type { TokenSearchResult } from '../hooks/useTokenSearch';

function token(overrides: Partial<TokenSearchResult> = {}): TokenSearchResult {
  return {
    address: '0xgood',
    symbol: 'GOOD',
    name: 'Good Token',
    liquidityUsd: 500_000,
    volume24hUsd: 250_000,
    pairAgeHours: 800,
    isHoneypot: false,
    ...overrides,
  };
}

function renderSelector(props: Parameters<typeof TokenSelector>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <TokenSelector {...props} />
    </QueryClientProvider>,
  );
}

function mockResponse(body: unknown, ok = true, status = 200) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe('TokenSelector', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a search field', () => {
    renderSelector();

    expect(screen.getByTestId('token-search-input')).toBeInTheDocument();
  });

  it('shows a skeleton while a search is pending', async () => {
    mockResponse({ results: [token()] });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'good' } });

    // Debouncing counts as pending: the user has typed and results are coming.
    expect(screen.getByTestId('token-skeleton')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('token-results')).toBeInTheDocument());
    expect(screen.queryByTestId('token-skeleton')).not.toBeInTheDocument();
  });

  it('lists results with liquidity, volume and pair age', async () => {
    mockResponse({ results: [token()] });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'good' } });

    await waitFor(() => expect(screen.getByTestId('token-row-0xgood')).toBeInTheDocument());

    expect(screen.getByTestId('token-liquidity-0xgood')).toHaveTextContent('500.0K');
    expect(screen.getByTestId('token-volume-0xgood')).toHaveTextContent('250.0K');
    expect(screen.getByTestId('token-age-0xgood')).toHaveTextContent('33d old');
  });

  it('badges a healthy token green', async () => {
    mockResponse({ results: [token()] });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'good' } });

    await waitFor(() => expect(screen.getByTestId('token-safety-0xgood')).toBeInTheDocument());

    expect(screen.getByTestId('token-safety-0xgood')).toHaveAttribute('data-tone', 'green');
  });

  it('badges a thin token yellow and says why', async () => {
    mockResponse({ results: [token({ address: '0xthin', liquidityUsd: 100 })] });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'thin' } });

    await waitFor(() => expect(screen.getByTestId('token-safety-0xthin')).toBeInTheDocument());

    expect(screen.getByTestId('token-safety-0xthin')).toHaveAttribute('data-tone', 'yellow');
    expect(screen.getByTestId('token-warnings-0xthin')).toHaveTextContent('Low liquidity');
  });

  // The warning that matters most: a honeypot can look healthy on every other
  // metric, so it gets its own badge as well as a red safety rating.
  it('badges a honeypot red and flags it explicitly', async () => {
    mockResponse({
      results: [token({ address: '0xtrap', isHoneypot: true, liquidityUsd: 9_000_000 })],
    });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'trap' } });

    await waitFor(() => expect(screen.getByTestId('token-safety-0xtrap')).toBeInTheDocument());

    expect(screen.getByTestId('token-safety-0xtrap')).toHaveAttribute('data-tone', 'red');
    expect(screen.getByTestId('token-honeypot-0xtrap')).toBeInTheDocument();
    expect(screen.getByTestId('token-warnings-0xtrap')).toHaveTextContent('may not be able to sell');
  });

  it('shows an empty state when nothing matches', async () => {
    mockResponse({ results: [] });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'zzzz' } });

    await waitFor(() => expect(screen.getByTestId('token-search-empty')).toBeInTheDocument());
    expect(screen.getByTestId('token-search-empty')).toHaveTextContent('zzzz');
  });

  it('shows an error state when the search fails', async () => {
    mockResponse({}, false, 500);

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'boom' } });

    await waitFor(() => expect(screen.getByTestId('token-search-error')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('500');
  });

  it('says when results came from the DexScreener fallback', async () => {
    mockResponse({ results: [token()], usedFallback: true });

    renderSelector();
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'good' } });

    await waitFor(() => expect(screen.getByTestId('token-fallback-notice')).toBeInTheDocument());
    expect(screen.getByTestId('token-fallback-notice')).toHaveTextContent('DexScreener');
  });

  it('reports the chosen token to the parent', async () => {
    const onSelect = vi.fn();
    mockResponse({ results: [token()] });

    renderSelector({ onSelect });
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'good' } });

    await waitFor(() => expect(screen.getByTestId('token-row-0xgood')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('token-row-0xgood'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: '0xgood' }));
  });

  it('marks the selected token as pressed', async () => {
    mockResponse({ results: [token()] });

    renderSelector({ selectedAddress: '0xgood' });
    fireEvent.change(screen.getByTestId('token-search-input'), { target: { value: 'good' } });

    await waitFor(() => expect(screen.getByTestId('token-row-0xgood')).toBeInTheDocument());

    expect(screen.getByTestId('token-row-0xgood')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows nothing before the user has searched', () => {
    renderSelector();

    expect(screen.queryByTestId('token-results')).not.toBeInTheDocument();
    expect(screen.queryByTestId('token-search-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('token-skeleton')).not.toBeInTheDocument();
  });
});
