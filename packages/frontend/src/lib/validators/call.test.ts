import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DRAFT_STORAGE_KEY,
  THESIS_MIN,
  TITLE_MIN,
  callFormSchema,
  clearDraft,
  emptyDraft,
  isStepValid,
  loadDraft,
  pinThesisToIpfs,
  saveDraft,
  stakeStepSchema,
  stepErrors,
  thesisStepSchema,
  tokenStepSchema,
  type CallFormValues,
} from './call';

const future = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
const past = new Date(Date.now() - 1_000).toISOString();

function validValues(): CallFormValues {
  return {
    tokenAddress: '0xabc',
    tokenSymbol: 'GOOD',
    title: 'Good token reaches a new high',
    thesis: 'x'.repeat(THESIS_MIN),
    condition: { kind: 'target_price', direction: 'above', price: 100 },
    deadline: future,
    stakeToken: 'USDC',
    stakeAmount: 25,
    side: 'yes',
  };
}

describe('step schemas', () => {
  it('accepts a complete set of values', () => {
    expect(callFormSchema.safeParse(validValues()).success).toBe(true);
  });

  it('requires a token', () => {
    expect(tokenStepSchema.safeParse({ tokenAddress: '', tokenSymbol: '' }).success).toBe(false);
  });

  it('enforces the title length bounds', () => {
    const base = validValues();

    expect(thesisStepSchema.safeParse({ ...base, title: 'a'.repeat(TITLE_MIN - 1) }).success).toBe(
      false,
    );
    expect(thesisStepSchema.safeParse({ ...base, title: 'a'.repeat(TITLE_MIN) }).success).toBe(true);
  });

  it('enforces the thesis minimum length', () => {
    const base = validValues();

    expect(
      thesisStepSchema.safeParse({ ...base, thesis: 'x'.repeat(THESIS_MIN - 1) }).success,
    ).toBe(false);
  });

  it('trims whitespace before measuring length', () => {
    const base = validValues();

    // Padding must not be able to satisfy a minimum length.
    expect(
      thesisStepSchema.safeParse({ ...base, title: `   ${'a'.repeat(TITLE_MIN - 1)}   ` }).success,
    ).toBe(false);
  });

  // A call whose deadline has passed can never be resolved, so it is refused
  // at entry rather than becoming unsettleable.
  it('rejects a deadline in the past', () => {
    const base = validValues();

    expect(thesisStepSchema.safeParse({ ...base, deadline: past }).success).toBe(false);
    expect(thesisStepSchema.safeParse({ ...base, deadline: future }).success).toBe(true);
  });

  it('rejects an unparseable deadline', () => {
    const base = validValues();

    expect(thesisStepSchema.safeParse({ ...base, deadline: 'soon' }).success).toBe(false);
  });

  it('rejects a non-positive stake', () => {
    for (const stakeAmount of [0, -5]) {
      expect(
        stakeStepSchema.safeParse({ stakeToken: 'USDC', stakeAmount, side: 'yes' }).success,
      ).toBe(false);
    }
  });

  it('rejects a side outside yes/no', () => {
    expect(
      stakeStepSchema.safeParse({ stakeToken: 'USDC', stakeAmount: 5, side: 'maybe' }).success,
    ).toBe(false);
  });

  it('rejects an invalid condition through the composed schema', () => {
    const base = validValues();

    expect(
      callFormSchema.safeParse({
        ...base,
        condition: { kind: 'range', lower: 100, upper: 10, inclusive: true },
      }).success,
    ).toBe(false);
  });
});

describe('isStepValid and stepErrors', () => {
  it('validates each step independently', () => {
    const partial = { tokenAddress: '0xabc', tokenSymbol: 'GOOD' };

    expect(isStepValid('token', partial)).toBe(true);
    expect(isStepValid('thesis', partial)).toBe(false);
    expect(isStepValid('stake', partial)).toBe(false);
  });

  it('reports one message per invalid field', () => {
    const errors = stepErrors('thesis', { title: 'short', thesis: 'tiny', deadline: past });

    expect(errors.title).toContain('at least');
    expect(errors.thesis).toContain('at least');
    expect(errors.deadline).toContain('future');
  });

  it('reports nothing for a valid step', () => {
    expect(stepErrors('token', { tokenAddress: '0x1', tokenSymbol: 'A' })).toEqual({});
  });
});

describe('draft persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a draft', () => {
    const draft = { title: 'A saved draft', tokenSymbol: 'GOOD' };

    saveDraft(draft);

    expect(loadDraft()).toEqual(draft);
  });

  it('returns null when nothing is saved', () => {
    expect(loadDraft()).toBeNull();
  });

  it('clears a draft', () => {
    saveDraft({ title: 'gone soon' });
    clearDraft();

    expect(loadDraft()).toBeNull();
  });

  // A corrupt draft should start the user on a blank form, not crash the page.
  it('returns null for unparseable storage rather than throwing', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, '{not json');

    expect(loadDraft()).toBeNull();
  });

  it('returns null for a draft that is not an object', () => {
    for (const value of ['"a string"', '42', '[1,2]', 'null']) {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, value);
      expect(loadDraft()).toBeNull();
    }
  });

  // Storage is unavailable in some private-browsing modes; autosave failing is
  // not a reason to break the form.
  it('does not throw when storage rejects a write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveDraft({ title: 'x' })).not.toThrow();

    spy.mockRestore();
  });

  it('produces a usable blank draft', () => {
    const draft = emptyDraft();

    expect(draft.side).toBe('yes');
    expect(draft.condition).toBeDefined();
    expect(isStepValid('token', draft)).toBe(false);
  });
});

describe('pinThesisToIpfs', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the CID from the proxy', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'bafy123' }),
    });

    await expect(pinThesisToIpfs('a thesis')).resolves.toBe('bafy123');
  });

  it('posts the thesis to the backend proxy', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ cid: 'bafy123' }),
    });

    await pinThesisToIpfs('a thesis');

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/ipfs/pin');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ content: 'a thesis' });
  });

  it('throws when the proxy fails', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(pinThesisToIpfs('x')).rejects.toThrow('502');
  });

  // A 200 with no CID is a silent failure that would otherwise create a call
  // pointing at nothing.
  it('throws when the proxy returns no CID', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(pinThesisToIpfs('x')).rejects.toThrow('no CID');
  });
});
