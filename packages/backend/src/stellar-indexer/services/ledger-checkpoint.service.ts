import { Injectable, Logger } from '@nestjs/common';

/**
 * Persists the last fully-processed ledger sequence per indexer stream so the
 * poller can resume from where it left off after a restart instead of
 * re-scanning (or missing) a window of ledgers.
 */
export interface LedgerCheckpointStore {
  load(key: string): Promise<number | null>;
  save(key: string, ledger: number): Promise<void>;
}

/**
 * Default in-memory checkpoint store. Suitable for tests and single-process
 * runs; a durable implementation (TypeORM/Redis) can implement the same
 * interface and be injected in its place.
 */
export class InMemoryLedgerCheckpointStore implements LedgerCheckpointStore {
  private readonly checkpoints = new Map<string, number>();

  load(key: string): Promise<number | null> {
    return Promise.resolve(
      this.checkpoints.has(key) ? (this.checkpoints.get(key) as number) : null,
    );
  }

  async save(key: string, ledger: number): Promise<void> {
    if (!Number.isFinite(ledger) || ledger < 0) {
      throw new Error(`Invalid ledger checkpoint: ${ledger}`);
    }
    const prev = this.checkpoints.get(key) ?? -1;
    // Cursor is monotonic — never rewind past an already-recorded ledger.
    if (ledger >= prev) {
      this.checkpoints.set(key, ledger);
    }
    await Promise.resolve();
  }
}

@Injectable()
export class LedgerCheckpointService implements LedgerCheckpointStore {
  private readonly logger = new Logger(LedgerCheckpointService.name);
  private readonly store = new InMemoryLedgerCheckpointStore();

  load(key: string): Promise<number | null> {
    return this.store.load(key);
  }

  async save(key: string, ledger: number): Promise<void> {
    await this.store.save(key, ledger);
    this.logger.debug(`Checkpoint ${key} → ledger ${ledger}`);
  }
}
