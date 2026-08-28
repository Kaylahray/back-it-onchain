'use client';

import * as React from 'react';
import { TokenSelector } from '../TokenSelector';
import type { TokenSearchResult } from '../../hooks/useTokenSearch';
import type { CallFormValues } from '../../lib/validators/call';

export interface StepTokenProps {
  values: Partial<CallFormValues>;
  onChange: (patch: Partial<CallFormValues>) => void;
  errors?: Partial<Record<string, string>>;
}

/** Step 1 — pick the token the call is about (FE-02). */
export function StepToken({ values, onChange, errors }: StepTokenProps) {
  const handleSelect = React.useCallback(
    (token: TokenSearchResult) => {
      onChange({ tokenAddress: token.address, tokenSymbol: token.symbol });
    },
    [onChange],
  );

  return (
    <section data-testid="step-token" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Choose a token</h2>

      <TokenSelector onSelect={handleSelect} selectedAddress={values.tokenAddress} />

      {values.tokenSymbol ? (
        <p data-testid="step-token-selected" className="text-sm text-gray-700">
          Selected: <strong>{values.tokenSymbol}</strong>
        </p>
      ) : null}

      {errors?.tokenAddress ? (
        <p role="alert" className="text-sm text-red-600">
          {errors.tokenAddress}
        </p>
      ) : null}
    </section>
  );
}

export default StepToken;
