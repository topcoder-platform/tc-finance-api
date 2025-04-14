import { Injectable, HttpStatus } from '@nestjs/common';

import { PrismaService } from 'src/shared/global/prisma.service';

import { ResponseDto, WinningsType } from 'src/dto/adminWinning.dto';
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
      const winnings = await this.getWinningsTotalsByWinnerID(userId);

      const hasActiveTaxForm = await this.taxFormRepo.hasActiveTaxForm(userId);
      const hasVerifiedPaymentMethod =
        await this.paymentMethodRepo.hasVerifiedPaymentMethod(userId);

      const winningTotals: WalletDetailDto = {
        account: {
          balances: [
            {
              type: WinningsType.PAYMENT,
              amount: Number(
                winnings.find((it) => it.payment_type === 'PAYMENT')
                  ?.total_owed ?? 0,
              ),
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

  getWinningsTotalsByWinnerID(winnerId: string) {
    return this.prisma.$queryRaw<
      { payment_type: 'PAYMENT' | 'REWARD'; total_owed: number }[]
    >`
      WITH latest_payment_version AS (
        SELECT
          winnings_id,
          MAX(version) AS max_version
        FROM
          payment
        GROUP BY
          winnings_id
      )
      SELECT
        w.type AS payment_type,
        CASE
          WHEN w.type = 'PAYMENT' THEN SUM(p.total_amount)
          WHEN w.type = 'REWARD' THEN SUM(r.points)
          ELSE 0
        END AS total_owed
      FROM
        winnings w
        LEFT JOIN payment p ON w.winning_id = p.winnings_id
        AND w.type = 'PAYMENT'
        AND p.payment_status IN ('OWED', 'ON_HOLD')
        AND p.installment_number = 1
        INNER JOIN latest_payment_version lpv ON p.winnings_id = lpv.winnings_id
        AND p.version = lpv.max_version
        LEFT JOIN reward r ON w.winning_id = r.winnings_id
        AND w.type = 'REWARD'
      WHERE
        w.winner_id = ${winnerId}
      GROUP BY
        w.type
    `;
  }

  private findMaxVersion(latest: any[], winningId: string): number {
    const winningItem = latest.find((item) => item.winnings_id === winningId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return winningItem['_max'].version;
  }
}
