import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { PoolBar } from './PoolBar';
import { ParticipantList } from './ParticipantList';
import { CallDetailHeader } from './CallDetailHeader';
import { serializeCondition } from '../lib/condition';
import type { Participant } from '../hooks/useCallLive';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    wallet: '0x1234567890abcdef',
    side: 'yes',
    amount: 100,
    joinedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('PoolBar', () => {
  it('renders the split proportionally', () => {
    render(<PoolBar pool={{ yesTotal: 750, noTotal: 250 }} />);

    expect(screen.getByTestId('pool-bar-yes')).toHaveStyle({ width: '75%' });
    expect(screen.getByTestId('pool-bar-no')).toHaveStyle({ width: '25%' });
  });

  it('states the split in text as well as bar width', () => {
    render(<PoolBar pool={{ yesTotal: 750, noTotal: 250 }} />);

    expect(screen.getByTestId('pool-yes-label')).toHaveTextContent('75.0%');
    expect(screen.getByTestId('pool-no-label')).toHaveTextContent('25.0%');
  });

  // A bar with no text is unreadable to a screen reader.
  it('exposes the split to assistive technology', () => {
    render(<PoolBar pool={{ yesTotal: 750, noTotal: 250 }} />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '75');
    expect(meter).toHaveAttribute('aria-valuetext', '75% YES, 25% NO');
  });

  it('shows an even split and says so when nothing is staked', () => {
    render(<PoolBar pool={{ yesTotal: 0, noTotal: 0 }} />);

    expect(screen.getByTestId('pool-bar-yes')).toHaveStyle({ width: '50%' });
    expect(screen.getByTestId('pool-total')).toHaveTextContent('No stakes yet');
  });

  it('abbreviates large totals', () => {
    render(<PoolBar pool={{ yesTotal: 1_500_000, noTotal: 500_000 }} />);

    expect(screen.getByTestId('pool-total')).toHaveTextContent('2.0M staked');
  });

  it('shows a skeleton while loading', () => {
    render(<PoolBar pool={{ yesTotal: 0, noTotal: 0 }} loading />);

    expect(screen.getByTestId('pool-bar-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('pool-bar')).not.toBeInTheDocument();
  });
});

describe('ParticipantList', () => {
  it('lists participants with their side and amount', () => {
    render(<ParticipantList participants={[participant(), participant({ id: 'p2', side: 'no' })]} />);

    expect(screen.getByTestId('participant-p1')).toHaveTextContent('YES');
    expect(screen.getByTestId('participant-p2')).toHaveTextContent('NO');
    expect(screen.getByTestId('participant-p1')).toHaveTextContent('100');
  });

  it('shortens a long wallet address', () => {
    render(<ParticipantList participants={[participant()]} />);

    expect(screen.getByTestId('participant-p1')).toHaveTextContent('0x1234…cdef');
  });

  it('prefers a display name when there is one', () => {
    render(<ParticipantList participants={[participant({ displayName: 'alice.eth' })]} />);

    expect(screen.getByTestId('participant-p1')).toHaveTextContent('alice.eth');
  });

  it('shows an empty state', () => {
    render(<ParticipantList participants={[]} />);

    expect(screen.getByTestId('participant-empty')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    render(<ParticipantList participants={[]} loading />);

    expect(screen.getByTestId('participant-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('participant-empty')).not.toBeInTheDocument();
  });

  it('truncates a long list and expands on request', () => {
    const many = Array.from({ length: 8 }, (_, index) => participant({ id: `p${index}` }));

    render(<ParticipantList participants={many} previewCount={5} />);

    expect(screen.getAllByTestId(/^participant-p/)).toHaveLength(5);
    expect(screen.getByTestId('participant-show-all')).toHaveTextContent('Show 3 more');

    fireEvent.click(screen.getByTestId('participant-show-all'));

    expect(screen.getAllByTestId(/^participant-p/)).toHaveLength(8);
    expect(screen.queryByTestId('participant-show-all')).not.toBeInTheDocument();
  });
});

describe('CallDetailHeader', () => {
  const conditionJson = serializeCondition({
    kind: 'target_price',
    direction: 'above',
    price: 100,
  });

  it('renders the title, creator and condition', () => {
    render(
      <CallDetailHeader
        title="Good token reaches a new high"
        creatorName="alice.eth"
        conditionJson={conditionJson}
      />,
    );

    expect(screen.getByTestId('call-title')).toHaveTextContent('Good token reaches a new high');
    expect(screen.getByTestId('call-creator')).toHaveTextContent('alice.eth');
    expect(screen.getByTestId('call-condition')).toHaveTextContent('above');
  });

  it('renders the thesis when it resolved', () => {
    render(<CallDetailHeader thesis="Because the chart says so." />);

    expect(screen.getByTestId('call-thesis')).toHaveTextContent('Because the chart says so.');
  });

  // A thesis that failed to load should say so and name the CID, rather than
  // rendering an empty section that looks like the author wrote nothing.
  it('explains an unresolved thesis and names the CID', () => {
    render(<CallDetailHeader ipfsCid="bafy123" />);

    expect(screen.getByTestId('call-thesis-unavailable')).toHaveTextContent('bafy123');
  });

  it('distinguishes a missing thesis from an unresolved one', () => {
    render(<CallDetailHeader />);

    expect(screen.getByTestId('call-thesis-unavailable')).toHaveTextContent('No thesis');
  });

  it('falls back to a shortened wallet when there is no display name', () => {
    render(<CallDetailHeader creatorWallet="0x1234567890abcdef" />);

    expect(screen.getByTestId('call-creator')).toHaveTextContent('0x1234…cdef');
  });

  it('says so when the condition cannot be read', () => {
    render(<CallDetailHeader conditionJson={{ kind: 'nonsense' }} />);

    expect(screen.getByTestId('call-condition')).toHaveTextContent('unavailable');
  });

  it('shows a live badge only when live', () => {
    const { rerender } = render(<CallDetailHeader live />);
    expect(screen.getByTestId('call-live-badge')).toBeInTheDocument();

    rerender(<CallDetailHeader live={false} />);
    expect(screen.queryByTestId('call-live-badge')).not.toBeInTheDocument();
  });

  it('includes the evidence panel placeholder', () => {
    render(<CallDetailHeader />);

    expect(screen.getByTestId('evidence-panel')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    render(<CallDetailHeader loading />);

    expect(screen.getByTestId('call-header-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('call-header')).not.toBeInTheDocument();
  });
});
