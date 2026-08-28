'use client';

import * as React from 'react';
import { FEED_TABS, FEED_TAB_LABELS, type FeedTab } from '../hooks/useFeed';

export interface FeedTabsProps {
  value: FeedTab;
  onChange: (tab: FeedTab) => void;
  disabled?: boolean;
}

/** For You / Following / Trending selector (FE-06). */
export function FeedTabs({ value, onChange, disabled }: FeedTabsProps) {
  return (
    <div role="tablist" aria-label="Feed" data-testid="feed-tabs" className="flex gap-2">
      {FEED_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          data-testid={`feed-tab-${tab}`}
          disabled={disabled}
          onClick={() => onChange(tab)}
          className={
            value === tab
              ? 'rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white'
              : 'rounded-full border px-4 py-1.5 text-sm'
          }
        >
          {FEED_TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}

export default FeedTabs;
