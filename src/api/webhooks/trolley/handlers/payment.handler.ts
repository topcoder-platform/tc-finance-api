import { Injectable, Logger } from '@nestjs/common';
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
    // TODO: remove slice-1
    const winningIds = (payload.externalId ?? '').split(',').slice(0, -1);
    const externalTransactionId = payload.batch.id;

    if (!winningIds.length) {
      this.logger.error(
        `No valid winning IDs found in the externalId: ${payload.externalId}`,
      );
      throw new Error('No valid winning IDs found in the externalId!');
    }

    if (payload.status !== PaymentProcessedEventStatus.PROCESSED) {
      await this.updatePaymentStates(
        winningIds,
        externalTransactionId,
        payload.status.toUpperCase() as payment_status,
        payload.status.toUpperCase(),
        { failureMessage: payload.failureMessage },
      );

      return;
    }

    await this.updatePaymentStates(
      winningIds,
      externalTransactionId,
      payment_status.PAID,
      'PROCESSED',
    );
  }

  private async updatePaymentStates(
    winningIds: string[],
    paymentId: string,
    processingState: payment_status,
    releaseState: string,
    metadata?: JsonObject,
  ): Promise<void> {
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
        error.stack,
      );
      throw error;
    }
  }
}
