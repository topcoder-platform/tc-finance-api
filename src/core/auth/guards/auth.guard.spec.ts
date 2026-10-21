import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { auth, Principal } from 'tc-core-library-js';
import { AuthGuard } from './auth.guard';
import { TokenValidatorMiddleware } from '../middleware/tokenValidator.middleware';
import { IS_M2M_KEY } from '../decorators/m2m.decorator';
import { SCOPES_KEY } from '../decorators/m2mScope.decorator';

const machine: Principal = {
  kind: 'service',
  isMachine: true,
  clientId: 'worker',
  scopes: ['read:payments'],
  roles: [],
  sub: 'service-account-id',
  iss: 'https://issuer.example/realms/m2m',
  aud: 'https://api.example',
  iat: 1000,
  exp: 1900,
};

/** Adapt a fixture request to Nest guard context; returns a context without I/O or exceptions. */
function context(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('shared Finance authentication', () => {
  const verify = jest.fn();
  afterEach(() => jest.restoreAllMocks());

  it('projects only the core-verified machine identity into legacy request fields', async () => {
    jest.spyOn(auth, 'createValidator').mockReturnValue({ verify });
    verify.mockResolvedValue(machine);
    const req: any = { headers: { authorization: 'Bearer signed-token' } };
    const next = jest.fn();
    await new TokenValidatorMiddleware().use(req, {} as Response, next);
    expect(verify).toHaveBeenCalledWith('signed-token');
    expect(req).toMatchObject({
      authUser: machine,
      isM2M: true,
      m2mClientId: 'worker',
      m2mTokenScope: 'read:payments',
    });
    expect(req.auth0User).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects core validation errors with a sanitized response', async () => {
    jest.spyOn(auth, 'createValidator').mockReturnValue({ verify });
    verify.mockRejectedValue(new Error('private-detail'));
    await expect(
      new TokenValidatorMiddleware().use(
        { headers: { authorization: 'Bearer invalid' } },
        {} as Response,
        jest.fn(),
      ),
    ).rejects.toThrow('Invalid or expired JWT!');
  });

  it.each([
    [true, { ...machine }],
    [false, { ...machine, scopes: ['write:payments'] }],
    [false, { ...machine, scopes: ['READ:PAYMENTS'] }],
    [false, { ...machine, kind: 'user', isMachine: false, userId: 123 }],
    [false, { scopes: ['read:payments'] }],
  ])(
    'grants machine-only access %s for principal %j',
    (expected, principal) => {
      const reflector = {
        getAllAndOverride: jest.fn((key: string) =>
          key === IS_M2M_KEY
            ? true
            : key === SCOPES_KEY
              ? ['read:payments']
              : false,
        ),
      } as unknown as Reflector;
      const guard = new AuthGuard(reflector);
      const run = () =>
        guard.canActivate(
          context({
            authUser: principal,
            idTokenVerified: true,
            m2mTokenScope: 'read:payments',
          }),
        );
      if (!('kind' in principal) || principal.kind !== 'service')
        expect(run).toThrow(UnauthorizedException);
      else expect(run()).toBe(expected);
    },
  );
});
