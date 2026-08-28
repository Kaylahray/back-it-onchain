import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreateWizard } from './CreateWizard';
import { DRAFT_STORAGE_KEY, THESIS_MIN } from '../../lib/validators/call';

const future = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString().slice(0, 16);

function renderWizard(props: Parameters<typeof CreateWizard>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <CreateWizard {...props} />
    </QueryClientProvider>,
  );
}

/** A draft that satisfies every step, as it would be stored. */
function completeDraft() {
  return {
    tokenAddress: '0xabc',
    tokenSymbol: 'GOOD',
    title: 'Good token reaches a new high',
    thesis: 'x'.repeat(THESIS_MIN),
    condition: { kind: 'target_price', direction: 'above', price: 100 },
    deadline: future,
    stakeToken: 'USDC',
    stakeAmount: 25,
    side: 'yes',
  };
}

describe('CreateWizard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts on the token step', () => {
    renderWizard({ startBlank: true });

    expect(screen.getByTestId('step-token')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-token')).toHaveAttribute('aria-current', 'step');
  });

  it('shows all three steps in the progress indicator', () => {
    renderWizard({ startBlank: true });

    for (const step of ['token', 'thesis', 'stake']) {
      expect(screen.getByTestId(`wizard-step-${step}`)).toBeInTheDocument();
    }
  });

  // Gating is the reason a wizard exists: an incomplete step must not be
  // escapable, or the user discovers the problem at submit instead.
  it('blocks Next until the current step is valid', () => {
    renderWizard({ startBlank: true });

    expect(screen.getByTestId('wizard-next')).toBeDisabled();
  });

  it('disables Back on the first step', () => {
    renderWizard({ startBlank: true });

    expect(screen.getByTestId('wizard-back')).toBeDisabled();
  });

  it('advances through the steps once each is satisfied', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard();

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('step-thesis')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('step-stake')).toBeInTheDocument();

    // The last step submits rather than advancing.
    expect(screen.queryByTestId('wizard-next')).not.toBeInTheDocument();
    expect(screen.getByTestId('wizard-submit')).toBeInTheDocument();
  });

  it('goes back to the previous step', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard();

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('step-thesis')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wizard-back'));
    expect(screen.getByTestId('step-token')).toBeInTheDocument();
  });

  it('does not let the progress indicator jump past an incomplete step', () => {
    renderWizard({ startBlank: true });

    expect(screen.getByTestId('wizard-step-stake')).toBeDisabled();
  });

  // ── Draft persistence ───────────────────────────────────────────────

  it('restores a saved draft and says so', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard();

    await waitFor(() => expect(screen.getByTestId('wizard-restored')).toBeInTheDocument());
    expect(screen.getByTestId('step-token-selected')).toHaveTextContent('GOOD');
  });

  it('does not restore when asked to start blank', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard({ startBlank: true });

    expect(screen.queryByTestId('wizard-restored')).not.toBeInTheDocument();
  });

  it('discards the draft on request and returns to a blank form', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard();

    await waitFor(() => expect(screen.getByTestId('wizard-discard-draft')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('wizard-discard-draft'));

    expect(screen.queryByTestId('step-token-selected')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-restored')).not.toBeInTheDocument();
  });

  it('autosaves edits as they are made', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard();

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wizard-next'));

    fireEvent.change(screen.getByTestId('thesis-title'), {
      target: { value: 'An edited title for the call' },
    });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}');
      expect(stored.title).toBe('An edited title for the call');
    });
  });

  it('ignores an unreadable draft and starts blank', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, '{not json');

    renderWizard();

    expect(screen.queryByTestId('wizard-restored')).not.toBeInTheDocument();
    expect(screen.getByTestId('step-token')).toBeInTheDocument();
  });

  // ── Preview ─────────────────────────────────────────────────────────

  it('previews the call optimistically as it is filled in', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard();

    await waitFor(() => expect(screen.getByTestId('preview-token')).toHaveTextContent('GOOD'));
    expect(screen.getByTestId('preview-title')).toHaveTextContent('Good token reaches a new high');
    expect(screen.getByTestId('preview-condition')).toHaveTextContent('above');
    expect(screen.getByTestId('preview-stake')).toHaveTextContent('25 USDC on YES');
  });

  it('shows placeholder text in the preview before anything is entered', () => {
    renderWizard({ startBlank: true });

    expect(screen.getByTestId('preview-title')).toHaveTextContent('Untitled call');
    expect(screen.getByTestId('preview-token')).toHaveTextContent('No token selected');
  });

  // ── Submit ──────────────────────────────────────────────────────────

  it('pins the thesis and submits the serialized condition', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'bafy123' }),
    });

    const onSubmit = vi.fn();
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard({ onSubmit });

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));

    fireEvent.click(screen.getByTestId('wizard-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.ipfsCid).toBe('bafy123');
    expect(payload.conditionJson).toMatchObject({ kind: 'target_price' });
    expect(payload.values.tokenSymbol).toBe('GOOD');
  });

  it('clears the draft only after a successful submit', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'bafy123' }),
    });

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard({ onSubmit: vi.fn() });

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-submit'));

    await waitFor(() =>
      expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull(),
    );
  });

  // Losing a filled-in call because the pin failed would be the worst possible
  // moment to discard the draft.
  it('keeps the draft and reports the error when pinning fails', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    const onSubmit = vi.fn();
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(completeDraft()));

    renderWizard({ onSubmit });

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-submit'));

    await waitFor(() => expect(screen.getByTestId('wizard-error')).toBeInTheDocument());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();
  });
});
