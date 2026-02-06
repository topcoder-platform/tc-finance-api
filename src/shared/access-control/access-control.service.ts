import { Injectable } from '@nestjs/common';
import { RoleAccessProvider } from './role-access.interface';

@Injectable()
export class AccessControlService {
  private providers = new Map<string, RoleAccessProvider<any>>();

  register(provider: RoleAccessProvider) {
    this.providers.set(provider.roleName.trim().toLowerCase(), provider);
  }

  async applyFilters<T>(
    userId: string,
    roles: string[] = [],
    req: any,
  ): Promise<T> {
    let out = { ...req };
    for (const r of roles || []) {
      const p = this.providers.get(r?.trim().toLowerCase());
      if (p?.applyFilter) {
        out = await p.applyFilter(userId, out);
      }
    }
    return out as T;
  }

  async verifyAccess(resourceId: string, userId: string, roles: string[] = []) {
    for (const r of roles || []) {
      const p = this.providers.get(r?.trim().toLowerCase());
      if (p?.verifyAccessToResource) {
        await p.verifyAccessToResource(resourceId, userId);
      }
    }
  }
}
