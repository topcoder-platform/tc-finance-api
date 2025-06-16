import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '../../webhooks.decorators';
import { PrismaService } from 'src/shared/global/prisma.service';
import { PaymentsService } from 'src/shared/payments';
import { Logger } from 'src/shared/global';
import {
  RecipientVerificationStatusUpdateEventData,
  RecipientVerificationWebhookEvent,
} from './recipient-verification.types';
import { Prisma, verification_status } from '@prisma/client';

@Injectable()
export class RecipientVerificationHandler {
  private readonly logger = new Logger(RecipientVerificationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @WebhookEvent(RecipientVerificationWebhookEvent.statusUpdated)
  async handleStatusUpdated(
    payload: RecipientVerificationStatusUpdateEventData,
  ): Promise<void> {
    const recipient = await this.prisma.trolley_recipient.findFirst({
      where: { trolley_id: payload.recipientId },
    });

    if (!recipient) {
      this.logger.error(
        `Recipient with trolley_id ${payload.recipientId} not found.`,
      );
      throw new Error(
        `Recipient with trolley_id ${payload.recipientId} not found.`,
      );
    }

    const userIDV =
      await this.prisma.user_identity_verification_associations.findFirst({
        where: {
          user_id: recipient.user_id,
        },
      });

    const verificationData: Prisma.user_identity_verification_associationsCreateInput =
      {
        user_id: recipient.user_id,
        verification_id: payload.id,
        date_filed: payload.submittedAt ?? new Date(),
        verification_status:
          payload.status === 'approved'
            ? verification_status.ACTIVE
            : verification_status.INACTIVE,
      };

    if (userIDV) {
      await this.prisma.user_identity_verification_associations.update({
        where: {
          id: userIDV.id,
        },
        data: { ...verificationData },
      });
    } else {
      await this.prisma.user_identity_verification_associations.create({
        data: { ...verificationData },
      });
    }

    await this.paymentsService.reconcileUserPayments(recipient.user_id);
  }
}
