'use client';

/**
 * Condition builder (FE-04).
 *
 * Controlled: the parent owns the condition, so the wizard can persist a
 * draft and restore it without this component holding a second copy that
 * could drift.
 *
 * The live preview is the point of the component. A condition is a claim about
 * the future, and the only way to be sure it says what you meant is to try a
 * price against it — so the builder shows the sentence form and lets you probe
 * an arbitrary price for its YES/NO outcome as you type.
 */

import * as React from 'react';
import {
  CONDITION_KINDS,
  CONDITION_KIND_LABELS,
  conditionSchema,
  conditionThresholds,
  describeCondition,
  evaluateCondition,
  type Condition,
  type ConditionKind,
} from '../lib/condition';

export interface ConditionBuilderProps {
  value: Condition;
  onChange: (next: Condition) => void;
  /** Reported on every change so a parent can block submission. */
  onValidityChange?: (valid: boolean) => void;
  /** Seeds the percent-move reference and the preview probe. */
  referencePrice?: number;
  disabled?: boolean;
}

/**
 * Trim binary floating-point noise from a derived price.
 *
 * `100 * 1.1` is `110.00000000000001`, which would be seeded straight into a
 * visible input. Eight decimals is past any price precision this app shows and
 * well inside what a double represents exactly for these magnitudes.
 */
function roundPrice(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/** A blank condition of the given kind, seeded from a reference price. */
export function defaultConditionFor(kind: ConditionKind, referencePrice = 100): Condition {
  const base = Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : 100;

  switch (kind) {
    case 'target_price':
      return { kind: 'target_price', direction: 'above', price: roundPrice(base) };
    case 'percent_move':
      return { kind: 'percent_move', direction: 'up', percent: 10, basePrice: roundPrice(base) };
    case 'range':
      return {
        kind: 'range',
        lower: roundPrice(base * 0.9),
        upper: roundPrice(base * 1.1),
        inclusive: true,
      };
  }
}

/** First validation message for a field, if any. */
function errorFor(condition: Condition, field: string): string | undefined {
  const result = conditionSchema.safeParse(condition);

  if (result.success) return undefined;

  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

/**
 * A number input that keeps what the user typed.
 *
 * Storing the raw string matters: binding an input straight to a number makes
 * "0." or an empty field impossible to type through, because each keystroke is
 * parsed and written back.
 */
function NumberField({
  label,
  value,
  onChange,
  error,
  disabled,
  testId,
  step = 'any',
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  error?: string;
  disabled?: boolean;
  testId: string;
  step?: string;
}) {
  const [draft, setDraft] = React.useState(String(value));

  // Follow the parent when it changes the value from outside (a kind switch,
  // or a restored draft) without fighting the user mid-keystroke.
  React.useEffect(() => {
    setDraft((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <input
        type="number"
        step={step}
        inputMode="decimal"
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);

          const parsed = Number.parseFloat(event.target.value);
          onChange(Number.isNaN(parsed) ? Number.NaN : parsed);
        }}
        className="rounded border px-2 py-1"
      />
      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function TargetPriceFields({
  value,
  onChange,
  disabled,
}: {
  value: Extract<Condition, { kind: 'target_price' }>;
  onChange: (next: Condition) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Direction</span>
        <select
          aria-label="Direction"
          data-testid="target-direction"
          disabled={disabled}
          value={value.direction}
          onChange={(event) =>
            onChange({ ...value, direction: event.target.value as 'above' | 'below' })
          }
          className="rounded border px-2 py-1"
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
      </label>

      <NumberField
        label="Target price"
        testId="target-price"
        disabled={disabled}
        value={value.price}
        error={errorFor(value, 'price')}
        onChange={(price) => onChange({ ...value, price })}
      />
    </div>
  );
}

export function PercentMoveFields({
  value,
  onChange,
  disabled,
}: {
  value: Extract<Condition, { kind: 'percent_move' }>;
  onChange: (next: Condition) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Direction</span>
        <select
          aria-label="Direction"
          data-testid="percent-direction"
          disabled={disabled}
          value={value.direction}
          onChange={(event) => onChange({ ...value, direction: event.target.value as 'up' | 'down' })}
          className="rounded border px-2 py-1"
        >
          <option value="up">Up</option>
          <option value="down">Down</option>
        </select>
      </label>

      <NumberField
        label="Percent"
        testId="percent-amount"
        disabled={disabled}
        value={value.percent}
        error={errorFor(value, 'percent')}
        onChange={(percent) => onChange({ ...value, percent })}
      />

      <NumberField
        label="Reference price"
        testId="percent-base"
        disabled={disabled}
        value={value.basePrice}
        error={errorFor(value, 'basePrice')}
        onChange={(basePrice) => onChange({ ...value, basePrice })}
      />
    </div>
  );
}

export function RangeFields({
  value,
  onChange,
  disabled,
}: {
  value: Extract<Condition, { kind: 'range' }>;
  onChange: (next: Condition) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <NumberField
        label="Lower bound"
        testId="range-lower"
        disabled={disabled}
        value={value.lower}
        error={errorFor(value, 'lower')}
        onChange={(lower) => onChange({ ...value, lower })}
      />

      <NumberField
        label="Upper bound"
        testId="range-upper"
        disabled={disabled}
        value={value.upper}
        error={errorFor(value, 'upper')}
        onChange={(upper) => onChange({ ...value, upper })}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          aria-label="Include bounds"
          data-testid="range-inclusive"
          disabled={disabled}
          checked={value.inclusive}
          onChange={(event) => onChange({ ...value, inclusive: event.target.checked })}
        />
        <span className="text-gray-600">Include bounds</span>
      </label>
    </div>
  );
}

/**
 * Sentence form plus a probe: type a price, see the outcome.
 */
export function ConditionPreview({
  condition,
  probePrice,
  onProbeChange,
}: {
  condition: Condition;
  probePrice: number;
  onProbeChange: (next: number) => void;
}) {
  const valid = conditionSchema.safeParse(condition).success;

  if (!valid) {
    return (
      <p data-testid="condition-preview-invalid" className="text-sm text-gray-500">
        Finish the condition to see a preview.
      </p>
    );
  }

  const outcome = evaluateCondition(condition, probePrice);

  return (
    <div className="flex flex-col gap-2">
      <p data-testid="condition-summary" className="text-sm font-medium">
        {describeCondition(condition)}
      </p>

      <p data-testid="condition-thresholds" className="text-xs text-gray-500">
        Resolves at {conditionThresholds(condition).map((t) => `$${t}`).join(' – ')}
      </p>

      <div className="flex items-end gap-3">
        <NumberField
          label="If the price were"
          testId="condition-probe"
          value={probePrice}
          onChange={onProbeChange}
        />

        <span
          data-testid="condition-outcome"
          className={
            outcome
              ? 'rounded bg-green-100 px-2 py-1 text-sm font-semibold text-green-800'
              : 'rounded bg-red-100 px-2 py-1 text-sm font-semibold text-red-800'
          }
        >
          {outcome ? 'YES' : 'NO'}
        </span>
      </div>
    </div>
  );
}

export function ConditionBuilder({
  value,
  onChange,
  onValidityChange,
  referencePrice = 100,
  disabled,
}: ConditionBuilderProps) {
  const [probePrice, setProbePrice] = React.useState(referencePrice);

  const valid = conditionSchema.safeParse(value).success;

  React.useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  return (
    <section className="flex flex-col gap-4" data-testid="condition-builder">
      <div role="tablist" aria-label="Condition type" className="flex gap-2">
        {CONDITION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={value.kind === kind}
            data-testid={`condition-kind-${kind}`}
            disabled={disabled}
            onClick={() => onChange(defaultConditionFor(kind, referencePrice))}
            className={
              value.kind === kind
                ? 'rounded bg-black px-3 py-1 text-sm text-white'
                : 'rounded border px-3 py-1 text-sm'
            }
          >
            {CONDITION_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      {value.kind === 'target_price' ? (
        <TargetPriceFields value={value} onChange={onChange} disabled={disabled} />
      ) : null}
      {value.kind === 'percent_move' ? (
        <PercentMoveFields value={value} onChange={onChange} disabled={disabled} />
      ) : null}
      {value.kind === 'range' ? (
        <RangeFields value={value} onChange={onChange} disabled={disabled} />
      ) : null}

      <ConditionPreview
        condition={value}
        probePrice={probePrice}
        onProbeChange={setProbePrice}
      />
    </section>
  );
}

export default ConditionBuilder;
