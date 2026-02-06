import { Injectable } from '@nestjs/common';
import { RoleAccessProvider } from './role-access.interface';
import { BillingAccountsService } from 'src/shared/topcoder/billing-accounts.service';
import { PrismaService } from 'src/shared/global/prisma.service';
import { Role } from 'src/core/auth/auth.constants';

@Injectable()
export class PaymentBaProvider implements RoleAccessProvider {
  roleName = Role.PaymentBaAdmin;

  constructor(
    private readonly baService: BillingAccountsService,
    private readonly prisma: PrismaService,
  ) {}

  async applyFilter<T>(userId: string, req: any): Promise<T> {
    const bas = await this.baService.getBillingAccountsForUser(userId);
    return { ...req, billingAccounts: bas } as T;
  }

  async verifyAccessToResource(winningsId: string, userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { winnings_id: { equals: winningsId } },
      select: { billing_account: true },
    });

    if (!payments || payments.length === 0) {
      return;
    }

    const allowedBAs = await this.baService.getBillingAccountsForUser(userId);
    const paymentBAs = payments
      .map((p) => p.billing_account)
      .filter((b) => b !== null && b !== undefined);

    const unauthorized = paymentBAs.some((ba) => !allowedBAs.includes(`${ba}`));
    if (unauthorized) {
      throw new Error(
        'BA admin user does not have access to the billing account for this winnings',
      );
    }
  }
}
