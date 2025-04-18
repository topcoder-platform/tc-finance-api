import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';

@Injectable()
export class TopcoderM2MService {
  /**
   * Retrieves a Machine-to-Machine (M2M) token from the Auth0 service.
   *
   * @returns {Promise<string | undefined>} A promise that resolves to the M2M token as a string
   *
   * @throws {Error} Logs an error message to the console if the token retrieval fails.
   *
   * Environment Variables:
   * - `AUTH0_TC_PROXY_URL`: The base URL for the Auth0 proxy.
   * - `AUTH0_M2M_TOKEN_URL`: The URL for obtaining the M2M token.
   * - `AUTH0_M2M_CLIENT_ID`: The client ID for the M2M application.
   * - `AUTH0_M2M_SECRET`: The client secret for the M2M application.
   * - `AUTH0_M2M_AUDIENCE`: The audience for the M2M token.
   * - `AUTH0_M2M_GRANT_TYPE`: The grant type for the M2M token request.
   */
  async getToken(): Promise<string | undefined> {
    const tokenURL = `${ENV_CONFIG.AUTH0_TC_PROXY_URL}/token`;
    try {
      const response = await fetch(tokenURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth0_url: `${ENV_CONFIG.AUTH0_M2M_TOKEN_URL}/oauth/token`,
          client_id: ENV_CONFIG.AUTH0_M2M_CLIENT_ID,
          client_secret: ENV_CONFIG.AUTH0_M2M_SECRET,
          audience: ENV_CONFIG.AUTH0_M2M_AUDIENCE,
          grant_type: ENV_CONFIG.AUTH0_M2M_GRANT_TYPE,
        }),
      });

      const jsonResponse = await response.json();
      const m2mToken = jsonResponse.access_token as string;

      return m2mToken;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed fetching TC M2M Token!', error);
      return undefined;
    }
  }
}
