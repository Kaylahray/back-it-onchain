import { HealthIndicatorService } from '@nestjs/terminus';
import { RpcHealthIndicator } from './rpc.health-indicator';

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
  },
}));

import { ethers } from 'ethers';

describe('RpcHealthIndicator', () => {
  let indicator: RpcHealthIndicator;
  let configService: { get: jest.Mock };
  let sorobanRpcClient: { getHealth: jest.Mock };

  beforeEach(() => {
    configService = { get: jest.fn() };
    sorobanRpcClient = { getHealth: jest.fn() };
    indicator = new RpcHealthIndicator(
      configService as any,
      sorobanRpcClient as any,
      new HealthIndicatorService(),
    );
    (ethers.JsonRpcProvider as jest.Mock).mockReset();
  });

  describe('checkBase', () => {
    it('reports up (and unconfigured) when BASE_SEPOLIA_RPC_URL is not set', async () => {
      configService.get.mockReturnValue(undefined);

      const result = await indicator.checkBase('rpc_base');

      expect(result.rpc_base.status).toBe('up');
      expect(ethers.JsonRpcProvider).not.toHaveBeenCalled();
    });

    it('reports up with the current block number when the RPC responds', async () => {
      configService.get.mockReturnValue('https://base.example');
      (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => ({
        getBlockNumber: jest.fn().mockResolvedValue(12345),
      }));

      const result = await indicator.checkBase('rpc_base');

      expect(result.rpc_base.status).toBe('up');
      expect(result.rpc_base.blockNumber).toBe(12345);
    });

    it('reports down when the RPC call rejects', async () => {
      configService.get.mockReturnValue('https://base.example');
      (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => ({
        getBlockNumber: jest.fn().mockRejectedValue(new Error('timeout')),
      }));

      const result = await indicator.checkBase('rpc_base');

      expect(result.rpc_base.status).toBe('down');
    });

    it('reports down when the RPC call exceeds the timeout', async () => {
      configService.get.mockReturnValue('https://base.example');
      (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => ({
        getBlockNumber: () => new Promise(() => {}), // never resolves
      }));

      const result = await indicator.checkBase('rpc_base', 20);

      expect(result.rpc_base.status).toBe('down');
      expect(result.rpc_base.message).toContain('timed out');
    });
  });

  describe('checkSoroban', () => {
    it('reports up when getHealth resolves', async () => {
      sorobanRpcClient.getHealth.mockResolvedValue({
        status: 'healthy',
        latestLedger: 100,
        ledgerRetentionWindow: 10,
        oldestLedger: 90,
      });

      const result = await indicator.checkSoroban('rpc_soroban');

      expect(result.rpc_soroban.status).toBe('up');
    });

    it('reports down when getHealth rejects', async () => {
      sorobanRpcClient.getHealth.mockRejectedValue(new Error('unreachable'));

      const result = await indicator.checkSoroban('rpc_soroban');

      expect(result.rpc_soroban.status).toBe('down');
      expect(result.rpc_soroban.message).toBe('unreachable');
    });
  });
});
