'use client';

import * as React from 'react';
import { MIN_STAKE, type CallFormValues } from '../../lib/validators/call';

export interface StepStakeProps {
  values: Partial<CallFormValues>;
  onChange: (patch: Partial<CallFormValues>) => void;
  errors?: Partial<Record<string, string>>;
}

/** Step 3 — how much the creator is backing their own call with (FE-02). */
export function StepStake({ values, onChange, errors }: StepStakeProps) {
  const [amountDraft, setAmountDraft] = React.useState(
    values.stakeAmount === undefined ? '' : String(values.stakeAmount),
  );

  return (
    <section data-testid="step-stake" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Back your call</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-gray-600">Your side</legend>
        {(['yes', 'no'] as const).map((side) => (
          <label key={side} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="side"
              value={side}
              data-testid={`stake-side-${side}`}
              checked={values.side === side}
              onChange={() => onChange({ side })}
            />
            <span className="uppercase">{side}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Stake amount</span>
        <input
          type="number"
          min={MIN_STAKE}
          step="any"
          inputMode="decimal"
          aria-label="Stake amount"
          data-testid="stake-amount"
          value={amountDraft}
          onChange={(event) => {
            setAmountDraft(event.target.value);

            const parsed = Number.parseFloat(event.target.value);
            onChange({ stakeAmount: Number.isNaN(parsed) ? undefined : parsed });
          }}
          className="rounded border px-2 py-1"
        />
        {errors?.stakeAmount ? (
          <span role="alert" className="text-xs text-red-600">
            {errors.stakeAmount}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Stake token</span>
        <select
          aria-label="Stake token"
          data-testid="stake-token"
          value={values.stakeToken ?? 'USDC'}
          onChange={(event) => onChange({ stakeToken: event.target.value })}
          className="rounded border px-2 py-1"
        >
          <option value="USDC">USDC</option>
          <option value="XLM">XLM</option>
        </select>
      </label>
    </section>
  );
}

export default StepStake;
