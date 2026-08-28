import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { BadgeGallery } from './BadgeGallery';
import { BADGE_DEFINITIONS } from '../lib/badge-defs';

describe('BadgeGallery', () => {
  it('renders all badges by default with an unlocked summary', () => {
    render(<BadgeGallery progress={{ 'first-call': 1 }} />);
    expect(
      screen.getByText(`1 of ${BADGE_DEFINITIONS.length} unlocked`),
    ).toBeInTheDocument();
    expect(screen.getByTestId('badge-first-call')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
  });

  it('shows a locked badge as not unlocked with partial progress', () => {
    render(<BadgeGallery progress={{ 'whale-staker': 5000 }} />);
    const badge = screen.getByTestId('badge-whale-staker');
    expect(badge).toHaveAttribute('data-unlocked', 'false');
    expect(screen.getByTestId('badge-progress-whale-staker')).toHaveStyle({
      width: '50%',
    });
  });

  it('filters badges by rarity', () => {
    render(<BadgeGallery progress={{}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Legendary' }));
    // Only legendary badges remain — the common "First Call" should be gone.
    expect(screen.queryByTestId('badge-first-call')).not.toBeInTheDocument();
    expect(screen.getByTestId('badge-oracle')).toBeInTheDocument();
  });
});
