import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { PaymasterPolicyService } from '../oracle/paymaster-policy.service';
import { PaymasterBudgetSnapshot } from '../oracle/paymaster-policy.service';
import { AuditLogService } from '../oracle/audit-log.service';
import { AuditLog } from '../oracle/audit-log.entity';

class CircuitBreakerDto {
  paused!: boolean;
}

class ResetBudgetDto {
  address?: string;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly paymasterPolicyService: PaymasterPolicyService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * PATCH /admin/circuit-breaker
   * Toggle the protocol-wide circuit breaker.
   */
  @Patch('circuit-breaker')
  @HttpCode(HttpStatus.OK)
  async setCircuitBreaker(
    @Body() body: CircuitBreakerDto,
  ): Promise<{ isPaused: boolean; updatedAt: Date }> {
    return this.adminService.setCircuitBreaker(Boolean(body.paused));
  }

  /**
   * GET /admin/paymaster/budget
   *
   * Returns the paymaster budget snapshot: per-address caps, global daily
   * allowance, and current per-address spend/disabled state.
   */
  @Get('paymaster/budget')
  async getPaymasterBudget(): Promise<PaymasterBudgetSnapshot> {
    return this.paymasterPolicyService.getBudgetSnapshot();
  }

  /**
   * POST /admin/paymaster/budget/reset
   *
   * Reset the paymaster spend counters. Pass an `address` in the body to reset
   * a single address; omit it to reset the entire paymaster budget (re-enabling
   * all auto-disabled addresses).
   *
   * Body: { "address"?: string }
   */
  @Post('paymaster/budget/reset')
  @HttpCode(HttpStatus.OK)
  async resetPaymasterBudget(
    @Body() body: ResetBudgetDto,
  ): Promise<{ resets: string }> {
    await this.paymasterPolicyService.resetBudget(body.address);
    return { resets: body.address ?? 'all' };
  }

  /**
   * GET /admin/audit?callId=<optional>
   * Returns immutable audit log entries, optionally filtered by callId.
   */
  @Get('audit')
  async getAuditLogs(
    @Query('callId') callId?: string,
  ): Promise<AuditLog[]> {
    return this.auditLogService.query(callId);
  }
}
