import { BadRequestException } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { IndexerWebhookEventType } from './dto/indexer-webhook.dto';

describe('IndexerService.processWebhookEvent', () => {
  let service: IndexerService;
  let callsRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let auditLogRepository: { create: jest.Mock; save: jest.Mock };
  let authService: { validateUser: jest.Mock };

  const callCreatedData = {
    callId: '42',
    creator: '0xCreator',
    stakeToken: '0xStakeToken',
    stakeAmount: '1000000000000000000',
    startTs: '1700000000',
    endTs: '1700003600',
    tokenAddress: '0xTokenAddress',
    pairId: '0xPairId',
    ipfsCID: 'QmMockCID',
  };

  beforeEach(() => {
    callsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity),
      save: jest.fn().mockResolvedValue(undefined),
    };
    auditLogRepository = {
      create: jest.fn((entity) => entity),
      save: jest.fn().mockResolvedValue(undefined),
    };
    authService = { validateUser: jest.fn().mockResolvedValue(undefined) };

    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const stakeActivityRepository = {
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn(),
    };
    const settingsRepository = {
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn(),
    };
    const eventEmitter = { emit: jest.fn() };
    const notificationEventsService = {
      emitStakeReceived: jest.fn(),
      emitMarketResolved: jest.fn(),
    };

    service = new IndexerService(
      configService as any,
      callsRepository as any,
      stakeActivityRepository as any,
      settingsRepository as any,
      auditLogRepository as any,
      authService as any,
      eventEmitter as any,
      notificationEventsService as any,
    );
  });

  it('processes a CallCreated webhook and writes a success audit log entry', async () => {
    const result = await service.processWebhookEvent({
      eventType: IndexerWebhookEventType.CALL_CREATED,
      nonce: 'n-1',
      data: callCreatedData,
    });

    expect(result).toEqual({
      processed: true,
      eventType: IndexerWebhookEventType.CALL_CREATED,
    });
    expect(callsRepository.save).toHaveBeenCalledTimes(1);
    expect(auditLogRepository.save).toHaveBeenCalledTimes(1);
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'indexer.webhook.CallCreated',
        targetResource: '42',
        payload: expect.objectContaining({ nonce: 'n-1' }),
      }),
    );
  });

  it('is idempotent: reprocessing the same callId does not duplicate the row', async () => {
    await service.processWebhookEvent({
      eventType: IndexerWebhookEventType.CALL_CREATED,
      nonce: 'n-2',
      data: callCreatedData,
    });

    // Simulate the row now existing on-chain (as the first call would have
    // created it) so the second callback is a genuine idempotent replay.
    callsRepository.findOne.mockResolvedValueOnce({ id: 1 });

    await service.processWebhookEvent({
      eventType: IndexerWebhookEventType.CALL_CREATED,
      nonce: 'n-3',
      data: callCreatedData,
    });

    // save() was only called for the first (genuinely new) event.
    expect(callsRepository.save).toHaveBeenCalledTimes(1);
    // Both callbacks are still audited, though.
    expect(auditLogRepository.save).toHaveBeenCalledTimes(2);
  });

  it('rejects a payload missing a required field and records a failure audit entry', async () => {
    await expect(
      service.processWebhookEvent({
        eventType: IndexerWebhookEventType.CALL_CREATED,
        nonce: 'n-4',
        data: { ...callCreatedData, callId: undefined },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(auditLogRepository.save).toHaveBeenCalledTimes(1);
    expect(auditLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ success: false }),
      }),
    );
    expect(callsRepository.save).not.toHaveBeenCalled();
  });
});
