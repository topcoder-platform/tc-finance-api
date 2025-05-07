import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { Prisma, payment, payment_status } from '@prisma/client';

import { PrismaService } from 'src/shared/global/prisma.service';

import { WinningCreateRequestDto } from 'src/dto/winning.dto';
import { ResponseDto } from 'src/dto/api-response.dto';
import { PaymentStatus } from 'src/dto/payment.dto';
import { OriginRepository } from '../repository/origin.repo';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';

/**
 * The winning service.
 */
@Injectable()
export class WinningsService {
  private readonly logger = new Logger(WinningsService.name);

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentMethodRepo: PaymentMethodRepository,
    private readonly originRepo: OriginRepository,
  ) {}

  /**
   * Create winnings with parameters
   * @param body the request body
   * @param userId the request userId
   * @returns the Promise with response result
   */
  async createWinningWithPayments(
    body: WinningCreateRequestDto,
    userId: string,
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    return this.prisma.$transaction(async (tx) => {
      const originId = await this.originRepo.getOriginIdByName(body.origin, tx);

      if (!originId) {
        this.logger.warn('Invalid origin provided', { originId });

        result.error = {
          code: HttpStatus.BAD_REQUEST,
          message: 'Origin name does not exist',
        };
        return result;
      }

      const winningModel = {
        winner_id: body.winnerId,
        type: body.type,
        origin_id: originId,
        category: body.category,
        title: body.title,
        description: body.description,
        external_id: body.externalId,
        attributes: body.attributes,
        created_by: userId,
        payment: {
          create: [] as Partial<payment>[],
        },
      };

      const payrollPayment = (body.attributes || {})['payroll'] === true;

      const hasActiveTaxForm = await this.taxFormRepo.hasActiveTaxForm(
        body.winnerId,
      );
      const hasPaymentMethod =
        await this.paymentMethodRepo.getConnectedPaymentMethod(body.winnerId);

      for (const detail of body.details || []) {
        const paymentModel = {
          gross_amount: Prisma.Decimal(detail.grossAmount),
          total_amount: Prisma.Decimal(detail.totalAmount),
          installment_number: detail.installmentNumber,
          currency: detail.currency,
          net_amount: Prisma.Decimal(0),
          payment_status: '' as payment_status,
          created_by: userId,
          billing_account: detail.billingAccount,
        };

        paymentModel.net_amount = Prisma.Decimal(detail.grossAmount);
        paymentModel.payment_status =
          hasPaymentMethod && hasActiveTaxForm
            ? PaymentStatus.OWED
            : PaymentStatus.ON_HOLD;

        if (payrollPayment) {
          paymentModel.payment_status = PaymentStatus.PAID;
        }

        winningModel.payment.create.push(paymentModel);
      }
      // use prisma nested writes to avoid foreign key checks
      const createdWinning = await this.prisma.winnings.create({
        data: winningModel as any,
      });
      if (!createdWinning) {
        result.error = {
          code: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to create winning!',
        };
      }

      return result;
    });
  }
}
