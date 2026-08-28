import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { ExportButton } from './ExportButton';
import type { CallHistoryEntry } from '../lib/reputation';

const entries: CallHistoryEntry[] = [
  {
    id: 'c1',
    token: 'XLM',
    direction: 'up',
    stake: 100,
    pnl: 25,
    reputationDelta: 4,
    outcome: 'won',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-05T00:00:00.000Z',
  },
];

const NOW = () => '2026-08-21T09:00:00.000Z';

describe('ExportButton', () => {
  it('opens the format menu', () => {
    render(<ExportButton wallet="0xabc" entries={entries} download={vi.fn()} now={NOW} />);

    expect(screen.queryByTestId('export-menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('export-trigger'));

    expect(screen.getByTestId('export-csv')).toBeInTheDocument();
    expect(screen.getByTestId('export-json')).toBeInTheDocument();
  });

  it('downloads CSV with the right filename and mime type', async () => {
    const download = vi.fn();

    render(<ExportButton wallet="0xabc" entries={entries} download={download} now={NOW} />);

    fireEvent.click(screen.getByTestId('export-trigger'));
    fireEvent.click(screen.getByTestId('export-csv'));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));

    const [filename, content, mimeType] = download.mock.calls[0];

    expect(filename).toBe('backitonchain-history-0xabc-2026-08-21.csv');
    expect(mimeType).toContain('text/csv');
    expect(content.split('\n')[0]).toContain('id,token,direction');
    expect(content).toContain('c1,XLM,up,100,25,4,won');
  });

  it('downloads JSON', async () => {
    const download = vi.fn();

    render(<ExportButton wallet="0xabc" entries={entries} download={download} now={NOW} />);

    fireEvent.click(screen.getByTestId('export-trigger'));
    fireEvent.click(screen.getByTestId('export-json'));

    await waitFor(() => expect(download).toHaveBeenCalled());

    const [filename, content, mimeType] = download.mock.calls[0];

    expect(filename).toBe('backitonchain-history-0xabc-2026-08-21.json');
    expect(mimeType).toBe('application/json');
    expect(JSON.parse(content)).toEqual(entries);
  });

  it('closes the menu after a successful export', async () => {
    render(<ExportButton wallet="0xabc" entries={entries} download={vi.fn()} now={NOW} />);

    fireEvent.click(screen.getByTestId('export-trigger'));
    fireEvent.click(screen.getByTestId('export-csv'));

    await waitFor(() => expect(screen.queryByTestId('export-menu')).not.toBeInTheDocument());
  });

  // The issue specifies the button hits an existing backend endpoint; local
  // serialization is only the fallback.
  it('prefers the backend export when one is supplied', async () => {
    const fetchExport = vi.fn().mockResolvedValue('id,token\nc9,BTC');
    const download = vi.fn();

    render(
      <ExportButton
        wallet="0xabc"
        entries={entries}
        fetchExport={fetchExport}
        download={download}
        now={NOW}
      />,
    );

    fireEvent.click(screen.getByTestId('export-trigger'));
    fireEvent.click(screen.getByTestId('export-csv'));

    await waitFor(() => expect(download).toHaveBeenCalled());

    expect(fetchExport).toHaveBeenCalledWith('csv');
    expect(download.mock.calls[0][1]).toBe('id,token\nc9,BTC');
  });

  it('reports a failed export and leaves the menu open to retry', async () => {
    const fetchExport = vi.fn().mockRejectedValue(new Error('Export failed (503)'));
    const download = vi.fn();

    render(
      <ExportButton wallet="0xabc" fetchExport={fetchExport} download={download} now={NOW} />,
    );

    fireEvent.click(screen.getByTestId('export-trigger'));
    fireEvent.click(screen.getByTestId('export-csv'));

    await waitFor(() =>
      expect(screen.getByTestId('export-error')).toHaveTextContent('Export failed (503)'),
    );
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByTestId('export-menu')).toBeInTheDocument();
  });

  it('clears a previous error on a later attempt', async () => {
    const fetchExport = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    render(<ExportButton wallet="0xabc" fetchExport={fetchExport} download={vi.fn()} now={NOW} />);

    fireEvent.click(screen.getByTestId('export-trigger'));
    fireEvent.click(screen.getByTestId('export-csv'));
    await waitFor(() => expect(screen.getByTestId('export-error')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('export-json'));

    await waitFor(() => expect(screen.queryByTestId('export-error')).not.toBeInTheDocument());
  });

  // An empty CSV is a file of headers — a download that looks like it worked
  // and contains nothing.
  it('disables the trigger when there is nothing to export', () => {
    render(<ExportButton wallet="0xabc" entries={[]} download={vi.fn()} />);

    expect(screen.getByTestId('export-trigger')).toBeDisabled();
  });

  it('stays enabled with no rows when the backend can supply them', () => {
    render(<ExportButton wallet="0xabc" entries={[]} fetchExport={vi.fn()} />);

    expect(screen.getByTestId('export-trigger')).toBeEnabled();
  });

  it('honours the disabled prop', () => {
    render(<ExportButton wallet="0xabc" entries={entries} disabled />);

    expect(screen.getByTestId('export-trigger')).toBeDisabled();
  });
});
