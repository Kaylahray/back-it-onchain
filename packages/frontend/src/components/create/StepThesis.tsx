'use client';

import * as React from 'react';
import { ConditionBuilder } from '../ConditionBuilder';
import type { Condition } from '../../lib/condition';
import { THESIS_MAX, TITLE_MAX, type CallFormValues } from '../../lib/validators/call';

export interface StepThesisProps {
  values: Partial<CallFormValues>;
  onChange: (patch: Partial<CallFormValues>) => void;
  errors?: Partial<Record<string, string>>;
}

/** Step 2 — the claim, its condition, and its deadline (FE-02). */
export function StepThesis({ values, onChange, errors }: StepThesisProps) {
  const condition = (values.condition ?? {
    kind: 'target_price',
    direction: 'above',
    price: 100,
  }) as Condition;

  return (
    <section data-testid="step-thesis" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">State your thesis</h2>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Title</span>
        <input
          type="text"
          aria-label="Title"
          data-testid="thesis-title"
          maxLength={TITLE_MAX}
          value={values.title ?? ''}
          onChange={(event) => onChange({ title: event.target.value })}
          className="rounded border px-2 py-1"
        />
        {errors?.title ? (
          <span role="alert" className="text-xs text-red-600">
            {errors.title}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Thesis</span>
        <textarea
          aria-label="Thesis"
          data-testid="thesis-body"
          rows={6}
          maxLength={THESIS_MAX}
          value={values.thesis ?? ''}
          onChange={(event) => onChange({ thesis: event.target.value })}
          className="rounded border px-2 py-1"
        />
        <span data-testid="thesis-count" className="text-xs text-gray-500">
          {(values.thesis ?? '').length} / {THESIS_MAX}
        </span>
        {errors?.thesis ? (
          <span role="alert" className="text-xs text-red-600">
            {errors.thesis}
          </span>
        ) : null}
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-gray-600">Condition</span>
        <ConditionBuilder
          value={condition}
          onChange={(next) => onChange({ condition: next })}
        />
        {errors?.condition ? (
          <span role="alert" className="text-xs text-red-600">
            {errors.condition}
          </span>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Deadline</span>
        <input
          type="datetime-local"
          aria-label="Deadline"
          data-testid="thesis-deadline"
          value={values.deadline ?? ''}
          onChange={(event) => onChange({ deadline: event.target.value })}
          className="rounded border px-2 py-1"
        />
        {errors?.deadline ? (
          <span role="alert" className="text-xs text-red-600">
            {errors.deadline}
          </span>
        ) : null}
      </label>
    </section>
  );
}

export default StepThesis;
