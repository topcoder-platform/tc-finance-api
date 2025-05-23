import { Injectable, Logger } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { PrismaService } from 'src/shared/global/prisma.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { payment_releases, payment_status, Prisma } from '@prisma/client';
import { TrolleyService } from 'src/shared/global/trolley.service';
import { PaymentsService } from 'src/shared/payments';
import {
  TopcoderChallengesService,
  WithdrawUpdateData,
} from 'src/shared/topcoder/challenges.service';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';
import { MEMBER_FIELDS } from 'src/shared/topcoder';

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

function formatDate(date = new Date()) {
  const pad = (n, z = 2) => String(n).padStart(z, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}`
  );
}

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxFormRepo: TaxFormRepository,
    private readonly paymentsService: PaymentsService,
    private readonly paymentMethodRepo: PaymentMethodRepository,
    private readonly trolleyService: TrolleyService,
    private readonly tcChallengesService: TopcoderChallengesService,
    private readonly tcMembersService: TopcoderMembersService,
  ) {}

  getTrolleyRecipientByUserId(userId: string) {
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
  ) {
    try {
      const paymentRelease = await tx.payment_releases.create({
        data: {
          user_id: userId,
          total_net_amount: totalAmount,
          status: payment_status.PROCESSING,
          payment_method_id: paymentMethodId,
          payee_id: recipientId,
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
  ) {
    this.logger.log('Processing withdrawal request');
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

    let userInfo: { email: string };
    this.logger.debug(`Getting user details for user ${userHandle}(${userId})`);
    try {
      userInfo = (await this.tcMembersService.getMemberInfoByUserHandle(
        userHandle,
        { fields: [MEMBER_FIELDS.email] },
      )) as { email: string };
    } catch {
      throw new Error('Failed to fetch UserInfo for withdrawal!');
    }

    if (userInfo.email.toLowerCase().indexOf('wipro.com') > -1) {
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

        const totalAmount = this.checkTotalAmount(winnings);

        this.logger.log('Begin processing payments', winnings);

        const recipient = await this.getTrolleyRecipientByUserId(userId);

        if (!recipient) {
          throw new Error(`Trolley recipient not found for user '${userId}'!`);
        }

        const paymentRelease = await this.createDbPaymentRelease(
          tx,
          userId,
          totalAmount,
          connectedPaymentMethod.payment_method_id,
          recipient.trolley_id,
          winnings,
        );

        const paymentBatch = await this.trolleyService.startBatchPayment(
          `${userId}_${userHandle}`,
        );

        const trolleyPayment = await this.trolleyService.createPayment(
          recipient.trolley_id,
          paymentBatch.id,
          totalAmount,
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

        try {
          for (const winning of winnings) {
            const payoutData: WithdrawUpdateData = {
              userId: +userId,
              status: 'Paid',
              datePaid: formatDate(new Date()),
            };

            await this.tcChallengesService.updateLegacyPayments(
              winning.externalId as string,
              payoutData,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to update legacy payment while withdrawing for challenge ${error?.message ?? error}`,
            error,
          );
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
