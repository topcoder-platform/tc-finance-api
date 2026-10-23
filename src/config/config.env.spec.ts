import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConfigEnv } from './config.env';

const base = {
  TOPCODER_API_V5_BASE_URL: 'https://api.topcoder-dev.com/v5',
  TOPCODER_API_V6_BASE_URL: 'https://api.topcoder-dev.com/v6',
  AUTH0_CLIENT_ID: 'member-client',
  DATABASE_URL: 'postgresql://localhost/finance',
  TROLLEY_WIDGET_BASE_URL: 'https://widget.example',
  TROLLEY_WH_HMAC: 'hmac',
  TROLLEY_ACCESS_KEY: 'access',
  TROLLEY_SECRET_KEY: 'secret',
  TC_EMAIL_FROM_EMAIL: 'finance@example.com',
  BILLING_ACCOUNTS_DB_URL: 'postgresql://localhost/billing',
};
const auth0 = {
  AUTH0_M2M_AUDIENCE: 'https://m2m.topcoder-dev.com/',
  AUTH0_TC_PROXY_URL: 'https://auth-proxy.topcoder-dev.com',
  AUTH0_M2M_CLIENT_ID: 'auth0-finance',
  AUTH0_M2M_SECRET: 'auth0-secret',
  AUTH0_M2M_TOKEN_URL: 'https://topcoder-dev.auth0.com',
  AUTH0_M2M_GRANT_TYPE: 'client_credentials',
};
const keycloak = {
  KEYCLOAK_ISSUER: 'https://keycloak.example/realms/m2m',
  KEYCLOAK_AUDIENCE: 'https://api.example',
  KEYCLOAK_TOKEN_URL: 'https://keycloak.example/m2m/token',
  KEYCLOAK_CLIENT_ID: 'm2m-finance',
  KEYCLOAK_CLIENT_SECRET: 'keycloak-secret',
};

/** Validate settings the way config.loader does; returns the names of invalid properties. */
function invalid(env: Record<string, string>): string[] {
  const config = plainToInstance(ConfigEnv, env, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  return validateSync(config, {
    skipMissingProperties: false,
    whitelist: true,
  }).map((error) => error.property);
}

describe('ConfigEnv M2M settings (USE_KEYCLOAK)', () => {
  it('requires only the Auth0 M2M settings when USE_KEYCLOAK is unset or false', () => {
    expect(invalid({ ...base, ...auth0 })).toEqual([]);
    expect(invalid({ ...base, ...auth0, USE_KEYCLOAK: 'false' })).toEqual([]);
    expect(invalid({ ...base, USE_KEYCLOAK: 'false' }).sort()).toEqual(
      Object.keys(auth0).sort(),
    );
  });

  it('requires only the Keycloak M2M settings when USE_KEYCLOAK=true', () => {
    expect(invalid({ ...base, ...keycloak, USE_KEYCLOAK: 'true' })).toEqual([]);
    expect(invalid({ ...base, USE_KEYCLOAK: 'TRUE' }).sort()).toEqual(
      Object.keys(keycloak).sort(),
    );
  });

  it('rejects USE_KEYCLOAK values other than true or false', () => {
    expect(() =>
      invalid({ ...base, ...auth0, ...keycloak, USE_KEYCLOAK: 'yes' }),
    ).toThrow('USE_KEYCLOAK must be true or false');
  });
});
