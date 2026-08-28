import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { FeedTabs } from './FeedTabs';
import { FeedList } from './FeedList';
import type { Call } from '../../lib/types';

function calls(count: number): Call[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    title: `Call ${index}`,
  }));
}

describe('FeedTabs', () => {
  it('renders all three tabs', () => {
    render(<FeedTabs value="for-you" onChange={vi.fn()} />);

    expect(screen.getByTestId('feed-tab-for-you')).toBeInTheDocument();
    expect(screen.getByTestId('feed-tab-following')).toBeInTheDocument();
    expect(screen.getByTestId('feed-tab-trending')).toBeInTheDocument();
  });

  it('marks the active tab as selected', () => {
    render(<FeedTabs value="trending" onChange={vi.fn()} />);

    expect(screen.getByTestId('feed-tab-trending')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('feed-tab-for-you')).toHaveAttribute('aria-selected', 'false');
  });

  it('reports a tab change', () => {
    const onChange = vi.fn();

    render(<FeedTabs value="for-you" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('feed-tab-following'));

    expect(onChange).toHaveBeenCalledWith('following');
  });
});

describe('FeedList states', () => {
  // "Loading", "empty" and "failed" mean different things to a reader.
  // Collapsing a failure into "No calls found" tells someone their feed is
  // empty when it never loaded.
  it('distinguishes an error from an empty feed', () => {
    render(<FeedList calls={[]} error={new Error('feed down')} />);

    expect(screen.getByTestId('error-state')).toHaveTextContent('feed down');
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('offers a retry when the feed failed', () => {
    const onRetry = vi.fn();

    render(<FeedList calls={[]} error={new Error('nope')} onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('feed-retry'));

    expect(onRetry).toHaveBeenCalled();
  });

  it('prefers the loading state over the error state', () => {
    render(<FeedList isLoading calls={[]} error={new Error('stale')} />);

    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument();
  });

  it('shows a refresh control only when refreshing is possible', () => {
    const { rerender } = render(<FeedList calls={calls(1)} />);
    expect(screen.queryByTestId('feed-refresh')).not.toBeInTheDocument();

    rerender(<FeedList calls={calls(1)} onRefresh={vi.fn()} />);
    expect(screen.getByTestId('feed-refresh')).toBeInTheDocument();
  });

  it('disables refresh while a refresh is in flight', () => {
    render(<FeedList calls={calls(1)} onRefresh={vi.fn()} isRefreshing />);

    expect(screen.getByTestId('feed-refresh')).toBeDisabled();
  });

  it('says when the feed is exhausted', () => {
    render(<FeedList calls={calls(3)} hasNextPage={false} />);

    expect(screen.getByTestId('feed-end')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-sentinel')).not.toBeInTheDocument();
  });

  it('renders a sentinel while more pages remain', () => {
    render(<FeedList calls={calls(3)} hasNextPage onLoadMore={vi.fn()} />);

    expect(screen.getByTestId('feed-sentinel')).toBeInTheDocument();
    expect(screen.queryByTestId('feed-end')).not.toBeInTheDocument();
  });

  it('shows a loading indicator while the next page arrives', () => {
    render(<FeedList calls={calls(3)} hasNextPage isFetchingNextPage />);

    expect(screen.getByTestId('feed-loading-more')).toBeInTheDocument();
  });

  it('requests more when the sentinel comes into view', () => {
    const onLoadMore = vi.fn();
    let trigger: (() => void) | undefined;

    class FakeObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {
        trigger = () =>
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [];
    }

    vi.stubGlobal('IntersectionObserver', FakeObserver);

    render(<FeedList calls={calls(3)} hasNextPage onLoadMore={onLoadMore} />);

    trigger?.();

    expect(onLoadMore).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  describe('virtualization', () => {
    // Off by default, so existing callers render an ordinary list.
    it('renders every row when not virtualized', () => {
      render(<FeedList calls={calls(50)} />);

      expect(screen.getAllByTestId('call-card')).toHaveLength(50);
      expect(screen.queryByTestId('feed-padding-bottom')).not.toBeInTheDocument();
    });

    it('renders only a window when virtualized', () => {
      render(<FeedList calls={calls(500)} virtualized itemHeight={100} />);

      const rendered = screen.getAllByTestId('call-card');

      expect(rendered.length).toBeGreaterThan(0);
      expect(rendered.length).toBeLessThan(500);
    });

    // The spacer keeps the scrollbar the size the full list would be.
    it('pads the space it did not render', () => {
      render(<FeedList calls={calls(500)} virtualized itemHeight={100} />);

      expect(screen.getByTestId('feed-padding-bottom')).toBeInTheDocument();
    });
  });

  it('uses a custom row renderer when given one', () => {
    render(<FeedList calls={calls(1)} renderCall={(call) => <span>custom {call.id}</span>} />);

    expect(screen.getByText('custom c0')).toBeInTheDocument();
  });
});
