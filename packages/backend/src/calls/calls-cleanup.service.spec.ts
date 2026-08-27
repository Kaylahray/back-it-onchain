import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CallsCleanupService } from './calls-cleanup.service';
import { Call } from './call.entity';

const mockCallsRepo = () => ({
  find: jest.fn(() => Promise.resolve([])),
  delete: jest.fn(() => Promise.resolve()),
});

describe('CallsCleanupService', () => {
  let service: CallsCleanupService;
  let callsRepo: ReturnType<typeof mockCallsRepo>;

  beforeEach(async () => {
    jest.useFakeTimers();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsCleanupService,
        { provide: getRepositoryToken(Call), useFactory: mockCallsRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              if (key === 'CLEANUP_DRY_RUN') return false;
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CallsCleanupService>(CallsCleanupService);
    callsRepo = module.get(getRepositoryToken(Call));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should do nothing when no stale drafts exist', async () => {
    callsRepo.find.mockResolvedValue([] as any);
    const promise = service.handleDraftCallsCleanup();
    jest.runAllTimers();
    await promise;
    expect(callsRepo.delete).not.toHaveBeenCalled();
  });

  it('should delete stale OPEN drafts in chunks', async () => {
    const stale = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    callsRepo.find.mockResolvedValue(stale as any);
    const promise = service.handleDraftCallsCleanup();
    jest.runAllTimers();
    await promise;
    expect(callsRepo.delete).toHaveBeenCalled();
  });

  it('should skip deletion in dry-run mode', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsCleanupService,
        { provide: getRepositoryToken(Call), useFactory: mockCallsRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              if (key === 'CLEANUP_DRY_RUN') return true;
              return def;
            }),
          },
        },
      ],
    }).compile();

    const dryService = module.get<CallsCleanupService>(CallsCleanupService);
    const dryRepo = module.get(getRepositoryToken(Call));
    (dryRepo.find as jest.Mock).mockResolvedValue([{ id: 1 }] as any);
    const promise = dryService.handleDraftCallsCleanup();
    jest.runAllTimers();
    await promise;
    expect(dryRepo.delete).not.toHaveBeenCalled();
  });
});
