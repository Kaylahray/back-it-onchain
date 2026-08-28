import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PaymasterBudgetSnapshot {
  dailyAllowance: number;
  perAddressCap: number;
  addresses: Record<
    string,
    {
      spent: number;
      disabled: boolean;
      disabledAt?: number;
    }
  >;
}

/**
 * PaymasterPolicyService (Base only)
 *
 * Budget monitor for the ERC-4337 paymaster. Tracks gas-sponsorship spending
 * per address in the shared Redis/Cache store so that totals survive restarts
 * and multiple instances:
 *   - per-address daily cap
 *   - global daily allowance
 *   - auto-disable an address once its cap is exhausted
 *
 * All counters are stored under a TTL matching the daily window (24h), so
 * budgets reset automatically each day; admins can also reset a single address
 * or the whole budget through the admin REST endpoints.
 */
@Injectable()
export class PaymasterPolicyService {
  private readonly logger = new Logger(PaymasterPolicyService.name);

  private readonly dailyAllowanceBudget: number;
  private readonly perAddressCap: number;
  private readonly keyPrefix = 'paymaster:';

  private readonly spendKey = (address: string) =>
    `${this.keyPrefix}spend:${address.toLowerCase()}`;
  private readonly disabledKey = (address: string) =>
    `${this.keyPrefix}disabled:${address.toLowerCase()}`;
  private readonly dailyKey = () => `${this.keyPrefix}daily`;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.dailyAllowanceBudget = Number(
      this.configService.get<number>('PAYMASTER_DAILY_ALLOWANCE', 1_000_000),
    );
    this.perAddressCap = Number(
      this.configService.get<number>('PAYMASTER_PER_ADDRESS_CAP', 100_000),
    );
  }

  /**
   * Whether the paymaster can sponsor gas for `amount` on behalf of
   * `address` (i.e. the address is not disabled and the request stays within
   * both the per-address cap and the global daily allowance).
   */
  async canSponsor(address: string, amount: number): Promise<boolean> {
    const normalized = address.toLowerCase();

    const disabled = await this.cacheManager.get<boolean | null>(
      this.disabledKey(normalized),
    );
    if (disabled) return false;

    const [spent, dailySpent] = await Promise.all([
      this.getSpent(normalized),
      this.cacheManager.get<number>(this.dailyKey()),
    ]);

    if (spent + amount > this.perAddressCap) return false;
    if ((dailySpent ?? 0) + amount > this.dailyAllowanceBudget) return false;
    return true;
  }

  /**
   * Book `amount` of gas spend against `address`. Returns false (and
   * auto-disables the address) when the transaction would exceed the
   * per-address cap.
   */
  async spend(address: string, amount: number): Promise<boolean> {
    const normalized = address.toLowerCase();

    const spent = await this.getSpent(normalized);
    const next = spent + amount;
    if (next > this.perAddressCap) {
      await this.disable(normalized);
      return false;
    }

    await this.cacheManager.set(this.spendKey(normalized), next, DAY_MS);
    await this.registerAddress(normalized);
    await this.trackDaily(amount);
    return true;
  }

  /** Force-enable an address and clear its spend (admin budget reset). */
  async resetBudget(address?: string): Promise<void> {
    if (address) {
      const normalized = address.toLowerCase();
      await this.cacheManager.del(this.spendKey(normalized));
      await this.cacheManager.del(this.disabledKey(normalized));
      return;
    }
    // Reset everything: clear the in-memory knowledge titles by scanning is
    // unreliable on arbitrary cache providers, so we only reset what we track
    // explicitly. Store a list of known addresses under a registry key.
    const known = await this.cacheManager.get<string[]>(
      `${this.keyPrefix}addresses`,
    );
    for (const addr of known ?? []) {
      await this.cacheManager.del(this.spendKey(addr));
      await this.cacheManager.del(this.disabledKey(addr));
    }
    await this.cacheManager.del(`${this.keyPrefix}addresses`);
    await this.cacheManager.del(this.dailyKey());
  }

  /** Snapshot of the paymaster budget for the admin dashboard. */
  async getBudgetSnapshot(): Promise<PaymasterBudgetSnapshot> {
    const known =
      (await this.cacheManager.get<string[]>(`${this.keyPrefix}addresses`)) ??
      [];
    const addresses: PaymasterBudgetSnapshot['addresses'] = {};
    for (const addr of known) {
      const [spent, disabled] = await Promise.all([
        this.getSpent(addr),
        this.cacheManager.get<boolean | null>(this.disabledKey(addr)),
      ]);
      addresses[addr] = { spent, disabled: Boolean(disabled) };
    }

    return {
      dailyAllowance: this.dailyAllowanceBudget,
      perAddressCap: this.perAddressCap,
      addresses,
    };
  }

  private async getSpent(address: string): Promise<number> {
    const raw = await this.cacheManager.get<number>(this.spendKey(address));
    return typeof raw === 'number' ? raw : 0;
  }

  private async disable(normalized: string): Promise<void> {
    await this.cacheManager.set(
      this.disabledKey(normalized),
      true,
      DAY_MS,
    );
    this.logger.warn(`Paymaster auto-disabled for address ${normalized}`);
  }

  private async registerAddress(normalized: string): Promise<void> {
    const key = `${this.keyPrefix}addresses`;
    const known =
      (await this.cacheManager.get<string[]>(key)) ?? [];
    if (!known.includes(normalized)) {
      known.push(normalized);
      await this.cacheManager.set(key, known, DAY_MS);
    }
  }

  private async trackDaily(amount: number): Promise<void> {
    const current = await this.cacheManager.get<number>(this.dailyKey());
    await this.cacheManager.set(this.dailyKey(), (current ?? 0) + amount, DAY_MS);
  }
}
