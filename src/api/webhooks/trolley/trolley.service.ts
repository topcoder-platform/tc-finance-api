import crypto from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { trolley_webhook_log, webhook_status } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';
import { ENV_CONFIG } from 'src/config';

export enum TrolleyHeaders {
  id = 'x-paymentrails-delivery',
  signature = 'x-paymentrails-signature',
  created = 'x-paymentrails-created',
}

const trolleyWhHmac = ENV_CONFIG.TROLLEY_WH_HMAC;
if (!trolleyWhHmac) {
  throw new Error('TROLLEY_WH_HMAC is not set!');
}

/**
 * Service responsible for handling Trolley webhook operations.
 */
@Injectable()
export class TrolleyService {
  constructor(
    @Inject('trolleyHandlerFns')
    private readonly handlers,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Validates the webhook signature to ensure the request is authentic.
   *
   * @param headers - The HTTP request headers containing the signature.
   * @param bodyPayload - The raw body payload of the webhook request.
   * @returns A boolean indicating whether the signature is valid.
   */
  validateSignature(headers: Request['headers'], bodyPayload: string): boolean {
    const headerSignature = headers[TrolleyHeaders.signature] ?? '';
    if (!headerSignature || !headerSignature.match(/t=\d+,v1=[a-f0-9]{64}/i)) {
      return false;
    }

    const headerSignatureValues = headerSignature.split(',');
    const t = headerSignatureValues[0].split('=')[1];
    const v1 = headerSignatureValues[1].split('=')[1];

    const hmac = crypto.createHmac('sha256', trolleyWhHmac as string);
    hmac.update(`${t}${bodyPayload}`);
    const digest = hmac.digest('hex');

    return digest === v1;
  }

  /**
   * Validates whether the webhook event is unique by checking its ID against the database.
   *
   * @param headers - The HTTP request headers containing the webhook ID.
   * @returns A promise that resolves to a boolean indicating whether the webhook event is unique.
   */
  async validateUnique(headers: Request['headers']): Promise<boolean> {
    const requestId = headers[TrolleyHeaders.id];

    if (!requestId) {
      return false;
    }

    const whEvent = await this.prisma.trolley_webhook_log.findUnique({
      where: { event_id: requestId },
    });
    return !whEvent;
  }

  /**
   * Tracks the webhook events status by Updating or creating a record in the `trolley_webhook_log` table with the given event details.
   *
   * @param requestId - The unique identifier for the webhook event.
   * @param status - The status of the webhook event.
   * @param payload - (Optional) The payload associated with the webhook event.
   * @param meta - (Optional) Additional metadata for the webhook event, such as event time.
   * @returns A promise that resolves to the upserted `trolley_webhook_log` record.
   */
  setEventState(
    requestId: string,
    status: webhook_status,
    payload?: any,
    meta?: Partial<trolley_webhook_log>,
  ) {
    return this.prisma.trolley_webhook_log.upsert({
      where: {
        event_id: requestId,
      },
      create: {
        event_id: requestId,
        event_payload: JSON.stringify(payload ?? {}),
        event_time: meta?.event_time,
        event_model: payload?.model ?? '',
        event_action: payload?.action ?? '',
        status,
        created_by: 'system',
      } as trolley_webhook_log,
      update: {
        status,
        ...meta,
      },
    });
  }

  /**
   * Handles incoming webhook events by processing the payload and delegating
   * the event to the appropriate handler based on the model and action.
   *
   * @param headers - The headers of the incoming request, containing metadata
   * such as the event ID and creation time.
   * @param payload - The body of the webhook event, containing details such as
   * the model, action, and event-specific data.
   */
  async handleEvent(headers: Request['headers'], payload: any) {
    const requestId = headers[TrolleyHeaders.id];

    try {
      await this.setEventState(requestId, webhook_status.logged, payload, {
        event_time: headers[TrolleyHeaders.created],
      });

      const { model, action, body } = payload;
      const handler = this.handlers.get(`${model}.${action}`);
      // do nothing if there's no handler for the event (event was logged in db)
      if (!handler) {
        return;
      }

      await handler(body);
      await this.setEventState(requestId, webhook_status.processed);
    } catch (e) {
      await this.setEventState(requestId, webhook_status.error, void 0, {
        error_message: e.message ?? e,
      });
    }
  }
}
