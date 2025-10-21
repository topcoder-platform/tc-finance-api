import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_M2M_KEY } from '../decorators/m2m.decorator';
import { M2mScope } from '../auth.constants';
import { SCOPES_KEY } from '../decorators/m2mScope.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const isM2M = this.reflector.getAllAndOverride<boolean>(IS_M2M_KEY, [
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

    // Regular authentication - check that we have user's email and have verified the id token
    if (!isM2M) {
      return Boolean(req.email && req.idTokenVerified);
    }

    // M2M authentication - check scopes
    if (!req.idTokenVerified || !req.m2mTokenScope)
      throw new UnauthorizedException();

    const allowedM2mScopes = this.reflector.getAllAndOverride<M2mScope[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const reqScopes = req.m2mTokenScope.split(' ');
    if (reqScopes.some((reqScope) => allowedM2mScopes.includes(reqScope))) {
      return true;
    }
    return false;
  }
}
