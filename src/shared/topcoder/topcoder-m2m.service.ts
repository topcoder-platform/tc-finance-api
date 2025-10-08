import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

@Injectable()
export class TopcoderM2MService {
  private readonly logger = new Logger(TopcoderM2MService.name);

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
          // fresh_token: true,
        }),
      });

      const jsonResponse = await response.json();
      const m2mToken = jsonResponse.access_token as string;

      return m2mToken;
    } catch (error) {
      this.logger.error('Failed fetching TC M2M Token!', error);
      return undefined;
    }
  }

  async m2mFetch<T = unknown>(url: string | URL, options = {} as RequestInit) {
    let m2mToken: string | undefined;
    try {
      m2mToken = await this.getToken();
    } catch (e) {
      this.logger.error(
        'Failed to fetch m2m token!',
        e.message ?? e,
      );
    }

    if (!m2mToken) {
      throw new Error('Failed to fetch m2m token for m2m call!')
    }

    // Initialize headers, ensuring Authorization is added
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${m2mToken}`);

    if (!headers.get('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const finalOptions: RequestInit = {
      ...options,
      headers,
    };

    const response = await fetch(url, finalOptions);

    if (!response.ok) {
      // Optional: You could throw a custom error here
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    // Try to parse JSON if content-type is application/json
    if (contentType && contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    // If not JSON, return text
    return response.text() as unknown as T;
  }
}
