import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { ConditionBuilder, defaultConditionFor } from './ConditionBuilder';
import type { Condition } from '../lib/condition';

/** Renders the builder as a controlled component with real state. */
function Harness({ initial }: { initial?: Condition }) {
  const [condition, setCondition] = React.useState<Condition>(
    initial ?? { kind: 'target_price', direction: 'above', price: 100 },
  );

  return <ConditionBuilder value={condition} onChange={setCondition} referencePrice={100} />;
}

describe('ConditionBuilder', () => {
  it('offers all three condition kinds', () => {
    render(<Harness />);

    expect(screen.getByTestId('condition-kind-target_price')).toBeInTheDocument();
    expect(screen.getByTestId('condition-kind-percent_move')).toBeInTheDocument();
    expect(screen.getByTestId('condition-kind-range')).toBeInTheDocument();
  });

  it('marks the active kind as the selected tab', () => {
    render(<Harness />);

    expect(screen.getByTestId('condition-kind-target_price')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('condition-kind-range')).toHaveAttribute('aria-selected', 'false');
  });

  it('switches fields when the kind changes', () => {
    render(<Harness />);

    expect(screen.getByTestId('target-price')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('condition-kind-range'));

    expect(screen.queryByTestId('target-price')).not.toBeInTheDocument();
    expect(screen.getByTestId('range-lower')).toBeInTheDocument();
    expect(screen.getByTestId('range-upper')).toBeInTheDocument();
  });

  it('shows the condition as a sentence', () => {
    render(<Harness />);

    expect(screen.getByTestId('condition-summary')).toHaveTextContent('above');
    expect(screen.getByTestId('condition-summary')).toHaveTextContent('100');
  });

  // The live preview is the feature: a condition is only checkable by trying a
  // price against it.
  it('previews the outcome for a probed price and updates as it changes', () => {
    render(<Harness />);

    // Probe seeds from the reference price (100), which is not above 100.
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('NO');

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '150' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('YES');

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '50' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('NO');
  });

  it('reflects an edited target price in the preview', () => {
    render(<Harness />);

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '150' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('YES');

    // Move the target above the probe; the outcome must flip.
    fireEvent.change(screen.getByTestId('target-price'), { target: { value: '200' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('NO');
  });

  it('previews a percent move against its implied threshold', () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId('condition-kind-percent_move'));

    // Default is +10% of 100 = 110.
    expect(screen.getByTestId('condition-summary')).toHaveTextContent('10%');

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '109' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('NO');

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '110' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('YES');
  });

  it('previews a range against both bounds', () => {
    render(<Harness initial={{ kind: 'range', lower: 90, upper: 110, inclusive: true }} />);

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '100' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('YES');

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '120' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('NO');
  });

  it('honours the inclusive toggle at a bound', () => {
    render(<Harness initial={{ kind: 'range', lower: 90, upper: 110, inclusive: true }} />);

    fireEvent.change(screen.getByTestId('condition-probe'), { target: { value: '110' } });
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('YES');

    fireEvent.click(screen.getByTestId('range-inclusive'));
    expect(screen.getByTestId('condition-outcome')).toHaveTextContent('NO');
  });

  // An invalid condition has no meaningful outcome, so the builder must not
  // show a confident YES or NO for one.
  it('withholds the preview while the condition is invalid', () => {
    render(<Harness initial={{ kind: 'range', lower: 90, upper: 110, inclusive: true }} />);

    fireEvent.change(screen.getByTestId('range-upper'), { target: { value: '50' } });

    expect(screen.getByTestId('condition-preview-invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('condition-outcome')).not.toBeInTheDocument();
  });

  it('shows a field-level message for an inverted range', () => {
    render(<Harness initial={{ kind: 'range', lower: 90, upper: 110, inclusive: true }} />);

    fireEvent.change(screen.getByTestId('range-upper'), { target: { value: '50' } });

    expect(screen.getByRole('alert')).toHaveTextContent('below the upper bound');
  });

  it('reports validity to the parent as it changes', () => {
    const onValidityChange = vi.fn();

    function ValidityHarness() {
      const [condition, setCondition] = React.useState<Condition>({
        kind: 'range',
        lower: 90,
        upper: 110,
        inclusive: true,
      });

      return (
        <ConditionBuilder
          value={condition}
          onChange={setCondition}
          onValidityChange={onValidityChange}
        />
      );
    }

    render(<ValidityHarness />);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);

    fireEvent.change(screen.getByTestId('range-upper'), { target: { value: '10' } });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it('lets a number field be cleared without fighting the keystroke', () => {
    render(<Harness />);

    const input = screen.getByTestId('target-price');

    fireEvent.change(input, { target: { value: '' } });

    // The field keeps what was typed rather than snapping back to a number.
    expect((input as HTMLInputElement).value).toBe('');
  });
});

describe('defaultConditionFor', () => {
  it('seeds each kind from the reference price', () => {
    expect(defaultConditionFor('target_price', 250)).toEqual({
      kind: 'target_price',
      direction: 'above',
      price: 250,
    });

    expect(defaultConditionFor('percent_move', 250)).toMatchObject({ basePrice: 250 });

    const range = defaultConditionFor('range', 100);
    expect(range).toMatchObject({ kind: 'range', lower: 90, upper: 110 });
  });

  // A missing or nonsensical reference must not produce a condition that
  // fails its own schema.
  it('falls back to a usable default for a bad reference price', () => {
    for (const reference of [0, -5, Number.NaN]) {
      const condition = defaultConditionFor('target_price', reference);

      expect(condition).toMatchObject({ price: 100 });
    }
  });
});
