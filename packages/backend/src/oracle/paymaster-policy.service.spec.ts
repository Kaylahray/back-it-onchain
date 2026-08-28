import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PaymasterPolicyService } from './paymaster-policy.service';

describe('PaymasterPolicyService', () => {
  let service: PaymasterPolicyService;
  let cache: Record<string, any>;

  const store = new Map<string, unknown>();

  const cacheMock = {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    reset: jest.fn(async () => store.clear()),
  };

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymasterPolicyService,
        {
          provide: CACHE_MANAGER,
          useValue: cacheMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: number) => {
              if (key === 'PAYMASTER_DAILY_ALLOWANCE') return 1_000_000;
              if (key === 'PAYMASTER_PER_ADDRESS_CAP') return 100_000;
              return def;
            },
          },
        },
      ],
    }).compile();

    service = module.get<PaymasterPolicyService>(PaymasterPolicyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows sponsorship within the per-address cap', async () => {
    await service.spend('0xABC', 1000);
    expect(await service.canSponsor('0xABC', 1000)).toBe(true);
  });

  it('rejects sponsorship that exceeds the per-address cap', async () => {
    // Default cap is 100_000
    await service.spend('0xABC', 90_000);
    expect(await service.canSponsor('0xABC', 20_000)).toBe(false);
  });

  it('auto-disables an address once its cap is exhausted', async () => {
    await service.spend('0xABC', 100_000);
    // Next spend would exceed the cap -> disabled and rejected
    const accepted = await service.spend('0xABC', 1);
    expect(accepted).toBe(false);
    expect(await service.canSponsor('0xABC', 1)).toBe(false);
  });

  it('tracks spend per address (case-insensitive)', async () => {
    await service.spend('0xABC', 1000);
    await service.spend('0xabc', 500);
    const snapshot = await service.getBudgetSnapshot();
    expect(snapshot.addresses['0xabc']?.spent).toBe(1500);
  });

  it('resets a single address budget', async () => {
    await service.spend('0xABC', 100_000);
    await service.resetBudget('0xABC');
    expect(await service.canSponsor('0xABC', 1000)).toBe(true);
  });

  it('resets the whole budget (re-enables all addresses)', async () => {
    await service.spend('0xABC', 100_000);
    await service.spend('0xDEF', 50_000);
    await service.resetBudget();
    expect(await service.canSponsor('0xABC', 100_000)).toBe(true);
    expect(await service.canSponsor('0xDEF', 100_000)).toBe(true);
  });

  it('rejects sponsorship beyond the global daily allowance', async () => {
    // Fill the per-address caps across 10 addresses to hit the 1,000,000 cap
    for (let i = 0; i < 10; i++) {
      await service.spend(`0xADDR${i}`, 100_000);
    }
    expect(await service.canSponsor('0xTHREE', 1)).toBe(false);
  });

  it('reports a budget snapshot with caps', async () => {
    await service.spend('0xABC', 1000);
    const snapshot = await service.getBudgetSnapshot();
    expect(snapshot.dailyAllowance).toBe(1_000_000);
    expect(snapshot.perAddressCap).toBe(100_000);
    expect(snapshot.addresses).toHaveProperty('0xabc');
  });
});
