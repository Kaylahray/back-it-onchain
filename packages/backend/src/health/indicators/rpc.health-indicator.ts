import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { SorobanRpcClient } from '../../config/soroban-rpc.client';

const DEFAULT_TIMEOUT_MS = 3_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`RPC check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    // Clear the timer regardless of which side of the race wins — otherwise
    // a fast RPC response still leaves a live timer pinning the event loop
    // for the rest of `timeoutMs`.
    clearTimeout(timer!);
  }
}

/**
 * Confirms liveness of the two chain RPC endpoints the platform depends on:
 * Base (EVM, via ethers) and Soroban/Stellar (via SorobanRpcClient).
 *
 * Both checks are best-effort and time-boxed — a slow or unreachable RPC
 * marks that indicator `down` without blocking the rest of the health
 * check for longer than `DEFAULT_TIMEOUT_MS`.
 */
@Injectable()
export class RpcHealthIndicator {
  constructor(
    private readonly configService: ConfigService,
    private readonly sorobanRpcClient: SorobanRpcClient,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async checkBase<Key extends string>(
    key: Key,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<HealthIndicatorResult<Key>> {
    const indicator = this.healthIndicatorService.check(key);
    const rpcUrl = this.configService.get<string>('BASE_SEPOLIA_RPC_URL');

    if (!rpcUrl) {
      // Not configured in this environment — don't fail the check for a
      // feature that was never enabled (e.g. local dev without Base).
      return indicator.up({ message: 'not configured' });
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const blockNumber = await withTimeout(provider.getBlockNumber(), timeoutMs);
      return indicator.up({ blockNumber });
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }

  async checkSoroban<Key extends string>(
    key: Key,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<HealthIndicatorResult<Key>> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      // getHealth() resolves only for status: "healthy" (per the Stellar SDK
      // types) — any other outcome (timeout, network error, RPC-side error
      // response) rejects, so a successful resolution is itself the signal.
      const health = await withTimeout(
        this.sorobanRpcClient.getHealth(),
        timeoutMs,
      );
      return indicator.up({
        sorobanStatus: health.status,
        latestLedger: health.latestLedger,
      });
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }
}
