import { Injectable } from '@nestjs/common';
import {
  PaymentProcessedEventData,
  PaymentProcessedEventStatus,
  PaymentWebhookEvent,
} from './payment.types';
import { WebhookEvent } from '../../webhooks.decorators';
import { PaymentsService } from 'src/shared/payments';
import { payment_status } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';
import { JsonObject } from '@prisma/client/runtime/library';
import { Logger } from 'src/shared/global';

@Injectable()
export class PaymentHandler {
  private readonly logger = new Logger(PaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @WebhookEvent(
    PaymentWebhookEvent.processed,
    PaymentWebhookEvent.failed,
    PaymentWebhookEvent.returned,
  )
  async handlePaymentProcessed(
    payload: PaymentProcessedEventData,
  ): Promise<any> {
    const paymentId = payload.externalId as string;

    if (payload.status !== PaymentProcessedEventStatus.PROCESSED) {
      await this.updatePaymentStates(
        paymentId,
        payload.status.toUpperCase() as payment_status,
        payload.status.toUpperCase(),
        {
          failureMessage: payload.failureMessage,
          returnedNote: payload.returnedNote,
          errors: payload.errors?.join(', '),
        },
      );

      return;
    }

    await this.updatePaymentStates(paymentId, payment_status.PAID, 'PROCESSED');
  }

  private async updatePaymentStates(
    paymentId: string,
    processingState: payment_status,
    releaseState: string,
    metadata?: JsonObject,
  ): Promise<void> {
    const winningIds = (
      await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT winnings_id as id
      FROM payment p
      INNER JOIN payment_release_associations pra
      ON pra.payment_id = p.payment_id
      WHERE pra.payment_release_id::text = ${paymentId}
      FOR UPDATE
    `
    ).map((w) => w.id);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.paymentsService.updatePaymentProcessingState(
          winningIds,
          processingState,
          tx,
        );

        await this.paymentsService.updatePaymentReleaseState(
          paymentId,
          releaseState,
          tx,
          metadata,
        );
      });
    } catch (error) {
      this.logger.error(
        `Failed to update payment states for paymentId: ${paymentId}, winnings: ${winningIds.join(',')}, error: ${error.message}`,
        error,
      );
      throw error;
    }
  }
}
