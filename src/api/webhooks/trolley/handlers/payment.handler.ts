import { Injectable } from '@nestjs/common';
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

    if (!winningIds.length) {
      console.error(
        `No matching payments in our db to process for incoming payment.processed with memo '${payload.memo}'.`,
      );
    }

    if (payload.status !== 'processed') {
      await this.prisma.$transaction(async (tx) => {
        await this.paymentsService.updatePaymentProcessingState(
          winningIds,
          payment_status.PROCESSING,
          tx,
        );

        await this.paymentsService.updatePaymentReleaseState(
          payload.id,
          'FAILED',
        );
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.paymentsService.updatePaymentProcessingState(
        winningIds,
        payment_status.PAID,
        tx,
      );

      await this.paymentsService.updatePaymentReleaseState(
        payload.id,
        'PROCESSED',
      );
    });
  }
}
