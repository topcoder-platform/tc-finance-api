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
    const { category, categories, ...rest } = req ?? {};

    // If client supplied a filter, intersect with allowed categories for security.
    // If the intersection is empty (all disallowed), fallback to all allowed.
    // Otherwise default to all allowed categories.
    let requestedCategories: winnings_category[] | undefined;

    if (categories && Array.isArray(categories)) {
      const filtered = categories.filter((cat) =>
        allowedCategories.includes(cat),
      );
      requestedCategories = filtered.length > 0 ? filtered : undefined;
    } else if (category) {
      requestedCategories = allowedCategories.includes(category)
        ? [category]
        : undefined;
    }

    return {
      ...rest,
      categories: requestedCategories ?? allowedCategories,
    } as T;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verifyAccessToResource(winningsId: string | string[], _userId: string) {
    const winningsIds = ([] as string[]).concat(winningsId);

    const winnings = await this.prisma.winnings.findMany({
      where: { winning_id: { in: winningsIds } },
      select: { category: true },
    });

    const unauthorized = winnings.filter((w) => {
      const category = w.category;

      return category === null || !allowedCategories.includes(category);
    });
    if (unauthorized.length > 0) {
      throw new Error(
        `${Role.PaymentApprover} user is trying to access winning with category='${unauthorized.map((w) => w.category).join(', ')}'`,
      );
    }
  }
}
