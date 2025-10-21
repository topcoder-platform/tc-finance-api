import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { auth0User } = request;
    const userRoles = Object.keys(auth0User).reduce((roles, key) => {
      if (key.match(/claims\/roles$/gi)) {
        return auth0User[key] as string[];
      }

      return roles;
    }, []);

    if (!requiredRoles.some((role) => userRoles.includes(role))) {
      return false;
    }

    const userHandle = Object.keys(auth0User).reduce((handles, key) => {
      if (key.match(/claims\/handle$/gi)) {
        return auth0User[key] as string;
      }

      return handles;
    }, []);

    const userId = Object.keys(auth0User).reduce((ids, key) => {
      if (key.match(/claims\/userId$/gi)) {
        return auth0User[key] as string;
      }

      return ids;
    }, []);

    request.user = {
      id: userId,
      handle: userHandle,
      email: request.email,
    };

    return true;
  }
}
