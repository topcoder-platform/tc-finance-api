import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '../../webhooks.decorators';
import { PrismaService } from 'src/shared/global/prisma.service';
import {
  RecipientAccountDeleteEventData,
  RecipientAccountEventData,
  RecipientAccountWebhookEvent,
} from './recipient-account.types';
import { payment_method_status } from '@prisma/client';
import { PaymentsService } from 'src/shared/payments';

@Injectable()
export class RecipientAccountHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Updates the status of the related trolley user_payment_method based on the presence of primary
   * Trolley payment methods associated with the recipient.
   *
   * @param recipientId - The unique identifier of the recipient in the Trolley system.
   */
  async updateUserPaymentMethod(recipientId: string) {
    const recipient = await this.prisma.trolley_recipient.findFirst({
      where: { trolley_id: recipientId },
      include: {
        user_payment_methods: true,
        trolley_recipient_payment_methods: true,
      },
    });

    if (!recipient) {
      console.error(
        `Recipient not found for recipientId '${recipientId}' while updating user payment method!`,
      );
      return;
    }

    const hasPrimaryTrolleyPaymentMethod =
      !!recipient.trolley_recipient_payment_methods.length;

    await this.prisma.user_payment_methods.update({
      where: { id: recipient.user_payment_method_id },
      data: {
        status: hasPrimaryTrolleyPaymentMethod
          ? payment_method_status.CONNECTED
          : payment_method_status.INACTIVE,
      },
    });
  }

  /**
   * Handles the creation or update of a recipient account event.
   *
   * This method processes the payload to manage the recipient's payment methods
   * in the database. It performs the following actions:
   * - Creates a new payment method if it doesn't exist and is marked as primary.
   * - Updates an existing payment method if it is marked as primary.
   * - Deletes an existing payment method if it matches the provided account ID
   *   and is marked as inactive.
   * - Updates the user's payment method after processing the recipient account.
   *
   * @param payload - The data associated with the recipient account event.
   */
  @WebhookEvent(
    RecipientAccountWebhookEvent.created,
    RecipientAccountWebhookEvent.updated,
  )
  async handleCreatedOrUpdate(
    payload: RecipientAccountEventData,
  ): Promise<void> {
    const { recipientId, recipientAccountId } = payload;
    const isPrimaryPaymentMethod =
      payload.status === 'primary' && payload.primary === true;

    const recipient = await this.prisma.trolley_recipient.findFirst({
      where: { trolley_id: recipientId },
      include: {
        user_payment_methods: true,
        trolley_recipient_payment_methods: true,
      },
    });

    if (!recipient) {
      console.error(
        `Recipient not found for recipientId '${recipientId}' while updating user payment method!`,
      );
      return;
    }

    const recipientPaymentMethod =
      recipient.trolley_recipient_payment_methods[0];

    // create the payment method if doesn't exist & it was set to primary in trolley
    if (!recipientPaymentMethod && isPrimaryPaymentMethod) {
      await this.prisma.trolley_recipient_payment_method.create({
        data: {
          trolley_recipient_id: recipient.id,
          recipient_account_id: recipientAccountId,
        },
      });
    }

    // no recipient, and payment method is not primary in trolley, return and do nothing
    if (!recipientPaymentMethod && !isPrimaryPaymentMethod) {
      return;
    }

    // update the payment method if it exists & it was set to primary in trolley
    if (recipientPaymentMethod && isPrimaryPaymentMethod) {
      await this.prisma.trolley_recipient_payment_method.update({
        where: { id: recipientPaymentMethod.id },
        data: {
          recipient_account_id: recipientAccountId,
        },
      });
    }

    // remove the payment method if it exists (with the same ID) and it was set as inactive in trolley
    if (
      recipientPaymentMethod &&
      !isPrimaryPaymentMethod &&
      recipientPaymentMethod.recipient_account_id === recipientAccountId
    ) {
      await this.prisma.trolley_recipient_payment_method.delete({
        where: { id: recipientPaymentMethod.id },
      });
    }

    await this.updateUserPaymentMethod(payload.recipientId);

    await this.paymentsService.reconcileUserPayments(recipient.user_id);
  }

  /**
   * Handles the deletion of a recipient account by removing the associated
   * recipient payment method and updating the user's payment method.
   *
   * @param payload - The event data containing the ID of the recipient account to be deleted.
   *
   * @remarks
   * - If no recipient payment method is found for the given recipient account ID,
   *   a log message is generated, and the method exits without performing any further actions.
   * - Deletes the recipient payment method associated with the given recipient account ID.
   * - Updates the user's payment method using the trolley ID of the associated recipient.
   */
  @WebhookEvent(RecipientAccountWebhookEvent.deleted)
  async handleDeleted(payload: RecipientAccountDeleteEventData): Promise<void> {
    const recipientPaymentMethod =
      await this.prisma.trolley_recipient_payment_method.findFirst({
        where: { recipient_account_id: payload.id },
        include: { trolley_recipient: true },
      });

    if (!recipientPaymentMethod) {
      console.info(
        `Recipient payment method not found for recipient account id '${payload.id}' while deleting trolley payment method!`,
      );
      return;
    }

    await this.prisma.trolley_recipient_payment_method.delete({
      where: { id: recipientPaymentMethod.id },
    });

    await this.updateUserPaymentMethod(
      recipientPaymentMethod.trolley_recipient.trolley_id,
    );

    await this.paymentsService.reconcileUserPayments(
      recipientPaymentMethod.trolley_recipient.user_id,
    );
  }
}
