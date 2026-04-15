import { Injectable } from '@nestjs/common';
import { Role } from 'src/core/auth/auth.constants';
import { RoleAccessProvider } from './role-access.interface';

@Injectable()
export class AccessControlService {
  private providers = new Map<string, RoleAccessProvider<any>>();

  register(provider: RoleAccessProvider) {
    this.providers.set(provider.roleName.trim().toLowerCase(), provider);
  }

  private normalizeRoles(roles: string[] = []): Set<string> {
    return new Set(
      (roles || []).map((role) => role?.trim().toLowerCase()).filter(Boolean),
    );
  }

  private shouldSkipProvider(
    providerRole: string,
    normalizedRoles: Set<string>,
  ): boolean {
    const isCategoryScopedApproverRole =
      providerRole === Role.EngagementPaymentApprover.trim().toLowerCase() ||
      providerRole === Role.WiproTaasAdmin.trim().toLowerCase();

    return (
      isCategoryScopedApproverRole &&
      normalizedRoles.has(Role.PaymentAdmin.trim().toLowerCase())
    );
  }

  async applyFilters<T>(
    userId: string,
    roles: string[] = [],
    req: any,
  ): Promise<T> {
    let out = { ...req };
    const normalizedRoles = this.normalizeRoles(roles);
    for (const r of roles || []) {
      const normalizedRole = r?.trim().toLowerCase();
      if (
        !normalizedRole ||
        this.shouldSkipProvider(normalizedRole, normalizedRoles)
      ) {
        continue;
      }

      const p = this.providers.get(normalizedRole);
      if (p?.applyFilter) {
        out = await p.applyFilter(userId, out);
      }
    }
    return out as T;
  }

  async verifyAccess(resourceId: string, userId: string, roles: string[] = []) {
    const normalizedRoles = this.normalizeRoles(roles);
    for (const r of roles || []) {
      const normalizedRole = r?.trim().toLowerCase();
      if (
        !normalizedRole ||
        this.shouldSkipProvider(normalizedRole, normalizedRoles)
      ) {
        continue;
      }

      const p = this.providers.get(normalizedRole);
      if (p?.verifyAccessToResource) {
        await p.verifyAccessToResource(resourceId, userId);
      }
    }
  }
}
