import { Injectable } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { PrismaService } from 'src/shared/global/prisma.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { IdentityVerificationRepository } from '../repository/identity-verification.repo';
import {
  payment_releases,
  payment_status,
  Prisma,
  reference_type,
} from '@prisma/client';
import { TrolleyService } from 'src/shared/global/trolley.service';
import { PaymentsService } from 'src/shared/payments';
import { TopcoderChallengesService } from 'src/shared/topcoder/challenges.service';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';
import { BasicMemberInfo, BASIC_MEMBER_FIELDS } from 'src/shared/topcoder';
import { Logger } from 'src/shared/global';
import { OtpService } from 'src/shared/global/otp.service';

const TROLLEY_MINIMUM_PAYMENT_AMOUNT =
  ENV_CONFIG.TROLLEY_MINIMUM_PAYMENT_AMOUNT;

interface ReleasableWinningRow {
  paymentId: string;
  amount: number;
  version: number;
  title: string;
  externalId: string | undefined;
  status: payment_status;
  releaseDate: Date;
  datePaid: Date;
}

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentsService: PaymentsService,
    private readonly paymentMethodRepo: PaymentMethodRepository,
    private readonly identityVerificationRepo: IdentityVerificationRepository,
    private readonly trolleyService: TrolleyService,
    private readonly tcChallengesService: TopcoderChallengesService,
    private readonly tcMembersService: TopcoderMembersService,
    private readonly otpService: OtpService,
  ) {}

  getDbTrolleyRecipientByUserId(userId: string) {
    return this.prisma.trolley_recipient.findUnique({
      where: { user_id: userId },
    });
  }

  private async getReleasableWinningsForUserId(
    userId: string,
    winningsIds: string[],
    tx: Prisma.TransactionClient,
  ) {
    const winnings = await tx.$queryRaw<ReleasableWinningRow[]>`
      SELECT p.payment_id as "paymentId", p.total_amount as amount, p.version, w.title, w.external_id as "externalId", p.payment_status as status, p.release_date as "releaseDate", p.date_paid as "datePaid"
      FROM payment p INNER JOIN winnings w on p.winnings_id = w.winning_id
      AND p.installment_number = 1
      WHERE p.winnings_id = ANY(${winningsIds}::uuid[]) AND w.winner_id = ${userId}
      FOR UPDATE NOWAIT
    `;

    if (winnings.length < winningsIds.length) {
      throw new Error('Some winnings were not found!');
    }

    if (winnings.some((w) => w.status !== payment_status.OWED)) {
      throw new Error(
        'Some or all of the winnings you requested to process are either on hold or already paid.',
      );
    }

    if (winnings.some((w) => !!w.datePaid)) {
      throw new Error(
        'Some or all of the winnings you requested to process are already paid.',
      );
    }

    if (winnings.some((w) => +w.releaseDate > Date.now())) {
      throw new Error(
        'Some or all of the winnings you requested to process are not released yet (release date).',
      );
    }

    return winnings;
  }

  private checkTotalAmount(winnings: ReleasableWinningRow[]) {
    const totalAmount = winnings.reduce(
      (sum, row) => sum + parseFloat(row.amount as unknown as string),
      0,
    );

    if (totalAmount < TROLLEY_MINIMUM_PAYMENT_AMOUNT) {
      throw new Error(
        `The withdrawal amount is below the minimum required threshold of $${TROLLEY_MINIMUM_PAYMENT_AMOUNT} USD. Please select winnings that sum up to $${TROLLEY_MINIMUM_PAYMENT_AMOUNT} USD or more to proceed.`,
      );
    }

    return totalAmount;
  }

  private async createDbPaymentRelease(
    tx: Prisma.TransactionClient,
    userId: string,
    totalAmount: number,
    paymentMethodId: number,
    recipientId: string,
    winnings: ReleasableWinningRow[],
    metadata: any,
  ) {
    try {
      const paymentRelease = await tx.payment_releases.create({
        data: {
          user_id: userId,
          total_net_amount: totalAmount,
          status: payment_status.PROCESSING,
          payment_method_id: paymentMethodId,
          payee_id: recipientId,
          metadata,
          payment_release_associations: {
            createMany: {
              data: winnings.map((w) => ({
                payment_id: w.paymentId,
              })),
            },
          },
        },
      });

      this.logger.log(
        `DB payment_release created successfully. ID: ${paymentRelease.payment_release_id}`,
      );

      return paymentRelease;
    } catch (error) {
      const errorMsg = `Failed to create DB payment_release: ${error.message}`;
      this.logger.error(errorMsg, error);
      throw new Error(errorMsg);
    }
  }

  private async updateDbReleaseRecord(
    tx: Prisma.TransactionClient,
    paymentRelease: payment_releases,
    externalTxId: string,
  ) {
    try {
      await tx.payment_releases.update({
        where: { payment_release_id: paymentRelease.payment_release_id },
        data: { external_transaction_id: externalTxId },
      });

      this.logger.log(
        `DB payment_release[${paymentRelease.payment_release_id}] updated successfully with trolley payment id: ${externalTxId}`,
      );
    } catch (error) {
      const errorMsg = `Failed to update DB payment_release: ${error.message}`;
      this.logger.error(errorMsg, error);
      throw new Error(errorMsg);
    }
  }

  async withdraw(
    userId: string,
    userHandle: string,
    winningsIds: string[],
    paymentMemo?: string,
    otpCode?: string,
  ) {
    this.logger.log(
      `Processing withdrawal request for user ${userHandle}(${userId}), winnings: ${winningsIds.join(', ')}`,
    );

    const hasActiveTaxForm = await this.taxFormRepo.hasActiveTaxForm(userId);

    if (!hasActiveTaxForm) {
      throw new Error(
        'Please complete your tax form before making a withdrawal.',
      );
    }

    const connectedPaymentMethod =
      await this.paymentMethodRepo.getConnectedPaymentMethod(userId);

    if (!connectedPaymentMethod) {
      throw new Error(
        'Please add a payment method before making a withdrawal.',
      );
    }

    const isIdentityVerified =
      await this.identityVerificationRepo.completedIdentityVerification(userId);

    if (!isIdentityVerified) {
      throw new Error(
        'Please complete identity verification before making a withdrawal.',
      );
    }

    let userInfo: BasicMemberInfo;
    this.logger.debug(`Getting user details for user ${userHandle}(${userId})`);
    try {
      userInfo = (await this.tcMembersService.getMemberInfoByUserHandle(
        userHandle,
        { fields: BASIC_MEMBER_FIELDS },
      )) as unknown as BasicMemberInfo;
    } catch {
      throw new Error('Failed to fetch UserInfo for withdrawal!');
    }

    if (!otpCode) {
      const otpError = await this.otpService.generateOtpCode(
        userInfo,
        reference_type.WITHDRAW_PAYMENT,
      );
      return { error: otpError };
    } else {
      const otpResponse = await this.otpService.verifyOtpCode(
        otpCode,
        userInfo,
        reference_type.WITHDRAW_PAYMENT,
      );

      if (!otpResponse || otpResponse.code !== 'success') {
        return { error: otpResponse };
      }
    }

    if (userInfo.email.toLowerCase().indexOf('wipro.com') > -1) {
      this.logger.error(
        `User ${userHandle}(${userId}) attempted withdrawal but is restricted due to email domain '${userInfo.email}'.`,
      );
      throw new Error(
        'Please contact Topgear support to process your withdrawal.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const winnings = await this.getReleasableWinningsForUserId(
          userId,
          winningsIds,
          tx,
        );

        this.logger.log(
          `Begin processing payments for user ${userHandle}(${userId})`,
          winnings,
        );

        const dbTrolleyRecipient =
          await this.getDbTrolleyRecipientByUserId(userId);

        if (!dbTrolleyRecipient) {
          throw new Error(
            `Trolley recipient not found for user ${userHandle}(${userId})!`,
          );
        }

        const totalAmount = this.checkTotalAmount(winnings);
        let paymentAmount = totalAmount;
        let feeAmount = 0;
        const trolleyRecipientPayoutDetails =
          await this.trolleyService.getRecipientPayoutDetails(
            dbTrolleyRecipient.trolley_id,
          );

        if (!trolleyRecipientPayoutDetails) {
          throw new Error(
            `Recipient payout details not found for Trolley Recipient ID '${dbTrolleyRecipient.trolley_id}', for user ${userHandle}(${userId}).`,
          );
        }

        if (
          trolleyRecipientPayoutDetails.payoutMethod === 'paypal' &&
          ENV_CONFIG.TROLLEY_PAYPAL_FEE_PERCENT
        ) {
          const feePercent =
            Number(ENV_CONFIG.TROLLEY_PAYPAL_FEE_PERCENT) / 100;

          feeAmount = +Math.min(
            ENV_CONFIG.TROLLEY_PAYPAL_FEE_MAX_AMOUNT,
            feePercent * paymentAmount,
          ).toFixed(2);

          paymentAmount -= feeAmount;
        }

        this.logger.log(
          `
            Total amount won: $${totalAmount.toFixed(2)} USD, to be paid: $${paymentAmount.toFixed(2)} USD.
            Payout method type: ${trolleyRecipientPayoutDetails.payoutMethod}.
          `,
        );

        const paymentRelease = await this.createDbPaymentRelease(
          tx,
          userId,
          paymentAmount,
          connectedPaymentMethod.payment_method_id,
          dbTrolleyRecipient.trolley_id,
          winnings,
          {
            netAmount: paymentAmount,
            feeAmount,
            totalAmount: totalAmount,
            payoutMethod: trolleyRecipientPayoutDetails.payoutMethod,
            env_trolley_paypal_fee_percent:
              ENV_CONFIG.TROLLEY_PAYPAL_FEE_PERCENT,
            env_trolley_paypal_fee_max_amount:
              ENV_CONFIG.TROLLEY_PAYPAL_FEE_MAX_AMOUNT,
          },
        );

        const paymentBatch = await this.trolleyService.startBatchPayment(
          `${userId}_${userHandle}`,
        );

        const trolleyPayment = await this.trolleyService.createPayment(
          dbTrolleyRecipient.trolley_id,
          paymentBatch.id,
          paymentAmount,
          paymentRelease.payment_release_id,
          paymentMemo,
        );

        await this.updateDbReleaseRecord(tx, paymentRelease, trolleyPayment.id);

        try {
          await this.paymentsService.updatePaymentProcessingState(
            winningsIds,
            payment_status.PROCESSING,
            tx,
          );
        } catch (e) {
          this.logger.error(
            `Failed to update payment processing state: ${e.message} for winnings '${winningsIds.join(',')}`,
          );
          throw new Error('Failed to update payment processing state!');
        }

        try {
          await this.trolleyService.startProcessingPayment(paymentBatch.id);
        } catch (error) {
          const errorMsg = `Failed to release payment: ${error.message}`;
          this.logger.error(errorMsg, error);
          throw new Error(errorMsg);
        }
      });
    } catch (error) {
      if (error.code === 'P2010' && error.meta?.code === '55P03') {
        this.logger.error(
          'Payment request denied because payment row was locked previously!',
          error,
        );

        throw new Error(
          'Some or all of the winnings you requested to process are either processing, on hold or already paid.',
        );
      } else {
        throw error;
      }
    }
  }
}
