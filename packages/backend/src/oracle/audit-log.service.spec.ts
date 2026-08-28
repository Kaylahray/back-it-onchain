import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './audit-log.entity';

const mockRepo = () => ({
  create: jest.fn((data) => ({ id: 'uuid-1', createdAt: new Date(), ...data })),
  save: jest.fn((entry) => Promise.resolve({ id: 'uuid-1', ...entry })),
  find: jest.fn(() => Promise.resolve([])),
});

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repo = module.get(getRepositoryToken(AuditLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('append()', () => {
    it('should create and save an audit entry', async () => {
      const params = {
        callId: '42',
        action: 'oracle.sign',
        actor: '0xabc',
        payloadHash: 'deadbeef',
        evidenceCid: 'Qm...',
      };
      const result = await service.append(params);
      expect(repo.create).toHaveBeenCalledWith(params);
      expect(repo.save).toHaveBeenCalled();
      expect(result.action).toBe('oracle.sign');
    });
  });

  describe('query()', () => {
    it('should filter by callId when provided', async () => {
      await service.query('42');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { callId: '42' } }),
      );
    });

    it('should return all recent entries when no callId given', async () => {
      await service.query();
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });
});
