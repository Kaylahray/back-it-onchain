import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { CallsService } from '../calls/calls.service';

class CircuitBreakerDto {
  paused!: boolean;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly callsService: CallsService,
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
   * POST /admin/disputes/:id/resolve
   * Resolve an open dispute. Body: { upheld: boolean }
   */
  @Post('disputes/:id/resolve')
  resolveDispute(
    @Param('id') id: string,
    @Body('upheld') upheld: boolean,
    @Request() req: any,
  ) {
    const adminWallet: string = req.headers['x-admin-wallet'] ?? 'admin';
    return this.callsService.resolveDispute(id, adminWallet, Boolean(upheld));
  }
}
