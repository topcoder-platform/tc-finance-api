import { Injectable, Logger } from '@nestjs/common';
import { ENV_CONFIG } from 'src/config';
import { PrismaService } from 'src/shared/global/prisma.service';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';
import { payment_status } from '@prisma/client';
import { TrolleyService } from 'src/shared/global/trolley.service';
import { PaymentsService } from 'src/shared/payments';

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
    private readonly trolleyService: TrolleyService,
  ) {}

  getTrolleyRecipientByUserId(userId: string) {
    return this.prisma.trolley_recipient.findUnique({
      where: { user_id: userId },
    });
  }

  private async getReleasableWinningsForUserId(
    userId: string,
    winningsIds: string[],
  ) {
    const winnings = await this.prisma.$queryRaw<ReleasableWinningRow[]>`
      SELECT p.payment_id as "paymentId", p.total_amount as amount, p.version, w.title, w.external_id as "externalId", p.payment_status as status, p.release_date as "releaseDate", p.date_paid as "datePaid"
      FROM payment p INNER JOIN winnings w on p.winnings_id = w.winning_id
      AND p.installment_number = 1
      WHERE p.winnings_id = ANY(${winningsIds}::uuid[]) AND w.winner_id = ${userId}
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

  async withdraw(userId: string, userHandle: string, winningsIds: string[]) {
    this.logger.log('Processing withdrawal request');
    const hasActiveTaxForm = await this.taxFormRepo.hasActiveTaxForm(userId);

    if (!hasActiveTaxForm) {
      throw new Error(
        'Please complete your tax form before making a withdrawal.',
      );
    }

    const hasVerifiedPaymentMethod =
      await this.paymentMethodRepo.hasVerifiedPaymentMethod(userId);

    if (!hasVerifiedPaymentMethod) {
      throw new Error(
        'Please add a payment method before making a withdrawal.',
      );
    }

    const winnings = await this.getReleasableWinningsForUserId(
      userId,
      winningsIds,
    );

    const totalAmount = this.checkTotalAmount(winnings);

    this.logger.log('Begin processing payments', winnings);
    await this.prisma.$transaction(async (tx) => {
      const recipient = await this.getTrolleyRecipientByUserId(userId);

      if (!recipient) {
        throw new Error(`Trolley recipient not found for user '${userId}'!`);
      }

      const paymentBatch = await this.trolleyService.startBatchPayment(
        recipient.trolley_id,
        `${userId}_${userHandle}`,
        totalAmount,
        winningsIds,
      );

      if (!paymentBatch) {
        return;
      }

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
        const paymentRelease = await tx.payment_releases.create({
          data: {
            user_id: userId,
            total_net_amount: totalAmount,
            status: payment_status.PROCESSING,
            payment_method_id: hasVerifiedPaymentMethod.payment_method_id,
            payee_id: recipient.trolley_id,
            external_transaction_id: paymentBatch.id,
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
          `Payment release created successfully. ID: ${paymentRelease.payment_release_id}`,
        );
      } catch (error) {
        this.logger.error(`Failed to create payment release: ${error.message}`);
        throw new Error('Failed to create db entry for payment release!');
      }

      try {
        // generate quote
        await this.trolleyService.client.batch.generateQuote(paymentBatch.id);

        // trigger trolley payment (batch) process
        await this.trolleyService.client.batch.startProcessing(paymentBatch.id);
      } catch (error) {
        this.logger.error(
          `Failed to process trolley payment batch: ${error.message}`,
        );
        throw new Error('Failed to process trolley payment batch!');
      }
    });
  }
}
