import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotificationsCleanupService } from './notifications-cleanup.service';
import { Notification } from './notification.entity';

const mockNotifRepo = () => ({
  find: jest.fn(() => Promise.resolve([])),
  delete: jest.fn(() => Promise.resolve()),
});

describe('NotificationsCleanupService', () => {
  let service: NotificationsCleanupService;
  let repo: ReturnType<typeof mockNotifRepo>;

  beforeEach(async () => {
    jest.useFakeTimers();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsCleanupService,
        { provide: getRepositoryToken(Notification), useFactory: mockNotifRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              if (key === 'CLEANUP_DRY_RUN') return false;
              if (key === 'NOTIFICATION_RETENTION_DAYS') return 30;
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsCleanupService>(NotificationsCleanupService);
    repo = module.get(getRepositoryToken(Notification));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should do nothing when no stale read notifications exist', async () => {
    repo.find.mockResolvedValue([] as any);
    const promise = service.handleNotificationCleanup();
    jest.runAllTimers();
    await promise;
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('should delete stale read notifications in chunks', async () => {
    const stale = Array.from({ length: 3 }, (_, i) => ({ id: `uuid-${i}` }));
    repo.find.mockResolvedValue(stale as any);
    const promise = service.handleNotificationCleanup();
    jest.runAllTimers();
    await promise;
    expect(repo.delete).toHaveBeenCalled();
  });

  it('should skip deletion in dry-run mode', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsCleanupService,
        { provide: getRepositoryToken(Notification), useFactory: mockNotifRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => {
              if (key === 'CLEANUP_DRY_RUN') return true;
              if (key === 'NOTIFICATION_RETENTION_DAYS') return 30;
              return def;
            }),
          },
        },
      ],
    }).compile();
    const dryService = module.get<NotificationsCleanupService>(NotificationsCleanupService);
    const dryRepo = module.get(getRepositoryToken(Notification));
    (dryRepo.find as jest.Mock).mockResolvedValue([{ id: 'uuid-1' }] as any);
    const promise = dryService.handleNotificationCleanup();
    jest.runAllTimers();
    await promise;
    expect(dryRepo.delete).not.toHaveBeenCalled();
  });
});
