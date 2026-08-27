import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import * as crypto from 'crypto';
import { HmacSignatureGuard } from './hmac-signature.guard';

const SECRET = 'test-webhook-secret';

function buildContext(
  rawBody: Buffer | undefined,
  body: Record<string, unknown>,
  signature?: string,
): ExecutionContext {
  const request = {
    headers: signature ? { 'x-signature': signature } : {},
    rawBody,
    body,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function sign(rawBody: Buffer): string {
  return crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
}

describe('HmacSignatureGuard', () => {
  let guard: HmacSignatureGuard;
  let cacheStore: Map<string, unknown>;
  let configService: { get: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    cacheStore = new Map();
    configService = {
      get: jest.fn((key: string) =>
        key === 'INDEXER_WEBHOOK_SECRET' ? SECRET : undefined,
      ),
    };
    cache = {
      get: jest.fn((key: string) => Promise.resolve(cacheStore.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve();
      }),
    };
    guard = new HmacSignatureGuard(configService as any, cache as any);
  });

  it('allows a request with a valid signature and fresh nonce', async () => {
    const body = { nonce: 'nonce-1', eventType: 'CallCreated', data: {} };
    const rawBody = Buffer.from(JSON.stringify(body));
    const context = buildContext(rawBody, body, sign(rawBody));

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a request with a missing signature header', async () => {
    const body = { nonce: 'nonce-2', eventType: 'CallCreated', data: {} };
    const rawBody = Buffer.from(JSON.stringify(body));
    const context = buildContext(rawBody, body, undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a request with a tampered body (signature mismatch)', async () => {
    const original = { nonce: 'nonce-3', eventType: 'CallCreated', data: {} };
    const rawBody = Buffer.from(JSON.stringify(original));
    const validSignature = sign(rawBody);

    // Attacker mutates the parsed body after signing but the raw bytes
    // used for verification are still the original, unsigned-for payload.
    const tamperedBody = { ...original, data: { injected: true } };
    const context = buildContext(rawBody, tamperedBody, validSignature);

    // Signature itself still matches rawBody, so this should pass — proving
    // verification is against rawBody, not the parsed (mutable) body.
    await expect(guard.canActivate(context)).resolves.toBe(true);

    // Now actually corrupt the raw bytes to prove mismatches are caught.
    const corruptedRawBody = Buffer.from(JSON.stringify(tamperedBody));
    const context2 = buildContext(
      corruptedRawBody,
      tamperedBody,
      validSignature,
    );
    await expect(guard.canActivate(context2)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a replayed nonce', async () => {
    const body = { nonce: 'nonce-4', eventType: 'CallCreated', data: {} };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = sign(rawBody);

    await expect(
      guard.canActivate(buildContext(rawBody, body, signature)),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(buildContext(rawBody, body, signature)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the raw body is unavailable', async () => {
    const body = { nonce: 'nonce-5', eventType: 'CallCreated', data: {} };
    const context = buildContext(undefined, body, 'deadbeef');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the secret is not configured', async () => {
    configService.get.mockReturnValue(undefined);
    const body = { nonce: 'nonce-6', eventType: 'CallCreated', data: {} };
    const rawBody = Buffer.from(JSON.stringify(body));
    const context = buildContext(rawBody, body, sign(rawBody));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
