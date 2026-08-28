'use client';

/**
 * Three-step call creation wizard (FE-02).
 *
 * The wizard owns the draft; the steps are controlled and stateless about it.
 * That is what makes autosave and restore possible without each step keeping a
 * second copy that could drift from what gets submitted.
 *
 * Forward navigation is gated per step, so a user cannot reach the stake step
 * with an unresolvable deadline and only discover it at submit — the point of
 * a wizard is that each step is complete before the next one.
 */

import * as React from 'react';
import { StepToken } from './StepToken';
import { StepThesis } from './StepThesis';
import { StepStake } from './StepStake';
import { describeCondition, serializeCondition, type Condition } from '../../lib/condition';
import {
  STEPS,
  clearDraft,
  emptyDraft,
  isStepValid,
  loadDraft,
  pinThesisToIpfs,
  saveDraft,
  stepErrors,
  type CallFormValues,
  type StepId,
} from '../../lib/validators/call';

export interface CreateWizardProps {
  /** Receives the fully validated call, with the thesis already pinned. */
  onSubmit?: (payload: {
    values: CallFormValues;
    ipfsCid: string;
    conditionJson: ReturnType<typeof serializeCondition>;
  }) => void | Promise<void>;
  /** Skip restoring a saved draft — used when creating a second call in a session. */
  startBlank?: boolean;
}

/** Progress indicator across the three steps. */
export function StepProgress({
  current,
  furthestValid,
  onJump,
}: {
  current: number;
  furthestValid: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol data-testid="wizard-progress" className="flex gap-2" aria-label="Progress">
      {STEPS.map((step, index) => {
        const state = index === current ? 'current' : index < current ? 'complete' : 'upcoming';

        return (
          <li key={step.id}>
            <button
              type="button"
              data-testid={`wizard-step-${step.id}`}
              data-state={state}
              aria-current={index === current ? 'step' : undefined}
              // Only allow jumping back, or forward to a step already reachable.
              disabled={index > furthestValid}
              onClick={() => onJump(index)}
              className={
                index === current
                  ? 'rounded bg-black px-3 py-1 text-sm text-white'
                  : 'rounded border px-3 py-1 text-sm disabled:opacity-40'
              }
            >
              {index + 1}. {step.title}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Optimistic summary of the call as it will appear once created. */
export function CallPreview({ values }: { values: Partial<CallFormValues> }) {
  const condition = values.condition as Condition | undefined;

  return (
    <aside data-testid="wizard-preview" className="rounded border p-3 text-sm">
      <h3 className="font-semibold">Preview</h3>
      <p data-testid="preview-title">{values.title || 'Untitled call'}</p>
      <p data-testid="preview-token" className="text-gray-600">
        {values.tokenSymbol || 'No token selected'}
      </p>
      <p data-testid="preview-condition" className="text-gray-600">
        {condition ? describeCondition(condition) : 'No condition set'}
      </p>
      <p data-testid="preview-stake" className="text-gray-600">
        {values.stakeAmount
          ? `${values.stakeAmount} ${values.stakeToken ?? ''} on ${(values.side ?? 'yes').toUpperCase()}`
          : 'No stake yet'}
      </p>
    </aside>
  );
}

export function CreateWizard({ onSubmit, startBlank }: CreateWizardProps) {
  const [values, setValues] = React.useState<Partial<CallFormValues>>(emptyDraft);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [restored, setRestored] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Restore once on mount. Reading storage during render would make the first
  // paint depend on a browser API that does not exist on the server.
  React.useEffect(() => {
    if (startBlank) return;

    const draft = loadDraft();

    if (draft) {
      setValues((current) => ({ ...current, ...draft }));
      setRestored(true);
    }
  }, [startBlank]);

  // Autosave. Every edit is persisted, so closing the tab mid-thesis does not
  // lose the work.
  React.useEffect(() => {
    saveDraft(values);
  }, [values]);

  const patch = React.useCallback((next: Partial<CallFormValues>) => {
    setValues((current) => ({ ...current, ...next }));
  }, []);

  const currentStep = STEPS[stepIndex];
  const errors = stepErrors(currentStep.id as StepId, values);
  const canAdvance = isStepValid(currentStep.id as StepId, values);

  // The furthest step reachable given what is currently filled in — used to
  // decide which progress buttons are clickable.
  const furthestValid = React.useMemo(() => {
    let index = 0;

    while (index < STEPS.length - 1 && isStepValid(STEPS[index].id as StepId, values)) {
      index += 1;
    }

    return index;
  }, [values]);

  const allValid = STEPS.every((step) => isStepValid(step.id as StepId, values));

  async function handleSubmit() {
    if (!allValid || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const complete = values as CallFormValues;
      const ipfsCid = await pinThesisToIpfs(complete.thesis);

      await onSubmit?.({
        values: complete,
        ipfsCid,
        conditionJson: serializeCondition(complete.condition),
      });

      // Only clear once the call is genuinely created — clearing before would
      // discard the draft on a failed submit.
      clearDraft();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create call');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="create-wizard" className="flex flex-col gap-4">
      <StepProgress current={stepIndex} furthestValid={furthestValid} onJump={setStepIndex} />

      {restored ? (
        <p data-testid="wizard-restored" className="text-xs text-gray-600">
          Restored your saved draft.{' '}
          <button
            type="button"
            data-testid="wizard-discard-draft"
            onClick={() => {
              clearDraft();
              setValues(emptyDraft());
              setStepIndex(0);
              setRestored(false);
            }}
            className="underline"
          >
            Start over
          </button>
        </p>
      ) : null}

      {currentStep.id === 'token' ? (
        <StepToken values={values} onChange={patch} errors={errors} />
      ) : null}
      {currentStep.id === 'thesis' ? (
        <StepThesis values={values} onChange={patch} errors={errors} />
      ) : null}
      {currentStep.id === 'stake' ? (
        <StepStake values={values} onChange={patch} errors={errors} />
      ) : null}

      <CallPreview values={values} />

      {submitError ? (
        <p role="alert" data-testid="wizard-error" className="text-sm text-red-600">
          {submitError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="wizard-back"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Back
        </button>

        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            data-testid="wizard-next"
            disabled={!canAdvance}
            onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}
            className="rounded bg-black px-3 py-1 text-white disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            data-testid="wizard-submit"
            disabled={!allValid || submitting}
            onClick={handleSubmit}
            className="rounded bg-black px-3 py-1 text-white disabled:opacity-40"
          >
            {submitting ? 'Creating…' : 'Create call'}
          </button>
        )}
      </div>
    </div>
  );
}

export default CreateWizard;
