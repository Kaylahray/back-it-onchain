import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { IndexerWebhookDto } from './dto/indexer-webhook.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import { HmacSignatureGuard } from '../common/guards/hmac-signature.guard';

@Controller('config')
export class IndexerController {
  constructor(private readonly indexerService: IndexerService) {}

  @Get()
  async getConfig() {
    return this.indexerService.getPlatformSettings();
  }
}

/**
 * BE-32 — inbound webhook for an external indexer to push contract events
 * without needing a persistent RPC connection to the backend.
 *
 * Protected by two independent layers, both required:
 *   - AdminGuard: the caller must present the `x-admin-api-key` header.
 *   - HmacSignatureGuard: the caller must sign the exact raw body with
 *     `INDEXER_WEBHOOK_SECRET` (X-Signature header) and supply a nonce
 *     that hasn't been used in the last 10 minutes (replay protection).
 */
@Controller('indexer')
export class IndexerWebhookController {
  constructor(private readonly indexerService: IndexerService) {}

  @Post('webhook')
  @HttpCode(200)
  @UseGuards(AdminGuard, HmacSignatureGuard)
  async handleWebhook(@Body() dto: IndexerWebhookDto) {
    return this.indexerService.processWebhookEvent(dto);
  }
}
