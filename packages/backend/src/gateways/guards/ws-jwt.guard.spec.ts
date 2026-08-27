import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from './ws-jwt.guard';

function makeContext(userId: string | null, data: object = {}): ExecutionContext {
  const client = { data: { userId } };
  return {
    switchToWs: () => ({
      getClient: () => client,
      getData: () => data,
    }),
  } as unknown as ExecutionContext;
}

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() } as unknown as jest.Mocked<JwtService>;
    guard = new WsJwtGuard(jwtService);
  });

  it('should allow already-authenticated clients (fast path)', async () => {
    const ctx = makeContext('user-123');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('should authenticate via inline token and attach userId', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-456' } as any);
    const client = { data: { userId: null as string | null } };
    const ctx = {
      switchToWs: () => ({
        getClient: () => client,
        getData: () => ({ token: 'valid.jwt.token' }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(client.data.userId).toBe('user-456');
  });

  it('should throw WsException when no token is present', async () => {
    const ctx = makeContext(null, {});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(WsException);
  });

  it('should throw WsException when token is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    const ctx = makeContext(null, { token: 'bad.token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(WsException);
  });
});
