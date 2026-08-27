import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Readable } from 'stream';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { BadgesService } from '../src/badges/badges.service';
import { CallsService } from '../src/calls/calls.service';

/**
 * BE-31 — streams the CSV/JSON history export over a real HTTP response
 * (not just a mocked Response object), proving headers and chunked body
 * content arrive correctly through supertest.
 */
describe('Users history export (e2e)', () => {
  let app: INestApplication;
  let mockExportHistory: jest.Mock;

  beforeEach(async () => {
    mockExportHistory = jest.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { exportHistory: mockExportHistory } },
        { provide: BadgesService, useValue: {} },
        { provide: CallsService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /users/:wallet/export?format=csv streams CSV with the right headers', async () => {
    mockExportHistory.mockResolvedValue(
      Readable.from(['Call ID,Title\n', '1,Test Call\n']),
    );

    const res = await request(app.getHttpServer())
      .get('/users/GABCDEF1/export')
      .query({ format: 'csv' })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toBe('Call ID,Title\n1,Test Call\n');
    expect(mockExportHistory).toHaveBeenCalledWith('GABCDEF1', 'csv');
  });

  it('GET /users/:wallet/export?format=json streams a JSON array body', async () => {
    mockExportHistory.mockResolvedValue(
      Readable.from(['[\n', '  {"call_id":"1"}\n', ']\n']),
    );

    const res = await request(app.getHttpServer())
      .get('/users/GABCDEF1/export')
      .query({ format: 'json' })
      .expect(200);

    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.text)).toEqual([{ call_id: '1' }]);
    expect(mockExportHistory).toHaveBeenCalledWith('GABCDEF1', 'json');
  });

  it('GET /users/me/export-history?wallet=...&format=csv still works (legacy route)', async () => {
    mockExportHistory.mockResolvedValue(Readable.from(['a,b\n']));

    const res = await request(app.getHttpServer())
      .get('/users/me/export-history')
      .query({ wallet: 'GABCDEF1', format: 'csv' })
      .expect(200);

    expect(res.text).toBe('a,b\n');
    expect(mockExportHistory).toHaveBeenCalledWith('GABCDEF1', 'csv');
  });

  it('GET /users/me/export-history without a wallet param returns 400', async () => {
    await request(app.getHttpServer())
      .get('/users/me/export-history')
      .expect(400);

    expect(mockExportHistory).not.toHaveBeenCalled();
  });

  it('propagates a stream error as a 500 once headers are already flushed', async () => {
    mockExportHistory.mockResolvedValue(
      new Readable({
        read() {
          this.emit('error', new Error('db connection lost'));
        },
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/users/GABCDEF1/export')
      .query({ format: 'csv' });

    expect(res.status).toBe(500);
  });
});
