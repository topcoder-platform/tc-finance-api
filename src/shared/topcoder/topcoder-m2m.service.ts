import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

/**
 * Error raised when a Topcoder M2M-backed HTTP request receives a non-2xx
 * response.
 *
 * The error carries the upstream status code and response body so callers can
 * translate validation failures into their own Nest exceptions without losing
 * the source API's message.
 */
export class TopcoderM2MHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly responseBody: unknown;
  readonly response: {
    data: unknown;
    status: number;
    statusText: string;
  };
  readonly url: string;
  readonly method: string;
  readonly requestBody?: unknown;

  /**
   * Creates an M2M HTTP error with the upstream response metadata.
   * @param params upstream request and response values.
   */
  constructor(params: {
    method: string;
    requestBody?: unknown;
    responseBody: unknown;
    status: number;
    statusText: string;
    upstreamMessage?: string;
    url: string;
  }) {
    super(params.upstreamMessage || `HTTP error! Status: ${params.status}`);
    Object.setPrototypeOf(this, TopcoderM2MHttpError.prototype);
    this.name = TopcoderM2MHttpError.name;
    this.status = params.status;
    this.statusText = params.statusText;
    this.responseBody = params.responseBody;
    this.response = {
      data: params.responseBody,
      status: params.status,
      statusText: params.statusText,
    };
    this.url = params.url;
    this.method = params.method;
    this.requestBody = params.requestBody;
  }
}

@Injectable()
export class TopcoderM2MService {
  private readonly logger = new Logger(TopcoderM2MService.name);

  private readonly topcoderApiBaseUrl = this.parseTopcoderApiBaseUrl();

  /**
   * Parses the configured Topcoder API base URL used as the M2M request
   * allow-list boundary.
   *
   * @returns A normalized HTTP(S) URL without credentials, query, or fragment.
   * @throws Error when the configured base URL is not safe to use.
   */
  private parseTopcoderApiBaseUrl(): URL {
    let baseUrl: URL;

    try {
      baseUrl = new URL(ENV_CONFIG.TOPCODER_API_V6_BASE_URL);
    } catch {
      throw new Error('TOPCODER_API_V6_BASE_URL must be a valid URL');
    }

    if (
      !['http:', 'https:'].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      throw new Error('TOPCODER_API_V6_BASE_URL must be a safe HTTP(S) URL');
    }

    return baseUrl;
  }

  /**
   * Rejects raw or percent-encoded dot segments before the URL is normalized,
   * along with encoded query or fragment delimiters that could make different
   * URL decoders disagree about the path boundary. This prevents
   * user-controlled values from selecting a sibling route.
   *
   * @param rawUrl Unparsed absolute request URL.
   * @throws Error when the path is malformed or contains traversal segments.
   */
  private assertNoPathTraversal(rawUrl: string): void {
    let decodedPath = rawUrl.split(/[?#]/, 1)[0].replace(/\\/g, '/');

    for (let decodeDepth = 0; decodeDepth <= 5; decodeDepth += 1) {
      if (
        decodedPath.split('/').some((segment) => ['.', '..'].includes(segment))
      ) {
        throw new Error('M2M request URL path traversal is not allowed');
      }

      let nextDecodedPath: string;
      try {
        nextDecodedPath = decodeURIComponent(decodedPath).replace(/\\/g, '/');
      } catch {
        throw new Error('M2M request URL contains invalid percent encoding');
      }

      if (/[?#]/.test(nextDecodedPath)) {
        throw new Error('M2M request URL contains an encoded path delimiter');
      }

      if (nextDecodedPath === decodedPath) {
        return;
      }

      if (decodeDepth === 5) {
        throw new Error('M2M request URL is excessively percent encoded');
      }
      decodedPath = nextDecodedPath;
    }
  }

  /**
   * Validates and reconstructs an M2M request URL from the configured origin.
   * Only the configured API base path and its descendants are permitted.
   *
   * @param url Candidate request URL.
   * @returns A new credential-free URL constrained to the configured API.
   * @throws Error when the URL is invalid or outside the allow-list boundary.
   */
  private toSafeM2MUrl(url: string | URL): URL {
    const rawUrl = String(url);
    this.assertNoPathTraversal(rawUrl);

    let candidateUrl: URL;
    try {
      candidateUrl = new URL(rawUrl);
    } catch {
      throw new Error('M2M request URL must be a valid absolute URL');
    }

    if (
      candidateUrl.username ||
      candidateUrl.password ||
      candidateUrl.hash ||
      candidateUrl.origin !== this.topcoderApiBaseUrl.origin
    ) {
      throw new Error('M2M request URL is outside the configured API origin');
    }

    const configuredBasePath =
      this.topcoderApiBaseUrl.pathname.replace(/\/+$/, '') || '/';
    const isWithinConfiguredBasePath =
      configuredBasePath === '/' ||
      candidateUrl.pathname === configuredBasePath ||
      candidateUrl.pathname.startsWith(`${configuredBasePath}/`);

    if (!isWithinConfiguredBasePath) {
      throw new Error(
        'M2M request URL is outside the configured API base path',
      );
    }

    const safeUrl = new URL(this.topcoderApiBaseUrl.origin);
    safeUrl.pathname = candidateUrl.pathname;
    safeUrl.search = candidateUrl.search;
    return safeUrl;
  }

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

      if (!response.ok) {
        let jsonError: any;
        try {
          jsonError = await response.json();
        } catch {
          jsonError = null;
        }

        this.logger.error(
          'Failed to fetch M2M token',
          tokenURL,
          response.status,
          response.statusText,
          jsonError,
        );
        return undefined;
      }

      const jsonResponse = await response.json();
      const m2mToken = jsonResponse.access_token as string;

      return m2mToken;
    } catch (error) {
      this.logger.error('Failed fetching TC M2M Token!', error);
      return undefined;
    }
  }

  async m2mFetch<T = unknown>(url: string | URL, options = {} as RequestInit) {
    // Validate before retrieving the token so credentials are never acquired or
    // attached for a caller-controlled destination.
    const safeUrl = this.toSafeM2MUrl(url);

    let m2mToken: string | undefined;
    try {
      m2mToken = await this.getToken();
    } catch (e) {
      this.logger.error('Failed to fetch m2m token!', e.message ?? e);
    }

    if (!m2mToken) {
      throw new Error('Failed to fetch m2m token for m2m call!');
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
      // Do not allow an approved endpoint to redirect the bearer token to a
      // destination that has not passed the origin and base-path checks.
      redirect: 'error',
    };

    const response = await fetch(safeUrl, finalOptions);

    if (!response.ok) {
      let responseBody: unknown;
      try {
        const text = await response.text();
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text;
        }
      } catch (e) {
        responseBody = `Failed to read response body: ${e?.message ?? e}`;
      }
      let upstreamMessage: string | undefined;
      if (typeof responseBody === 'string') {
        upstreamMessage = responseBody;
      } else if (responseBody && typeof responseBody === 'object') {
        const typedResponse = responseBody as {
          error?: string;
          message?: string | string[];
          result?: { content?: string };
        };
        if (Array.isArray(typedResponse.message)) {
          upstreamMessage = typedResponse.message.join(', ');
        } else {
          upstreamMessage =
            typedResponse.message ??
            typedResponse.result?.content ??
            typedResponse.error;
        }
      }

      this.logger.error('M2M fetch failed', {
        url: safeUrl.toString(),
        method: finalOptions.method ?? 'GET',
        status: response.status,
        statusText: response.statusText,
        requestBody: (finalOptions as any).body,
        responseBody,
      });
      throw new TopcoderM2MHttpError({
        method: finalOptions.method ?? 'GET',
        requestBody: (finalOptions as any).body,
        responseBody,
        status: response.status,
        statusText: response.statusText,
        upstreamMessage,
        url: safeUrl.toString(),
      });
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
