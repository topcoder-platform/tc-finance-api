import url from 'url';
import crypto from 'crypto';
import trolley, { Batch } from 'trolleyhq';
import { Injectable, Logger } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';

const TROLLEY_ACCESS_KEY = ENV_CONFIG.TROLLEY_ACCESS_KEY;
const TROLLEY_SECRET_KEY = ENV_CONFIG.TROLLEY_SECRET_KEY;
const TROLLEY_WIDGET_BASE_URL = ENV_CONFIG.TROLLEY_WIDGET_BASE_URL;

const client = trolley({
  key: TROLLEY_ACCESS_KEY,
  secret: TROLLEY_SECRET_KEY,
});

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

  async startBatchPayment(
    recipientId: string,
    description: string,
    totalAmount: number,
    winningsIds: string[],
  ) {
    let paymentBatch: Batch;

    try {
      paymentBatch = await this.client.batch.create(
        { description, sourceCurrency: 'USD' },
        [],
      );

      this.logger.debug(`Created payment batch with id ${paymentBatch.id}`);
    } catch (e) {
      this.logger.error(
        `Failed to create batch payment, error '${e.message}'!`,
      );
      return;
    }

    try {
      const payment = await this.client.payment.create(paymentBatch.id, {
        recipient: {
          id: recipientId,
        },
        sourceAmount: totalAmount.toString(),
        sourceCurrency: 'USD',
        memo: 'Topcoder payment',
        // TODO: remove `,${Date.now()}`
        // if externalId is present, it must be unique
        externalId: `${winningsIds.join(',')},${Date.now()}`,
      });

      this.logger.debug(`Created payment with id ${payment.id}`);

      return paymentBatch;
    } catch (e) {
      this.logger.error(`Failed to create payment, error '${e.message}'!`);
    }
  }
}
