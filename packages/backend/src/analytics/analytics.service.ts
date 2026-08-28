import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { PriceHistoryPeriod } from './dto/price-history-query.dto';
import {
  computeReputationScore,
  ReputationCallInput,
} from './reputation.util';

// [timestamp_ms, close_price]
export type PriceCandle = [number, number];

export interface PriceHistoryResult {
  tokenAddress: string;
  period: PriceHistoryPeriod;
  candles: PriceCandle[];
}

interface DexScreenerPair {
  pairAddress: string;
  chainId: string;
}

interface DexScreenerTokenResponse {
  pairs: DexScreenerPair[] | null;
}

// ohlcv_list entry: [timestamp_s, open, high, low, close, volume]
type OhlcvEntry = [number, number, number, number, number, number];

interface GeckoOhlcvResponse {
  data: {
    attributes: {
      ohlcv_list: OhlcvEntry[];
    };
  };
}

// Maps DexScreener chainId → GeckoTerminal network slug
const CHAIN_TO_GECKO_NETWORK: Record<string, string> = {
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  solana: 'solana',
  avalanche: 'avax',
  optimism: 'optimism',
  fantom: 'ftm',
  cronos: 'cro',
};

// Number of hourly candles to request per period
const PERIOD_LIMIT: Record<PriceHistoryPeriod, number> = {
  [PriceHistoryPeriod.SEVEN_DAYS]: 168, // 7 × 24
  [PriceHistoryPeriod.THIRTY_DAYS]: 720, // 30 × 24
};

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly dataSource: DataSource,
  ) {}

  async getPriceHistory(
    tokenAddress: string,
    period: PriceHistoryPeriod,
  ): Promise<PriceHistoryResult> {
    const cacheKey = `price-history:${tokenAddress}:${period}`;

    const cached = await this.cache.get<PriceHistoryResult>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return cached;
    }

    this.logger.log(`Cache miss: ${cacheKey} — fetching from external APIs`);

    const { pairAddress, chainId } = await this.resolvePair(tokenAddress);
    const network = CHAIN_TO_GECKO_NETWORK[chainId.toLowerCase()];

    if (!network) {
      throw new NotFoundException(
        `Price history is not supported for chain "${chainId}"`,
      );
    }

    const candles = await this.fetchOhlcv(network, pairAddress, period);
    const result: PriceHistoryResult = { tokenAddress, period, candles };

    await this.cache.set(cacheKey, result, CACHE_TTL_MS);

    return result;
  }

  /**
   * Computes and returns a wallet's reputation score.
   *
   * score = Σ (outcomeCorrect ? +1 : -1) * stakeWeight * timeDecay(halfLife 30d)
   *
   * Draws/UNRESOLVED calls are skipped. The result is cached for 1 hour and
   * persisted back onto the user profile.
   */
  async getReputation(wallet: string): Promise<{
    wallet: string;
    reputationScore: number;
    resolvedCalls: number;
  }> {
    const cacheKey = `reputation:${wallet.toLowerCase()}`;
    const cached = await this.cache.get<{
      wallet: string;
      reputationScore: number;
      resolvedCalls: number;
    }>(cacheKey);
    if (cached) return cached;

    const [userRow] = await this.dataSource.query<Array<{ wallet: string }>>(
      `SELECT wallet FROM "user" WHERE wallet = $1`,
      [wallet],
    );
    if (!userRow) {
      throw new NotFoundException(`User ${wallet} not found`);
    }

    const rows = await this.dataSource.query<Array<{
      outcome: boolean | null;
      totalStake: string;
      resolvedAt: Date;
    }>>(
      `SELECT outcome, (total_stake_yes + total_stake_no) AS "totalStake",
              COALESCE(end_ts, updated_at) AS "resolvedAt"
       FROM "call"
       WHERE creator_wallet = $1
         AND status = 'RESOLVED'
         AND is_hidden = false`,
      [wallet],
    );

    const inputs: ReputationCallInput[] = rows.map((r) => ({
      outcome: r.outcome as boolean | null,
      stakeAmount: parseFloat(r.totalStake) || 0,
      resolvedAt: r.resolvedAt,
    }));

    const reputationScore = computeReputationScore(inputs);
    const result = {
      wallet,
      reputationScore,
      resolvedCalls: inputs.length,
    };

    await this.dataSource.query(
      `UPDATE "user" SET reputation_score = $1 WHERE wallet = $2`,
      [reputationScore, wallet],
    );
    await this.cache.set(cacheKey, result, 3_600_000); // 1 hour

    return result;
  }

  private async resolvePair(
    tokenAddress: string,
  ): Promise<{ pairAddress: string; chainId: string }> {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(
        `DexScreener returned ${response.status} for token ${tokenAddress}`,
      );
    }

    const data = (await response.json()) as DexScreenerTokenResponse;
    const pair = data?.pairs?.[0];

    if (!pair?.pairAddress) {
      throw new NotFoundException(
        `No trading pair found on DexScreener for token ${tokenAddress}`,
      );
    }

    return { pairAddress: pair.pairAddress, chainId: pair.chainId };
  }

  private async fetchOhlcv(
    network: string,
    poolAddress: string,
    period: PriceHistoryPeriod,
  ): Promise<PriceCandle[]> {
    const limit = PERIOD_LIMIT[period];
    const url =
      `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/hour` +
      `?aggregate=1&limit=${limit}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `GeckoTerminal returned ${response.status} for ${network}/${poolAddress}`,
      );
    }

    const data = (await response.json()) as GeckoOhlcvResponse;
    const ohlcvList = data?.data?.attributes?.ohlcv_list ?? [];

    // Convert [timestamp_s, open, high, low, close, volume] → [timestamp_ms, close]
    // GeckoTerminal returns newest-first; sort ascending for chart libraries.
    return ohlcvList
      .map(([ts, , , , close]) => [ts * 1000, close] as PriceCandle)
      .sort(([a], [b]) => a - b);
  }
}
