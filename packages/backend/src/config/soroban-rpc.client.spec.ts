import { ConfigService } from '@nestjs/config';
import { StrKey } from '@stellar/stellar-sdk';
import { SorobanRpcClient, toStrKeyAddress } from './soroban-rpc.client';

const G_ADDR = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const C_ADDR = StrKey.encodeContract(Buffer.alloc(32, 2));

describe('toStrKeyAddress', () => {
  it('returns a valid G-address unchanged', () => {
    expect(toStrKeyAddress(G_ADDR)).toBe(G_ADDR);
  });

  it('returns a valid C-address unchanged', () => {
    expect(toStrKeyAddress(C_ADDR)).toBe(C_ADDR);
  });
});

describe('SorobanRpcClient — Horizon fallback', () => {
  let client: SorobanRpcClient;

  const makeConfig = (): ConfigService =>
    ({
      get: (_key: string, def?: unknown) => def,
    }) as unknown as ConfigService;

  beforeEach(() => {
    client = new SorobanRpcClient(makeConfig());
    client.onModuleInit();
  });

  it('maps Horizon transaction records and passes the cursor', async () => {
    const call = jest.fn().mockResolvedValue({
      records: [
        {
          hash: 'abc123',
          ledger_attr: 42,
          created_at: '2026-01-01T00:00:00Z',
          successful: true,
          paging_token: 'tok-1',
        },
      ],
    });
    const cursor = jest.fn().mockReturnValue({ call });
    const limit = jest.fn().mockReturnValue({ call, cursor });
    const order = jest.fn().mockReturnValue({ limit });
    const forAccount = jest.fn().mockReturnValue({ order });
    // Inject a mock Horizon server.
    (client as unknown as { horizon: unknown }).horizon = {
      transactions: () => ({ forAccount }),
    };

    const records = await client.getTransactionHistoryViaHorizon({
      account: G_ADDR,
      cursor: 'tok-0',
      limit: 50,
    });

    expect(forAccount).toHaveBeenCalledWith(G_ADDR);
    expect(cursor).toHaveBeenCalledWith('tok-0');
    expect(records).toEqual([
      {
        hash: 'abc123',
        ledger: 42,
        createdAt: '2026-01-01T00:00:00Z',
        successful: true,
        pagingToken: 'tok-1',
      },
    ]);
  });

  it('omits the cursor call when none is provided', async () => {
    const call = jest.fn().mockResolvedValue({ records: [] });
    const cursor = jest.fn();
    const limit = jest.fn().mockReturnValue({ call, cursor });
    const order = jest.fn().mockReturnValue({ limit });
    const forAccount = jest.fn().mockReturnValue({ order });
    (client as unknown as { horizon: unknown }).horizon = {
      transactions: () => ({ forAccount }),
    };

    const records = await client.getTransactionHistoryViaHorizon({
      account: G_ADDR,
    });

    expect(cursor).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });
});
