import { useCallback, useState } from 'react';
import { explorerTxUrl } from '../lib/payout-utils';

export type WithdrawStatus = 'idle' | 'pending' | 'success' | 'error';

export interface WithdrawReceipt {
  txHash: string;
  explorerUrl: string;
  amount: number;
  chain: 'base' | 'stellar';
  at: number;
}

export interface UseWithdrawResult {
  status: WithdrawStatus;
  receipt: WithdrawReceipt | null;
  error: string | null;
  withdraw: (amount: number) => Promise<WithdrawReceipt>;
  reset: () => void;
}

function mockBaseTxHash(): string {
  const hex = '0123456789abcdef';
  let h = '0x';
  for (let i = 0; i < 64; i++) h += hex[Math.floor(Math.random() * 16)];
  return h;
}

/**
 * Mock Base (wagmi) `withdrawPayout` hook. Simulates a transaction lifecycle
 * (pending → success/error) and returns a receipt with a BaseScan link.
 * Frontend-only: no real contract call is made.
 */
export function useWithdrawBase(): UseWithdrawResult {
  const [status, setStatus] = useState<WithdrawStatus>('idle');
  const [receipt, setReceipt] = useState<WithdrawReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(async (amount: number) => {
    setStatus('pending');
    setError(null);
    setReceipt(null);
    try {
      if (amount <= 0) {
        throw new Error('Nothing to claim');
      }
      // Simulate wallet confirmation + inclusion latency.
      await new Promise((r) => setTimeout(r, 50));
      const txHash = mockBaseTxHash();
      const built: WithdrawReceipt = {
        txHash,
        explorerUrl: explorerTxUrl('base', txHash),
        amount,
        chain: 'base',
        at: Date.now(),
      };
      setReceipt(built);
      setStatus('success');
      return built;
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setReceipt(null);
    setError(null);
  }, []);

  return { status, receipt, error, withdraw, reset };
}
