import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { ReputationTimeline, type ChartFactory } from './ReputationTimeline';
import type { CallHistoryEntry, TimelinePoint } from '../lib/reputation';

function entry(overrides: Partial<CallHistoryEntry> = {}): CallHistoryEntry {
  return {
    id: 'c1',
    token: 'XLM',
    direction: 'up',
    stake: 100,
    pnl: 0,
    reputationDelta: 0,
    outcome: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Stands in for lightweight-charts, which needs a canvas jsdom does not have. */
function fakeChart() {
  const setData = vi.fn();
  const fitContent = vi.fn();
  const remove = vi.fn();
  const containers: HTMLElement[] = [];
  let created = 0;

  const factory: ChartFactory = (container) => {
    created += 1;
    containers.push(container);

    return {
      addSeries: () => ({ setData }),
      timeScale: () => ({ fitContent }),
      remove,
    };
  };

  return {
    factory,
    setData,
    fitContent,
    remove,
    containers,
    get created() {
      return created;
    },
    lastData(): TimelinePoint[] {
      return setData.mock.calls.at(-1)?.[0] ?? [];
    },
  };
}

const history: CallHistoryEntry[] = [
  entry({
    id: 'a',
    outcome: 'won',
    pnl: 50,
    reputationDelta: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-02T00:00:00.000Z',
  }),
  entry({
    id: 'b',
    token: 'BTC',
    direction: 'down',
    outcome: 'lost',
    pnl: -20,
    reputationDelta: -3,
    createdAt: '2026-01-03T00:00:00.000Z',
    resolvedAt: '2026-01-04T00:00:00.000Z',
  }),
];

describe('ReputationTimeline', () => {
  it('renders the summary from the history', () => {
    const chart = fakeChart();

    render(
      <ReputationTimeline entries={history} currentScore={72} chartFactory={chart.factory} />,
    );

    expect(screen.getByTestId('summary-score')).toHaveTextContent('72');
    expect(screen.getByTestId('summary-win-rate')).toHaveTextContent('50%');
    expect(screen.getByTestId('summary-pnl')).toHaveTextContent('+$30.00');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('2');
  });

  it('shows a negative net PnL with its sign', () => {
    const chart = fakeChart();

    render(
      <ReputationTimeline
        entries={[entry({ outcome: 'lost', pnl: -12.5 })]}
        chartFactory={chart.factory}
      />,
    );

    expect(screen.getByTestId('summary-pnl')).toHaveTextContent('-$12.50');
  });

  it('creates the chart inside its container and feeds it the score series', () => {
    const chart = fakeChart();

    render(
      <ReputationTimeline entries={history} startingScore={50} chartFactory={chart.factory} />,
    );

    expect(chart.created).toBe(1);
    expect(chart.containers[0]).toBe(screen.getByTestId('reputation-chart'));
    expect(chart.lastData()).toEqual([
      { time: '2026-01-02', value: 55 },
      { time: '2026-01-04', value: 52 },
    ]);
  });

  // An unfitted scale opens on an arbitrary window, which usually reads as an
  // empty chart.
  it('fits the time scale once there is data', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={history} chartFactory={chart.factory} />);

    expect(chart.fitContent).toHaveBeenCalled();
  });

  it('does not fit an empty series', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={[]} chartFactory={chart.factory} />);

    expect(chart.fitContent).not.toHaveBeenCalled();
  });

  it('swaps to the PnL series when the metric changes', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={history} chartFactory={chart.factory} />);

    fireEvent.click(screen.getByTestId('timeline-metric-pnl'));

    expect(chart.lastData()).toEqual([
      { time: '2026-01-02', value: 50 },
      { time: '2026-01-04', value: 30 },
    ]);
  });

  // Rebuilding the chart on every toggle throws away the user's pan and zoom.
  it('reuses the chart across metric changes', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={history} chartFactory={chart.factory} />);

    fireEvent.click(screen.getByTestId('timeline-metric-pnl'));
    fireEvent.click(screen.getByTestId('timeline-metric-reputation'));

    expect(chart.created).toBe(1);
    expect(chart.remove).not.toHaveBeenCalled();
  });

  it('marks the active metric for assistive technology', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={history} chartFactory={chart.factory} />);

    expect(screen.getByTestId('timeline-metric-reputation')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByTestId('timeline-metric-pnl'));

    expect(screen.getByTestId('timeline-metric-pnl')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports metric changes to a controlling parent', () => {
    const chart = fakeChart();
    const onMetricChange = vi.fn();

    render(
      <ReputationTimeline
        entries={history}
        metric="reputation"
        onMetricChange={onMetricChange}
        chartFactory={chart.factory}
      />,
    );

    fireEvent.click(screen.getByTestId('timeline-metric-pnl'));

    expect(onMetricChange).toHaveBeenCalledWith('pnl');
    // Controlled: the parent decides, so the chart still shows the score.
    expect(screen.getByTestId('timeline-metric-reputation')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // A chart left behind on unmount keeps its canvas and resize listeners.
  it('disposes the chart on unmount', () => {
    const chart = fakeChart();

    const { unmount } = render(
      <ReputationTimeline entries={history} chartFactory={chart.factory} />,
    );

    unmount();

    expect(chart.remove).toHaveBeenCalledTimes(1);
  });

  it('lists the call history newest first', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={history} chartFactory={chart.factory} />);

    const rows = screen.getByTestId('timeline-history').querySelectorAll('li');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-testid', 'timeline-entry-b');
    expect(screen.getByTestId('timeline-pnl-a')).toHaveTextContent('+$50.00');
    expect(screen.getByTestId('timeline-pnl-b')).toHaveTextContent('-$20.00');
  });

  it('shows an empty state with no history', () => {
    const chart = fakeChart();

    render(<ReputationTimeline entries={[]} chartFactory={chart.factory} />);

    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-history')).not.toBeInTheDocument();
  });

  it('updates the series when new history arrives', () => {
    const chart = fakeChart();

    const { rerender } = render(
      <ReputationTimeline entries={[]} chartFactory={chart.factory} />,
    );

    rerender(<ReputationTimeline entries={history} chartFactory={chart.factory} />);

    expect(chart.lastData()).toHaveLength(2);
  });
});
