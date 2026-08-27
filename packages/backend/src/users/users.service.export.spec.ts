import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MAX_EXPORT_ROWS, UsersService } from './users.service';
import { User } from './user.entity';
import { UserFollows } from './user-follows.entity';
import { UserSettings } from './user-settings.entity';
import { NotificationEventsService } from '../notifications/notification-events.service';

/** Minimal stand-in for the pg-query-stream Readable returned by QueryRunner.stream(). */
class FakePgStream extends EventEmitter {
  pause = jest.fn();
  resume = jest.fn(() => {
    // Emulate the real stream: resuming lets buffered/future rows flow.
  });
  pipe = jest.fn((dest: NodeJS.WritableStream) => dest);
}

describe('UsersService.exportHistory', () => {
  let service: UsersService;
  let queryRunner: {
    connect: jest.Mock;
    stream: jest.Mock;
    release: jest.Mock;
  };
  let fakeStream: FakePgStream;

  beforeEach(async () => {
    fakeStream = new FakePgStream();
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      stream: jest.fn().mockResolvedValue(fakeStream),
      release: jest.fn().mockResolvedValue(undefined),
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(UserFollows), useValue: {} },
        { provide: getRepositoryToken(UserSettings), useValue: {} },
        { provide: NotificationEventsService, useValue: {} },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('caps the underlying query at MAX_EXPORT_ROWS rows', async () => {
    await service.exportHistory('GWALLET', 'json');

    expect(queryRunner.stream).toHaveBeenCalledWith(
      expect.stringContaining(`LIMIT ${MAX_EXPORT_ROWS}`),
      ['GWALLET'],
    );
  });

  it('produces a well-formed JSON array from streamed rows', async () => {
    const output = await service.exportHistory('GWALLET', 'json');

    const chunks: Buffer[] = [];
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    const done = new Promise<void>((resolve) => output.on('end', resolve));

    fakeStream.emit('data', { call_id: '1', pnl: '10' });
    fakeStream.emit('data', { call_id: '2', pnl: '-5' });
    fakeStream.emit('end');

    await done;

    const text = Buffer.concat(chunks).toString('utf8');
    expect(JSON.parse(text)).toEqual([
      { call_id: '1', pnl: '10' },
      { call_id: '2', pnl: '-5' },
    ]);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('pauses the pg stream when the output buffer is full (backpressure)', async () => {
    const output = await service.exportHistory('GWALLET', 'json');

    // Force output's internal buffer to report "full" on the next push by
    // setting a highWaterMark of 0 and not attaching a 'data' listener yet
    // (flowing mode would otherwise drain it immediately).
    Object.defineProperty(output, 'readableHighWaterMark', { value: 0 });

    fakeStream.emit('data', { call_id: 'row-that-fills-the-buffer' });

    // With a 0-byte high water mark, push() returns false immediately,
    // so the source must have been paused.
    expect(fakeStream.pause).toHaveBeenCalled();

    // Draining resumes the source via output's `read()` callback.
    output.read();
    expect(fakeStream.resume).toHaveBeenCalled();
  });

  it('propagates pg stream errors and still releases the query runner', async () => {
    const output = await service.exportHistory('GWALLET', 'json');

    const errored = new Promise<Error>((resolve) =>
      output.on('error', resolve),
    );

    const boom = new Error('connection reset');
    fakeStream.emit('error', boom);

    await expect(errored).resolves.toBe(boom);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('pipes the pg stream into csv-stringify for CSV exports', async () => {
    await service.exportHistory('GWALLET', 'csv');
    expect(fakeStream.pipe).toHaveBeenCalled();
  });
});
