import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  Length,
} from 'class-validator';

/**
 * Event types the external indexer can push via the webhook.
 * Mirrors the on-chain events already handled by IndexerService's
 * live ethers.js listener (see CALL_REGISTRY_ABI in indexer.service.ts).
 */
export enum IndexerWebhookEventType {
  CALL_CREATED = 'CallCreated',
  STAKE_ADDED = 'StakeAdded',
  CALL_RESOLVED = 'CallResolved',
  ADMIN_PARAMS_CHANGED = 'AdminParamsChanged',
}

/**
 * Body of `POST /indexer/webhook`.
 *
 * `nonce` must be unique per callback — it is the replay guard key, held
 * in cache for 10 minutes (see IndexerWebhookGuard). `data` is validated
 * per-event-type inside IndexerService.processWebhookEvent.
 */
export class IndexerWebhookDto {
  @IsEnum(IndexerWebhookEventType)
  eventType: IndexerWebhookEventType;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  nonce: string;

  @IsObject()
  data: Record<string, unknown>;
}
