import url from 'url';
import crypto from 'crypto';
import trolley from 'trolleyhq';
import { pick } from 'lodash';
import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

const TROLLEY_ACCESS_KEY = ENV_CONFIG.TROLLEY_ACCESS_KEY;
const TROLLEY_SECRET_KEY = ENV_CONFIG.TROLLEY_SECRET_KEY;
const TROLLEY_WIDGET_BASE_URL = ENV_CONFIG.TROLLEY_WIDGET_BASE_URL;

export interface RecipientTaxDetails {
  primaryCurrency: string | null;
  estimatedFees: string | null;
  taxWithholdingPercentage: string | null;
  payoutMethod: 'paypal' | 'bank-transfer';
}

const client = trolley({
  key: TROLLEY_ACCESS_KEY,
  secret: TROLLEY_SECRET_KEY,
});

/**
 * Determines if the provided validation errors indicate an "insufficient funds" error.
 */
const isInsufficientFundsError = ({
  validationErrors,
}: {
  validationErrors: { code: string }[];
}) =>
  validationErrors.length === 1 &&
  validationErrors[0].code === 'non_sufficient_funds';

/**
 * Determines if the provided validation errors indicate a duplicate payment error.
 */
const isDuplicatePaymentError = ({
  validationErrors,
}: {
  validationErrors: { code: string; field: string }[];
}) =>
  validationErrors.length === 1 &&
  validationErrors[0].code === 'duplicate' &&
  validationErrors[0].field === 'externalId';

@Injectable()
export class TrolleyService {
  private readonly logger = new Logger(`global/TrolleyService`);

  get client() {
    return client;
  }

  /**
   * Generates a recipient-specific portal URL for the Trolley widget.
   *
   * @param recipient - recipient's details
   * @returns A string representing the fully constructed and signed URL for the Trolley widget.
   *
   * @throws This function assumes that `TROLLEY_WIDGET_BASE_URL`, `TROLLEY_ACCESS_KEY`,
   * and `TROLLEY_SECRET_KEY` are defined and valid. Ensure these constants are properly set.
   */
  getRecipientPortalUrl(recipient: { email: string; userId: string }) {
    const widgetBaseUrl = new url.URL(TROLLEY_WIDGET_BASE_URL);
    const querystring = new url.URLSearchParams({
      ts: `${Math.floor(new Date().getTime() / 1000)}`,
      key: TROLLEY_ACCESS_KEY,
      email: recipient.email,
      refid: recipient.userId,
      hideEmail: 'false',
      roEmail: 'true',
      locale: 'en',
      products: 'pay,tax',
    } as Record<string, string>)
      .toString()
      .replace(/\+/g, '%20');

    const hmac = crypto.createHmac('sha256', TROLLEY_SECRET_KEY);
    hmac.update(querystring);

    // Signature is only valid for 30 seconds
    const signature = hmac.digest('hex');
    widgetBaseUrl.search = querystring + '&sign=' + signature;

    // you can send the link to your view engine
    return widgetBaseUrl.toString();
  }

  async startBatchPayment(batchDescription: string) {
    try {
      const paymentBatch = await this.client.batch.create(
        { description: batchDescription, sourceCurrency: 'USD' },
        [],
      );

      this.logger.debug(
        `Created trolley payment batch with id ${paymentBatch.id}`,
      );

      return paymentBatch;
    } catch (error) {
      const errorMsg = `Failed to create trolley batch payment: '${error.message}'!`;
      this.logger.error(errorMsg, error);
      throw new Error(errorMsg);
    }
  }

  async createPayment(
    recipientId: string,
    paymentBatchId: string,
    totalAmount: number,
    transactionId: string,
    paymentMemo?: string,
  ) {
    const paymentPayload = {
      recipient: {
        id: recipientId,
      },
      amount: totalAmount.toFixed(2),
      currency: 'USD',
      memo: paymentMemo ?? 'Topcoder payment',
      externalId: transactionId,
    };

    try {
      const payment = await this.client.payment.create(
        paymentBatchId,
        paymentPayload,
      );

      this.logger.debug(`Created trolley payment with id ${payment.id}`);

      return payment;
    } catch (error) {
      this.logger.error(
        `Failed to create trolley payment: '${error.message}'!`,
        paymentPayload,
        error.validationErrors
          ? { validationErrors: error.validationErrors }
          : undefined,
      );

      if (isDuplicatePaymentError(error)) {
        throw new Error('Duplicate payment detected!');
      } else {
        throw new Error(`Failed to create trolley payment: ${error.message}!`);
      }
    }
  }

  async startProcessingPayment(paymentBatchId: string) {
    try {
      // generate quote
      await this.client.batch.generateQuote(paymentBatchId);

      // trigger trolley payment (batch) process
      await this.client.batch.startProcessing(paymentBatchId);
    } catch (error) {
      // payments with insufficient funds error are still created in trolley,
      // and they are storred as "pending".
      // no need to do anything. just log a warning, and move on
      if (isInsufficientFundsError(error)) {
        this.logger.warn(
          `Insufficient funds while processing payment: ${error.validationErrors}`,
        );
        return;
      }

      this.logger.error(
        `Failed to process trolley payment batch: ${error.message}`,
        error.validationErrors
          ? { validationErrors: error.validationErrors }
          : undefined,
      );
      throw new Error('Failed to process trolley payment batch!');
    }
  }

  async getRecipientPayoutDetails(
    recipientId: string,
  ): Promise<RecipientTaxDetails | void> {
    try {
      const recipient = await this.client.recipient.find(recipientId);
      const payoutDetails = pick(recipient, [
        'estimatedFees',
        'primaryCurrency',
        'taxWithholdingPercentage',
        'payoutMethod',
      ]);

      if ((recipient as any).payoutMethod === 'paypal') {
        payoutDetails.estimatedFees =
          (recipient as any).gatewayFees?.paypal?.value ?? 0;
      }

      return payoutDetails as RecipientTaxDetails;
    } catch (error) {
      this.logger.error(
        'Failed to load recipient tax & payout details from trolley!',
        error,
      );
      return {} as RecipientTaxDetails;
    }
  }
}
