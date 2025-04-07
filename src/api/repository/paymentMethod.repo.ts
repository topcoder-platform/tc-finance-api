import { Injectable } from '@nestjs/common';
import {
  PaymentMethodQueryResult,
  UserPaymentMethodStatus,
} from 'src/dto/paymentMethod.dto';
import { PrismaService } from 'src/shared/global/prisma.service';

@Injectable()
export class PaymentMethodRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check user has verified payment method
   *
   * @param userId user id
   * @param tx transaction
   */
  async hasVerifiedPaymentMethod(userId: string, tx?): Promise<boolean> {
    const methods = await this.findPaymentMethodByUserId(userId, tx);
    for (const method of methods) {
      if (
        method.status ===
        UserPaymentMethodStatus.UserPaymentMethodStatusConnected.toString()
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get user payment methods
   *
   * @param userId user id
   * @param tx transaction
   * @returns payment methods
   */
  private async findPaymentMethodByUserId(userId: string, tx?) {
    const db = tx || this.prisma;
    const ret = await db.$queryRaw`
      SELECT pm.payment_method_id, pm.payment_method_type, pm.name, pm.description, upm.status, upm.id
      FROM payment_method pm
      JOIN user_payment_methods upm ON pm.payment_method_id = upm.payment_method_id
      WHERE upm.user_id=${userId}
    `;
    return (ret || []) as PaymentMethodQueryResult[];
  }
}
