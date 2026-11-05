import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import * as jwt from 'jsonwebtoken';
import { TokenValidatorMiddleware } from './tokenValidator.middleware';

jest.mock('src/config', () => ({
  ENV_CONFIG: {
    VALID_ISSUERS:
      '["https://browser.example.test/","https://machine.example.test/","https://legacy.example.test"]',
    AUTH_SECRET: 'finance-test-signing-secret-at-least-32-bytes',
    JWT_AUDIENCE: 'browser-client',
    AUTH0_AUDIENCE: 'machine-api',
    AUTH0_CLIENT_ID: 'outbound-client',
    AUTH0_M2M_AUDIENCE: 'old-audience',
    AUTH0_M2M_TOKEN_URL: 'https://old.example.test',
  },
}));
jest.mock('src/shared/global', () => ({
  Logger: jest.fn().mockImplementation(() => ({ error: jest.fn() })),
}));

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const sharedRequire = createRequire(require.resolve('tc-core-library-js'));
const { JwksClient } = sharedRequire('jwks-rsa') as {
  JwksClient: {
    prototype: {
      getSigningKey(kid: string): Promise<{ getPublicKey(): string }>;
    };
  };
};

describe('Finance shared JWT configuration', () => {
  beforeEach(() => {
    jest.spyOn(JwksClient.prototype, 'getSigningKey').mockResolvedValue({
      getPublicKey: () =>
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
  });
  afterEach(() => jest.restoreAllMocks());

  /** Runs a real JWT through Finance middleware without external user/database lookups.
   * @param token Signed JWT. @returns Request populated by middleware; rejects for invalid authentication.
   */
  async function validate(token: string) {
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };
    await new TokenValidatorMiddleware().use(
      request,
      {} as Response,
      jest.fn(),
    );
    return request;
  }

  it('accepts the browser custom-domain issuer and shared browser audience', async () => {
    const token = jwt.sign(
      { sub: 'user', userId: '42', email: 'test@example.test' },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: 'test-key',
        issuer: 'https://browser.example.test/',
        audience: 'browser-client',
        expiresIn: 300,
      },
    );
    await expect(validate(token)).resolves.toMatchObject({
      idTokenVerified: true,
      isM2M: false,
      email: 'test@example.test',
    });
  });

  it('accepts the shared M2M audience independently of the outbound client ID', async () => {
    const token = jwt.sign(
      {
        sub: 'client@clients',
        azp: 'client',
        gty: 'client-credentials',
        scope: 'read:payments',
      },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: 'test-key',
        issuer: 'https://machine.example.test/',
        audience: 'machine-api',
        expiresIn: 300,
      },
    );
    await expect(validate(token)).resolves.toMatchObject({
      idTokenVerified: true,
      isM2M: true,
      m2mTokenScope: 'read:payments',
    });
  });

  it('accepts a verified legacy human token without an audience', async () => {
    const token = jwt.sign(
      { userId: '42', email: 'test@example.test' },
      'finance-test-signing-secret-at-least-32-bytes',
      { issuer: 'https://legacy.example.test', expiresIn: 300 },
    );
    await expect(validate(token)).resolves.toMatchObject({
      idTokenVerified: true,
      isM2M: false,
    });
  });

  it.each(['outbound-client', 'untrusted-api'])(
    'rejects an untrusted audience %s',
    async (audience) => {
      const token = jwt.sign({ userId: '42' }, privateKey, {
        algorithm: 'RS256',
        keyid: 'test-key',
        issuer: 'https://browser.example.test/',
        audience,
        expiresIn: 300,
      });
      await expect(validate(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('rejects an issuer outside the shared allowlist', async () => {
    const token = jwt.sign({ userId: '42' }, privateKey, {
      algorithm: 'RS256',
      keyid: 'test-key',
      issuer: 'https://untrusted.example.test/',
      audience: 'browser-client',
      expiresIn: 300,
    });
    await expect(validate(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
