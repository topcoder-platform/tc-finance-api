import { Injectable, HttpStatus } from '@nestjs/common';

import { PrismaService } from 'src/shared/global/prisma.service';

import { WalletDetailDto } from 'src/dto/wallet.dto';
import { ResponseDto } from 'src/dto/api-response.dto';
import { WinningsType } from 'src/dto/winning.dto';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import {
  RecipientTaxDetails,
  TrolleyService,
} from 'src/shared/global/trolley.service';
import { Logger } from 'src/shared/global';
import { IdentityVerificationRepository } from '../repository/identity-verification.repo';
import { ENV_CONFIG } from 'src/config';

/**
 * The winning service.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentMethodRepo: PaymentMethodRepository,
    private readonly identityVerificationRepo: IdentityVerificationRepository,
    private readonly trolleyService: TrolleyService,
  ) {}

  async getPayoutDetails(userId: string) {
    const recipient = await this.prisma.trolley_recipient.findFirst({
      where: { user_id: userId },
    });

    if (!recipient) {
      return;
    }

    return this.trolleyService.getRecipientPayoutDetails(recipient.trolley_id);
  }

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
      const isIdentityVerified =
        await this.identityVerificationRepo.completedIdentityVerification(
          userId,
        );
      const hasVerifiedPaymentMethod = Boolean(
        await this.paymentMethodRepo.getConnectedPaymentMethod(userId),
      );

      const payoutDetails = ((await this.getPayoutDetails(userId)) ??
        {}) as RecipientTaxDetails;
      const { payoutMethod, ...taxWithholdingDetails } = payoutDetails;

      result.data = {
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
            {
              type: WinningsType.POINTS,
              amount: Number(
                winnings.find((it) => it.payment_type === 'POINTS')
                  ?.total_owed ?? 0,
              ),
              unit: 'credits',
            },
          ],
        },
        withdrawalMethod: {
          isSetupComplete: hasVerifiedPaymentMethod,
          type: { 'bank-transfer': 'bank' }[payoutMethod] ?? payoutMethod,
        },
        taxForm: {
          isSetupComplete: hasActiveTaxForm,
        },
        identityVerification: {
          isSetupComplete: isIdentityVerified,
        },
        ...(taxWithholdingDetails ?? {}),
        minWithdrawAmount: ENV_CONFIG.TROLLEY_MINIMUM_PAYMENT_AMOUNT ?? 0,
      };
    } catch (error) {
      this.logger.error('Getting winnings audit failed', error);
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
      { payment_type: 'PAYMENT' | 'POINTS'; total_owed: number }[]
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
          WHEN w.type = 'POINTS' THEN SUM(p.total_amount)
          ELSE 0
        END AS total_owed
      FROM
        winnings w
        LEFT JOIN payment p ON w.winning_id = p.winnings_id
        AND p.payment_status IN ('OWED', 'ON_HOLD', 'CREDITED')
        AND p.installment_number = 1
        INNER JOIN latest_payment_version lpv ON p.winnings_id = lpv.winnings_id
        AND p.version = lpv.max_version
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
