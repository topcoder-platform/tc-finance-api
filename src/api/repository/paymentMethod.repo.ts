import { Injectable } from '@nestjs/common';
import {
  payment_method_status,
  Prisma,
  user_payment_methods,
} from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

@Injectable()
export class PaymentMethodRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the user's connected payment method (if there is one)
   *
   * @param userId user id
   * @param tx transaction
   */
  async getConnectedPaymentMethod(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<user_payment_methods | null> {
    const connectedUserPaymentMethod = await (
      tx || this.prisma
    ).user_payment_methods.findFirst({
      where: {
        user_id: userId,
        status: payment_method_status.CONNECTED,
      },
    });

    return connectedUserPaymentMethod;
  }
}
