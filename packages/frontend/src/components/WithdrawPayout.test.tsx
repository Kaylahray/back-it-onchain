import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { WithdrawPayout } from './WithdrawPayout';

const position = {
  userStake: 100,
  winningPoolTotal: 100,
  losingPoolTotal: 100,
  feeBps: 200,
};

describe('WithdrawPayout', () => {
  it('previews the claimable net amount', () => {
    render(<WithdrawPayout chain="base" position={position} />);
    // net = 200 - 2% = 196
    expect(screen.getByText('196.00 USDC')).toBeInTheDocument();
  });

  it('disables the button and warns when the call is not settled', () => {
    render(
      <WithdrawPayout chain="base" position={position} settled={false} />,
    );
    expect(screen.getByTestId('not-settled')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /withdraw payout/i }),
    ).toBeDisabled();
  });

  it('shows a success receipt with a BaseScan link after claiming', async () => {
    render(<WithdrawPayout chain="base" position={position} />);
    fireEvent.click(screen.getByRole('button', { name: /withdraw payout/i }));
    await waitFor(() =>
      expect(screen.getByTestId('receipt-success')).toBeInTheDocument(),
    );
    const link = screen.getByRole('link', { name: /view on basescan/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('basescan.org/tx/'));
    expect(screen.getByTestId('history-log')).toBeInTheDocument();
  });

  it('uses the Stellar explorer for the stellar chain', async () => {
    render(<WithdrawPayout chain="stellar" position={position} />);
    fireEvent.click(screen.getByRole('button', { name: /withdraw payout/i }));
    await waitFor(() =>
      expect(screen.getByTestId('receipt-success')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /view on stellar expert/i }),
    ).toHaveAttribute('href', expect.stringContaining('stellar.expert'));
  });
});
