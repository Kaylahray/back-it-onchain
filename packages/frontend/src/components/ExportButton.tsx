'use client';

import * as React from 'react';
import {
  MIME_TYPES,
  exportFilename,
  serializeHistory,
  type CallHistoryEntry,
  type ExportFormat,
} from '../lib/reputation';

export interface ExportButtonProps {
  wallet: string;
  /** Rows to serialize locally when no `fetchExport` is supplied. */
  entries?: CallHistoryEntry[];
  /** Ask the backend for the export instead of building it from `entries`. */
  fetchExport?: (format: ExportFormat) => Promise<string>;
  /** Seam for tests; the default writes a real file to the user's disk. */
  download?: (filename: string, content: string, mimeType: string) => void;
  now?: () => string;
  label?: string;
  disabled?: boolean;
}

export function defaultDownload(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately is safe: the download has already been handed off.
  URL.revokeObjectURL(url);
}

const FORMATS: ExportFormat[] = ['csv', 'json'];

/** CSV/JSON download trigger for a wallet's call history (FE-07). */
export function ExportButton({
  wallet,
  entries = [],
  fetchExport,
  download = defaultDownload,
  now = () => new Date().toISOString(),
  label = 'Export',
  disabled = false,
}: ExportButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<ExportFormat | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);

    try {
      const content = fetchExport
        ? await fetchExport(format)
        : serializeHistory(entries, format);

      download(exportFilename(wallet, format, now()), content, MIME_TYPES[format]);
      setOpen(false);
    } catch (cause) {
      // The menu stays open so the failed format can be retried in place.
      setError(cause instanceof Error ? cause.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const nothingToExport = !fetchExport && entries.length === 0;

  return (
    <div className="relative inline-block" data-testid="export-button">
      <button
        type="button"
        data-testid="export-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || nothingToExport}
        onClick={() => setOpen((current) => !current)}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Export format"
          data-testid="export-menu"
          className="absolute right-0 z-10 mt-2 w-40 rounded border border-border bg-background shadow"
        >
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              data-testid={`export-${format}`}
              disabled={busy !== null}
              onClick={() => handleExport(format)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
            >
              {busy === format ? 'Preparing…' : `Download ${format.toUpperCase()}`}
            </button>
          ))}

          {error ? (
            <p role="alert" data-testid="export-error" className="px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ExportButton;
