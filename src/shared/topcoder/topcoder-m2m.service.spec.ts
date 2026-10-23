// The real USE_KEYCLOAK rule; only the Keycloak token provider is replaced.
const mockM2m = jest.fn(() => ({ getMachineToken: jest.fn() }));
jest.mock('tc-core-library-js', () => ({
  auth: {
    m2m: (...args: unknown[]) => mockM2m(...(args as [])),
    useKeycloak: jest.requireActual('tc-core-library-js').auth.useKeycloak,
  },
}));

jest.mock('src/config', () => ({
  ENV_CONFIG: {
    AUTH0_M2M_AUDIENCE: 'https://api.topcoder-dev.com/',
    AUTH0_M2M_CLIENT_ID: 'client-id',
    AUTH0_M2M_GRANT_TYPE: 'client_credentials',
    AUTH0_M2M_SECRET: 'client-secret',
    AUTH0_M2M_TOKEN_URL: 'https://topcoder-dev.auth0.com',
    AUTH0_TC_PROXY_URL: 'https://auth-proxy.topcoder-dev.com',
    TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  },
}));

jest.mock('src/shared/global', () => ({
  Logger: class {
    error = jest.fn();
  },
}));

import { ENV_CONFIG } from 'src/config';
import { TopcoderM2MService } from './topcoder-m2m.service';

describe('TopcoderM2MService.m2mFetch', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let getTokenSpy: jest.SpyInstance;
  let service: TopcoderM2MService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new TopcoderM2MService();
    getTokenSpy = jest
      .spyOn(service, 'getToken')
      .mockResolvedValue('m2m-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('reconstructs an allowed URL and prevents redirects from forwarding the token', async () => {
    fetchMock.mockResolvedValue({
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue({ id: 'challenge-id' }),
      ok: true,
    } as unknown as Response);

    await expect(
      service.m2mFetch(
        'https://API.TOPCODER-DEV.COM/v6/challenges/challenge-id?fields=id',
        { redirect: 'follow' },
      ),
    ).resolves.toEqual({ id: 'challenge-id' });

    expect(getTokenSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    expect(requestUrl).toBeInstanceOf(URL);
    if (!(requestUrl instanceof URL)) {
      throw new Error('Expected m2mFetch to pass a reconstructed URL to fetch');
    }
    expect(requestUrl.toString()).toBe(
      'https://api.topcoder-dev.com/v6/challenges/challenge-id?fields=id',
    );
    expect(requestOptions).toMatchObject({ redirect: 'error' });
    expect(new Headers(requestOptions?.headers).get('Authorization')).toBe(
      'Bearer m2m-token',
    );
  });

  it.each([
    ['an invalid URL', 'not a URL'],
    [
      'an untrusted origin',
      'https://169.254.169.254/latest/meta-data/iam/security-credentials',
    ],
    [
      'a hostname suffix lookalike',
      'https://api.topcoder-dev.com.attacker.example/v6/challenges/id',
    ],
    [
      'embedded user information',
      'https://attacker@api.topcoder-dev.com/v6/challenges/id',
    ],
    ['a sibling base path', 'https://api.topcoder-dev.com/v60/challenges/id'],
    [
      'raw path traversal',
      'https://api.topcoder-dev.com/v6/challenges/../../admin',
    ],
    [
      'percent-encoded path traversal',
      'https://api.topcoder-dev.com/v6/challenges/%2e%2e/%2e%2e/admin',
    ],
    [
      'path traversal hidden behind an encoded separator',
      'https://api.topcoder-dev.com/v6/challenges/id%2f..%2f..%2fadmin',
    ],
    [
      'doubly encoded path traversal hidden behind an encoded query delimiter',
      'https://api.topcoder-dev.com/v6/challenges/id%3f%252e%252e%252fadmin',
    ],
    [
      'a fragment that could truncate the approved path',
      'https://api.topcoder-dev.com/v6/challenges/id#@attacker.example',
    ],
  ])('rejects %s before retrieving a token', async (_, requestUrl) => {
    await expect(service.m2mFetch(requestUrl)).rejects.toThrow();

    expect(getTokenSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('TopcoderM2MService.getToken provider selection (USE_KEYCLOAK)', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    mockM2m.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete ENV_CONFIG.USE_KEYCLOAK;
  });

  it('requests the token from the Auth0 proxy with the AUTH0_M2M_* settings when USE_KEYCLOAK=false', async () => {
    ENV_CONFIG.USE_KEYCLOAK = 'false';
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ access_token: 'auth0-token' }),
    } as unknown as Response);

    await expect(new TopcoderM2MService().getToken()).resolves.toBe(
      'auth0-token',
    );

    expect(mockM2m).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth-proxy.topcoder-dev.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      auth0_url: 'https://topcoder-dev.auth0.com/oauth/token',
      client_id: 'client-id',
      client_secret: 'client-secret',
      audience: 'https://api.topcoder-dev.com/',
      grant_type: 'client_credentials',
    });
  });

  it('resolves undefined when the Auth0 proxy rejects the request, as before the migration', async () => {
    delete ENV_CONFIG.USE_KEYCLOAK;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: jest.fn().mockResolvedValue({ error: 'access_denied' }),
    } as unknown as Response);

    await expect(new TopcoderM2MService().getToken()).resolves.toBeUndefined();
    expect(mockM2m).not.toHaveBeenCalled();
  });

  it('uses the shared Keycloak provider and never calls the Auth0 proxy when USE_KEYCLOAK=true', async () => {
    ENV_CONFIG.USE_KEYCLOAK = 'true';
    const getMachineToken = jest.fn().mockResolvedValue('keycloak-token');
    mockM2m.mockReturnValueOnce({ getMachineToken });

    await expect(new TopcoderM2MService().getToken()).resolves.toBe(
      'keycloak-token',
    );

    expect(mockM2m).toHaveBeenCalledWith();
    expect(getMachineToken).toHaveBeenCalledWith();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
