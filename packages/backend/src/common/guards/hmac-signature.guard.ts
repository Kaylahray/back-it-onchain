import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Request } from 'express';
import * as crypto from 'crypto';

/** How long a webhook nonce is remembered before it can be reused. */
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const NONCE_CACHE_PREFIX = 'indexer-webhook:nonce:';

/**
 * Verifies that an inbound webhook request:
 *   1. Carries a valid HMAC-SHA256 signature (header `X-Signature`) of the
 *      exact raw request body, keyed by `INDEXER_WEBHOOK_SECRET`.
 *   2. Has not been replayed — the request body's `nonce` field must not
 *      have been seen within the last 10 minutes.
 *
 * Requires `rawBody: true` on `NestFactory.create` so `request.rawBody`
 * (the exact bytes received, before JSON parsing) is available — signing
 * over a re-serialized body would fail for byte-for-byte-identical but
 * differently-ordered JSON.
 */
@Injectable()
export class HmacSignatureGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const secret = this.configService.get<string>('INDEXER_WEBHOOK_SECRET');

    if (!secret) {
      throw new UnauthorizedException('Webhook signing secret not configured');
    }

    const signature = request.headers['x-signature'];
    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Missing X-Signature header');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw request body unavailable');
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (!this.timingSafeEqualHex(signature, expected)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const nonce = (request.body as { nonce?: unknown } | undefined)?.nonce;
    if (!nonce || typeof nonce !== 'string') {
      throw new UnauthorizedException('Missing or invalid nonce');
    }

    const cacheKey = `${NONCE_CACHE_PREFIX}${nonce}`;
    const alreadySeen = await this.cache.get(cacheKey);
    if (alreadySeen) {
      throw new ConflictException('Webhook nonce has already been used');
    }
    await this.cache.set(cacheKey, true, NONCE_TTL_MS);

    return true;
  }

  /** Constant-time comparison of two equal-length hex digests. */
  private timingSafeEqualHex(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
