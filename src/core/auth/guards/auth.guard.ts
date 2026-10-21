import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { auth } from 'tc-core-library-js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_M2M_KEY } from '../decorators/m2m.decorator';
import { M2mScope } from '../auth.constants';
import { SCOPES_KEY } from '../decorators/m2mScope.decorator';

/** Preserves Finance public/member/service route policy with shared machine classification and scopes. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /** Evaluate current handler metadata and verified request identity; throws for missing required authentication. */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const routeM2MOnly = this.reflector.getAllAndOverride<boolean>(IS_M2M_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { m2mUserId } = req;
    if (m2mUserId) {
      req.user = {
        id: m2mUserId,
        handle: '',
      };
    }

    const tokenIsM2M =
      req.authUser?.kind === 'service' && req.authUser?.isMachine === true;

    // If route explicitly requires M2M, enforce M2M + scope
    if (routeM2MOnly) {
      if (!req.idTokenVerified || !tokenIsM2M) {
        throw new UnauthorizedException();
      }

      const allowedM2mScopes = this.reflector.getAllAndOverride<M2mScope[]>(
        SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      );
      return (
        !!allowedM2mScopes?.length &&
        auth.hasScopes(req.authUser, allowedM2mScopes, 'any')
      );
    }

    // Hybrid (default) route behavior: allow either
    // - Verified user JWT (email present), OR
    // - Verified M2M token but only if scope matches when scopes are declared on the route

    // User JWT branch
    if (!tokenIsM2M) {
      return Boolean(req.email && req.idTokenVerified);
    }

    // M2M branch on non-M2M-only route: require declared scopes, otherwise deny
    if (!req.idTokenVerified) {
      throw new UnauthorizedException();
    }

    const allowedM2mScopes = this.reflector.getAllAndOverride<M2mScope[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowedM2mScopes || allowedM2mScopes.length === 0) {
      // No scopes declared for this route, do not allow M2M by default
      return false;
    }
    return auth.hasScopes(req.authUser, allowedM2mScopes, 'any');
  }
}
