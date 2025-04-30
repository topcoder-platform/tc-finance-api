import { Injectable } from '@nestjs/common';
import { payment_method_status } from '@prisma/client';
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
  async hasVerifiedPaymentMethod(userId: string): Promise<boolean> {
    const connectedUserPaymentMethod =
      await this.prisma.user_payment_methods.findFirst({
        where: {
          user_id: userId,
          status: payment_method_status.CONNECTED,
        },
      });

    return !!connectedUserPaymentMethod;
  }
}
