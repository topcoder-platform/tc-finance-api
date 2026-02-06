import { Injectable } from '@nestjs/common';
import { RoleAccessProvider } from './role-access.interface';
import { PrismaService } from 'src/shared/global/prisma.service';
import { Role } from 'src/core/auth/auth.constants';
import { winnings_category } from 'packages/finance-prisma-client';

@Injectable()
export class EngagementPaymentApproverProvider implements RoleAccessProvider {
  roleName = Role.EngagementPaymentApprover;

  constructor(private readonly prisma: PrismaService) {}

  // disable rule: prefer this format instead of returning resolved promise (required by interface)
  // eslint-disable-next-line @typescript-eslint/require-await
  async applyFilter<T>(userId: string, req: any): Promise<T> {
    return { ...req, category: winnings_category.ENGAGEMENT_PAYMENT } as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verifyAccessToResource(winningsId: string | string[], _userId: string) {
    const winningsIds = ([] as string[]).concat(winningsId);

    const winnings = await this.prisma.winnings.findMany({
      where: { winning_id: { in: winningsIds } },
      select: { category: true },
    });

    const unauthorized = winnings.filter(
      (w) => w.category !== winnings_category.ENGAGEMENT_PAYMENT,
    );
    if (unauthorized.length > 0) {
      throw new Error(
        `${Role.EngagementPaymentApprover} user is trying to access winning with category='${unauthorized.map(w => w.category).join(', ')}'`,
      );
    }
  }
}
