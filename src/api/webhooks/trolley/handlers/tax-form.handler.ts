import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '../../webhooks.decorators';
import {
  TaxFormStatus,
  TaxFormStatusUpdatedEvent,
  TaxFormStatusUpdatedEventData,
  TrolleyWebhookEvent,
} from '../trolley.types';
import { PrismaService } from 'src/shared/global/prisma.service';
import { tax_form_status, trolley_recipient } from '@prisma/client';

@Injectable()
export class TaxFormHandler {
  constructor(private readonly prisma: PrismaService) {}

  getDbRecipientById(id: string) {
    return this.prisma.trolley_recipient.findUnique({
      where: { trolley_id: id },
    });
  }

  async createOrUpdateTaxFormAssociation(
    taxFormId: string,
    recipient: trolley_recipient,
    taxFormData: TaxFormStatusUpdatedEventData,
  ) {
    const taxFormStatus =
      taxFormData.status === TaxFormStatus.Reviewed
        ? tax_form_status.ACTIVE
        : tax_form_status.INACTIVE;

    const existingFormAssociation =
      await this.prisma.user_tax_form_associations.findFirst({
        where: {
          user_id: recipient.user_id,
          tax_form_id: taxFormId,
          tax_form_status: tax_form_status.ACTIVE,
        },
      });

    if (!existingFormAssociation) {
      return this.prisma.user_tax_form_associations.create({
        data: {
          user_id: recipient.user_id,
          tax_form_status: taxFormStatus,
          date_filed: taxFormData.signedAt,
          tax_form_id: taxFormId,
        },
      });
    }

    // voided forms associations are removed from DB
    if (taxFormData.status === TaxFormStatus.Voided) {
      return this.prisma.user_tax_form_associations.delete({
        where: {
          id: existingFormAssociation.id,
        },
      });
    }

    return this.prisma.user_tax_form_associations.update({
      where: { id: existingFormAssociation?.id },
      data: {
        tax_form_status: taxFormStatus,
        date_filed: taxFormData.signedAt,
      },
    });
  }

  /**
   * Handles the "TaxFormStatusUpdated" event by processing the tax form data
   * and updating the associated recipient information in the database.
   *
   * @param payload - The event payload containing the updated tax form data.
   * @returns A promise that resolves when the operation is complete.
   *
   * @remarks
   * - If the recipient associated with the tax form cannot be found in the database,
   *   an error is logged and the operation is terminated.
   * - If the recipient is found, the tax form association is created or updated
   *   in the database.
   */
  @WebhookEvent(TrolleyWebhookEvent.taxFormStatusUpdated)
  async handleTaxFormStatusUpdated(
    payload: TaxFormStatusUpdatedEvent,
  ): Promise<void> {
    const taxFormData = payload.taxForm.data;
    const recipient = await this.getDbRecipientById(taxFormData.recipientId);

    if (!recipient) {
      console.error(
        `Recipient not found for recipientId '${taxFormData.recipientId}' in taxForm with id '${taxFormData.taxFormId}'`,
      );
      return;
    }

    await this.createOrUpdateTaxFormAssociation(
      taxFormData.taxFormId,
      recipient,
      taxFormData,
    );
  }
}
