import { Injectable } from '@nestjs/common';
import { RoleAccessProvider } from './role-access.interface';
import { PrismaService } from 'src/shared/global/prisma.service';
import { Role } from 'src/core/auth/auth.constants';
import { winnings_category } from '@prisma/client';

const allowedCategories: winnings_category[] = [
  winnings_category.ENGAGEMENT_PAYMENT,
  winnings_category.TASK_PAYMENT,
];

@Injectable()
export class PaymentApproverProvider implements RoleAccessProvider {
  roleName = Role.PaymentApprover;

  constructor(private readonly prisma: PrismaService) {}

  // disable rule: prefer this format instead of returning resolved promise (required by interface)
  // eslint-disable-next-line @typescript-eslint/require-await
  async applyFilter<T>(_userId: string, req: any): Promise<T> {
    // If the request already has a specific category, preserve it (access is
    // validated per-resource via verifyAccessToResource). Otherwise restrict the
    // query to all categories allowed for this role.
    if (req.category) {
      return req as T;
    }

    return { ...req, categories: allowedCategories } as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verifyAccessToResource(winningsId: string | string[], _userId: string) {
    const winningsIds = ([] as string[]).concat(winningsId);

    const winnings = await this.prisma.winnings.findMany({
      where: { winning_id: { in: winningsIds } },
      select: { category: true },
    });

    const unauthorized = winnings.filter(
      (w) => !allowedCategories.includes(w.category),
    );
    if (unauthorized.length > 0) {
      throw new Error(
        `${Role.PaymentApprover} user is trying to access winning with category='${unauthorized.map((w) => w.category).join(', ')}'`,
      );
    }
  }
}
