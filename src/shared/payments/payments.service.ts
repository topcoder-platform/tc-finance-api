import { Injectable } from '@nestjs/common';
import { PrismaService } from '../global/prisma.service';
import { payment_status, Prisma } from '@prisma/client';
import { uniq } from 'lodash';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the payout setup status for a list of users.
   *
   * This method queries the database to determine whether each user's payout setup
   * is complete or still in progress. A user's payout setup is considered complete
   * if their tax form status is 'ACTIVE' and their payment method status is 'CONNECTED'.
   *
   * @param userIds - An array of user IDs for which to retrieve the payout setup status.
   * @returns A promise that resolves to an object containing two arrays:
   *          - `complete`: An array of user IDs whose payout setup is complete.
   *          - `inProgress`: An array of user IDs whose payout setup is still in progress.
   *
   * @throws Will throw an error if the database query fails.
   */
  private async getUsersPayoutStatus(userIds: string[]) {
    const usersPayoutStatus = await this.prisma.$queryRaw<
      {
        userId: string;
        setupComplete: boolean;
      }[]
    >`
        SELECT
          upm.user_id as "userId",
          CASE WHEN utx.tax_form_status = 'ACTIVE' AND upm.status = 'CONNECTED' THEN TRUE ELSE FALSE END as "setupComplete"
        FROM user_payment_methods upm
        LEFT JOIN user_tax_form_associations utx ON upm.user_id = utx.user_id AND utx.tax_form_status = 'ACTIVE'
        WHERE upm.user_id IN (${Prisma.join(uniq(userIds))})
      `;

    const setupStatusMap = {
      complete: [] as string[],
      inProgress: [] as string[],
    };

    usersPayoutStatus.forEach((user) => {
      setupStatusMap[user.setupComplete ? 'complete' : 'inProgress'].push(
        user.userId,
      );
    });

    return setupStatusMap;
  }

  /**
   * Updates the payment status of users' payments based on the provided user IDs and the desired status.
   *
   * @param userIds - An array of user IDs whose payment statuses need to be updated.
   * @param setOnHold - A boolean indicating whether to set the payment status to "ON_HOLD" (true)
   *                    or revert it to "OWED" (false).
   * @returns A raw Prisma query that updates the payment statuses in the database.
   *
   * The function performs the following:
   * - Updates the `payment_status` field in the `payment` table.
   * - Changes the status to "ON_HOLD" if `setOnHold` is true, or to "OWED" if `setOnHold` is false.
   * - Ensures that only payments associated with the specified users' winnings are updated.
   */
  private toggleUserPaymentsStatus(userIds: string[], setOnHold: boolean) {
    return this.prisma.$queryRaw`
      UPDATE payment
      SET payment_status = ${setOnHold ? payment_status.ON_HOLD : payment_status.OWED}::payment_status
      FROM winnings w
      WHERE payment.payment_status = ${setOnHold ? payment_status.OWED : payment_status.ON_HOLD}::payment_status
        AND payment.winnings_id = w.winning_id
        AND w.winner_id IN (${Prisma.join(uniq(userIds))});
    `;
  }

  /**
   * Reconciles the payment statuses of the specified users by updating their payment records.
   *
   * @param userIds - A list of user IDs whose payment statuses need to be reconciled.
   *
   * The method performs the following steps:
   * 1. Retrieves the payout status of the specified users.
   * 2. Updates the payment status for users whose payments are complete to `OWED`.
   * 3. Updates the payment status for users whose payments are in progress to `ON_HOLD`.
   *
   * This ensures that the payment statuses are accurately reflected in the system.
   */
  async reconcileUserPayments(...userIds: string[]) {
    const usersPayoutStatus = await this.getUsersPayoutStatus(userIds);

    if (usersPayoutStatus.complete.length) {
      await this.toggleUserPaymentsStatus(usersPayoutStatus.complete, false);
    }

    if (usersPayoutStatus.inProgress.length) {
      await this.toggleUserPaymentsStatus(usersPayoutStatus.inProgress, true);
    }
  }

  async updatePaymentProcessingState(
    winningsIds: string[],
    status: payment_status,
    transaction?: Prisma.TransactionClient,
  ) {
    try {
      const prismaClient = transaction || this.prisma;

      const r = await prismaClient.payment.updateMany({
        where: {
          winnings_id: { in: winningsIds },
        },
        data: {
          version: { increment: 1 },
          payment_status: status,
          updated_at: new Date(),
          date_paid: status === 'PAID' ? new Date() : undefined,
        },
      });

      if (r.count === 0 || r.count !== winningsIds.length) {
        throw new Error(
          'Failed to set payment processing state! Not all rows were updated! Please check the provided winnings IDs and status.',
        );
      }
    } catch (error) {
      throw new Error(
        `Error updating payment processing state: '${error.message}'`,
      );
    }
  }

  async updatePaymentReleaseState(
    externalTransactionId: string,
    status: string,
    transaction?: Prisma.TransactionClient,
  ) {
    const prismaClient = transaction || this.prisma;
    try {
      const r = await prismaClient.payment_releases.updateMany({
        where: {
          external_transaction_id: externalTransactionId,
        },
        data: {
          status,
        },
      });

      if (r.count === 0) {
        throw new Error(
          'Failed to update payment release status! No rows were updated. Please check the provided externalTransaction ID and status.',
        );
      }
    } catch (error) {
      throw new Error(
        `Error updating payment release processing state: '${error.message}'`,
      );
    }
  }
}
