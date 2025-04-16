import { SetMetadata } from '@nestjs/common';

export const WEBHOOK_EVENT_METADATA_KEY = 'WH_EVENT_TYPE';
export const WebhookEvent = (...events: string[]) =>
  SetMetadata(WEBHOOK_EVENT_METADATA_KEY, events);
