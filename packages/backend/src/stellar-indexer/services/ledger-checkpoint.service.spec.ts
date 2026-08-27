import {
  InMemoryLedgerCheckpointStore,
  LedgerCheckpointService,
} from './ledger-checkpoint.service';

describe('InMemoryLedgerCheckpointStore', () => {
  let store: InMemoryLedgerCheckpointStore;

  beforeEach(() => {
    store = new InMemoryLedgerCheckpointStore();
  });

  it('returns null when no checkpoint has been saved', async () => {
    await expect(store.load('missing')).resolves.toBeNull();
  });

  it('persists and reloads a checkpoint', async () => {
    await store.save('stream', 1000);
    await expect(store.load('stream')).resolves.toBe(1000);
  });

  it('advances the cursor forward', async () => {
    await store.save('stream', 1000);
    await store.save('stream', 1500);
    await expect(store.load('stream')).resolves.toBe(1500);
  });

  it('never rewinds the cursor to an earlier ledger', async () => {
    await store.save('stream', 1500);
    await store.save('stream', 900);
    await expect(store.load('stream')).resolves.toBe(1500);
  });

  it('rejects invalid ledger values', async () => {
    await expect(store.save('stream', -1)).rejects.toThrow();
    await expect(store.save('stream', Number.NaN)).rejects.toThrow();
  });

  it('keeps separate cursors per key', async () => {
    await store.save('a', 10);
    await store.save('b', 20);
    await expect(store.load('a')).resolves.toBe(10);
    await expect(store.load('b')).resolves.toBe(20);
  });
});

describe('LedgerCheckpointService', () => {
  it('delegates to the underlying store', async () => {
    const service = new LedgerCheckpointService();
    await service.save('key', 42);
    await expect(service.load('key')).resolves.toBe(42);
  });
});
