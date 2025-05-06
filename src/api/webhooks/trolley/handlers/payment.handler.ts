import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentProcessedEventData,
  PaymentWebhookEvent,
} from './payment.types';
import { WebhookEvent } from '../../webhooks.decorators';
import { PaymentsService } from 'src/shared/payments';
import { payment_status } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

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
    }

    if (payload.status !== 'processed') {
      await this.updatePaymentStates(
        winningIds,
        externalTransactionId,
        payload.status.toUpperCase() as payment_status,
        payload.status.toUpperCase(),
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
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      try {
        await this.paymentsService.updatePaymentProcessingState(
          winningIds,
          processingState,
          tx,
        );

        await this.paymentsService.updatePaymentReleaseState(
          paymentId,
          releaseState,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update payment statuses: ${error.message}`,
        );
        throw error;
      }
    });
  }
}
