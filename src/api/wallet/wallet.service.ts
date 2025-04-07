import { Injectable, HttpStatus } from '@nestjs/common';

import { PrismaService } from 'src/shared/global/prisma.service';

import {
  ResponseDto,
  WinningsType,
  PaymentStatus,
} from 'src/dto/adminWinning.dto';
import { WalletDetailDto } from 'src/dto/wallet.dto';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';

/**
 * The winning service.
 */
@Injectable()
export class WalletService {
  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentMethodRepo: PaymentMethodRepository,
  ) {}

  /**
   * Get wallet detail.
   * @param userId the request userId
   * @returns the Promise with response result
   */
  async getWalletDetails(
    userId: string,
  ): Promise<ResponseDto<WalletDetailDto>> {
    const result = new ResponseDto<WalletDetailDto>();

    try {
      const latestPaymentVersion = await this.prisma.payment.groupBy({
        by: ['winnings_id'],
        _max: {
          version: true,
        },
      });

      const winnings = await this.prisma.winnings.findMany({
        where: {
          type: {
            in: [WinningsType.PAYMENT, WinningsType.REWARD],
          },
          winner_id: userId,
          payment: {
            some: {
              payment_status: {
                in: [PaymentStatus.OWED, PaymentStatus.ON_HOLD],
              },
              installment_number: {
                equals: 1,
              },
            },
          },
        },
        include: {
          payment: true,
          reward: true,
        },
      });

      // count PAYMENT and REWARD totals
      let paymentTotal = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let rewardTotal = 0;
      winnings.forEach((item) => {
        if (item.type === WinningsType.PAYMENT) {
          const latestVersion = this.findMaxVersion(
            latestPaymentVersion,
            item.winning_id,
          );
          const foundPayment = item.payment.find(
            (p) =>
              p.installment_number === 1 &&
              p.version === latestVersion &&
              (p.payment_status === PaymentStatus.OWED ||
                p.payment_status === PaymentStatus.ON_HOLD),
          );
          if (foundPayment) {
            paymentTotal += foundPayment.total_amount!.toNumber();
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        } else if (item.type === WinningsType.REWARD) {
          if (item.reward && item.reward.length > 0) {
            item.reward.forEach((r) => {
              rewardTotal += r.points ?? 0;
            });
          }
        }
      });

      const hasActiveTaxForm = await this.taxFormRepo.hasActiveTaxForm(userId);
      const hasVerifiedPaymentMethod =
        await this.paymentMethodRepo.hasVerifiedPaymentMethod(userId);

      const winningTotals: WalletDetailDto = {
        account: {
          balances: [
            {
              type: WinningsType.PAYMENT,
              amount: paymentTotal,
              unit: 'currency',
            },
            // hide rewards for now
            // {
            //   type: WinningsType.REWARD,
            //   amount: rewardTotal,
            //   unit: 'points',
            // },
          ],
        },
        withdrawalMethod: {
          isSetupComplete: hasVerifiedPaymentMethod,
        },
        taxForm: {
          isSetupComplete: hasActiveTaxForm,
        },
      };

      result.data = winningTotals;
    } catch (error) {
      console.error('Getting winnings audit failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }

  private findMaxVersion(latest: any[], winningId: string): number {
    const winningItem = latest.find((item) => item.winnings_id === winningId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return winningItem['_max'].version;
  }
}
