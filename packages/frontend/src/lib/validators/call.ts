/**
 * Call creation schema and draft persistence (FE-02).
 *
 * The wizard has three steps and each one owns a slice of the schema, so a
 * step can be validated on its own before the user is allowed forward. The
 * full schema is the composition of the three — there is deliberately only one
 * definition of each field, so a rule cannot pass step validation and then
 * fail at submit.
 */

import { z } from 'zod';
import { conditionSchema, type Condition } from '../condition';

export const TITLE_MIN = 8;
export const TITLE_MAX = 120;
export const THESIS_MIN = 40;
export const THESIS_MAX = 5_000;
export const MIN_STAKE = 1;

/** Where an in-progress call is kept between visits. */
export const DRAFT_STORAGE_KEY = 'backit:call-draft:v1';

/** Step 1 — which token the call is about. */
export const tokenStepSchema = z.object({
  tokenAddress: z.string().min(1, 'Select a token'),
  tokenSymbol: z.string().min(1, 'Select a token'),
});

/** Step 2 — the claim being made, and by when. */
export const thesisStepSchema = z.object({
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters`)
    .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`),
  thesis: z
    .string()
    .trim()
    .min(THESIS_MIN, `Thesis must be at least ${THESIS_MIN} characters`)
    .max(THESIS_MAX, `Thesis must be at most ${THESIS_MAX} characters`),
  condition: conditionSchema,
  deadline: z
    .string()
    .min(1, 'Deadline is required')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Deadline must be a valid date')
    // A deadline in the past cannot be resolved, so it is rejected at entry
    // rather than becoming a call nobody can settle.
    .refine((value) => Date.parse(value) > Date.now(), 'Deadline must be in the future'),
});

/** Step 3 — the creator's own stake. */
export const stakeStepSchema = z.object({
  stakeToken: z.string().min(1, 'Stake token is required'),
  stakeAmount: z
    .number({ message: 'Stake amount is required' })
    .positive('Stake must be greater than zero')
    .min(MIN_STAKE, `Stake must be at least ${MIN_STAKE}`),
  side: z.enum(['yes', 'no']),
});

export const callFormSchema = tokenStepSchema
  .merge(thesisStepSchema)
  .merge(stakeStepSchema);

export type CallFormValues = z.infer<typeof callFormSchema>;
export type TokenStepValues = z.infer<typeof tokenStepSchema>;
export type ThesisStepValues = z.infer<typeof thesisStepSchema>;
export type StakeStepValues = z.infer<typeof stakeStepSchema>;

export const STEPS = [
  { id: 'token', title: 'Token', schema: tokenStepSchema },
  { id: 'thesis', title: 'Thesis', schema: thesisStepSchema },
  { id: 'stake', title: 'Stake', schema: stakeStepSchema },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

/** Fields belonging to each step, for per-step validation. */
export const STEP_FIELDS: Record<StepId, (keyof CallFormValues)[]> = {
  token: ['tokenAddress', 'tokenSymbol'],
  thesis: ['title', 'thesis', 'condition', 'deadline'],
  stake: ['stakeToken', 'stakeAmount', 'side'],
};

/** Whether the slice of `values` owned by `step` is complete and valid. */
export function isStepValid(step: StepId, values: Partial<CallFormValues>): boolean {
  const schema = STEPS.find((entry) => entry.id === step)?.schema;

  if (!schema) return false;

  return schema.safeParse(values).success;
}

/** First message for each invalid field in a step, keyed by field name. */
export function stepErrors(
  step: StepId,
  values: Partial<CallFormValues>,
): Partial<Record<string, string>> {
  const schema = STEPS.find((entry) => entry.id === step)?.schema;

  if (!schema) return {};

  const result = schema.safeParse(values);

  if (result.success) return {};

  const errors: Partial<Record<string, string>> = {};

  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');

    if (field && !errors[field]) errors[field] = issue.message;
  }

  return errors;
}

/** A blank draft, used for a first visit and after a successful submit. */
export function emptyDraft(): Partial<CallFormValues> {
  return {
    tokenAddress: '',
    tokenSymbol: '',
    title: '',
    thesis: '',
    deadline: '',
    stakeToken: 'USDC',
    stakeAmount: undefined,
    side: 'yes',
    condition: { kind: 'target_price', direction: 'above', price: 100 } as Condition,
  };
}

/**
 * Persist an in-progress draft.
 *
 * Failures are swallowed on purpose: storage can be full or blocked entirely
 * in a private window, and losing autosave is not a reason to break the form
 * the user is currently filling in.
 */
export function saveDraft(values: Partial<CallFormValues>): void {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Ignored — see above.
  }
}

/**
 * Read a draft back.
 *
 * Anything unreadable returns `null` rather than throwing: a corrupt or
 * stale-shaped draft should start the user on a blank form, not a crash.
 */
export function loadDraft(): Partial<CallFormValues> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

    return parsed as Partial<CallFormValues>;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignored — see saveDraft.
  }
}

/**
 * Pin a thesis to IPFS through the backend proxy.
 *
 * The backend fronts the pinning service so no API key reaches the browser.
 */
export async function pinThesisToIpfs(thesis: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  const response = await fetch(`${base}/ipfs/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: thesis }),
  });

  if (!response.ok) {
    throw new Error(`Failed to pin thesis (${response.status})`);
  }

  const body = (await response.json()) as { cid?: string };

  if (!body.cid) {
    throw new Error('Pin succeeded but returned no CID');
  }

  return body.cid;
}
