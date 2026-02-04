import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  private normalizeRole(role: string): string {
    return role.trim().toLowerCase();
  }

  private collectUserRoles(auth0User: Record<string, any>): string[] {
    const roles: string[] = [];
    const appendRoles = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach((role) => {
          if (typeof role === 'string' && role.trim()) {
            roles.push(role.trim());
          }
        });
        return;
      }
      if (typeof value === 'string' && value.trim()) {
        value
          .split(',')
          .map((role) => role.trim())
          .filter(Boolean)
          .forEach((role) => roles.push(role));
      }
    };

    Object.keys(auth0User).forEach((key) => {
      if (key.match(/\/roles$/gi) || key === 'roles' || key === 'role') {
        appendRoles(auth0User[key]);
      }
    });

    return roles;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tokenIsM2M = Boolean(request.m2mTokenScope);
    if (tokenIsM2M) {
      return Boolean(request.idTokenVerified);
    }

    const { auth0User = {} } = request;
    const userRoles = this.collectUserRoles(auth0User);
    const normalizedUserRoles = new Set(
      userRoles.map((role) => this.normalizeRole(role)),
    );
    const normalizedRequiredRoles = requiredRoles.map((role) =>
      this.normalizeRole(role),
    );

    if (
      !normalizedRequiredRoles.some((role) => normalizedUserRoles.has(role))
    ) {
      return false;
    }

    const userHandle = Object.keys(auth0User).reduce((handles, key) => {
      if (key.match(/\/handle$/gi)) {
        return auth0User[key] as string;
      }

      return handles;
    }, []);

    const userId = Object.keys(auth0User).reduce((ids, key) => {
      if (key.match(/\/userId$/gi)) {
        return auth0User[key] as string;
      }

      return ids;
    }, []);

    request.user = {
      id: userId,
      handle: userHandle,
      email: request.email,
      roles: userRoles,
    };

    return true;
  }
}
