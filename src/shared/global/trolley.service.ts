import url from 'url';
import crypto from 'crypto';
import trolley from 'trolleyhq';
import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';


const TROLLEY_ACCESS_KEY = ENV_CONFIG.TROLLEY_ACCESS_KEY;
const TROLLEY_SECRET_KEY = ENV_CONFIG.TROLLEY_SECRET_KEY;
const TROLLEY_WIDGET_BASE_URL = ENV_CONFIG.TROLLEY_WIDGET_BASE_URL;

const client = trolley({
  key: TROLLEY_ACCESS_KEY as string,
  secret: TROLLEY_SECRET_KEY as string,
});

@Injectable()
export class TrolleyService {
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
    const widgetBaseUrl = new url.URL(TROLLEY_WIDGET_BASE_URL as string);
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

    const hmac = crypto.createHmac('sha256', TROLLEY_SECRET_KEY as string);
    hmac.update(querystring);

    // Signature is only valid for 30 seconds
    const signature = hmac.digest('hex');
    widgetBaseUrl.search = querystring + '&sign=' + signature;

    // you can send the link to your view engine
    return widgetBaseUrl.toString();
  }
}
