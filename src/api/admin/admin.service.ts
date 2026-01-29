import {
  Injectable,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';
import { PaymentsService } from 'src/shared/payments';

import { ResponseDto } from 'src/dto/api-response.dto';
import { PaymentStatus } from 'src/dto/payment.dto';
import { WinningAuditDto, AuditPayoutDto } from './dto/audit.dto';
import { WinningUpdateRequestDto } from './dto/winnings.dto';
import { TopcoderChallengesService } from 'src/shared/topcoder/challenges.service';
import { Logger, getBaClient } from 'src/shared/global';
import { WinningRequestDto } from 'src/dto/winning.dto';

function formatDate(date = new Date()) {
  const pad = (n, z = 2) => String(n).padStart(z, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}`
  );
}

/**
 * The admin winning service.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly tcChallengesService: TopcoderChallengesService,
  ) {}

  async getBillingAccountsForUser(userId: string): Promise<string[]> {
    const baPrisma = getBaClient();
    const baRows = await baPrisma.billingAccountAccess.findMany({
      where: {
        userId,
      }
    });

    return baRows.map(r => `${r.billingAccountId}`);
  }

  async applyBaAdminUserFilters(
    userId: string,
    isBaAdmin?: boolean,
    filters: WinningRequestDto = {},
  ) {
    if (!isBaAdmin) {
      return filters;
    }

    return {
      ...filters,
      billingAccounts: await this.getBillingAccountsForUser(userId),
    };
  }

  private getWinningById(winningId: string) {
    return this.prisma.winnings.findFirst({ where: { winning_id: winningId } });
  }

  private getPaymentsByWinningsId(winningsId: string, paymentId?: string) {
    return this.prisma.payment.findMany({
      where: {
        winnings_id: {
          equals: winningsId,
        },
        payment_id: paymentId
          ? {
              equals: paymentId,
            }
          : undefined,
      },
      include: {
        winnings: true,
      },
    });
  }

  /**
   * Verify that a BA admin user has access to the billing account(s)
   * associated with the given winningsId. Throws BadRequestException when
   * access is not allowed.
   */
  async verifyBaAdminAccessToWinning(
    winningsId: string,
    userId: string,
  ): Promise<void> {
    const payments = await this.prisma.payment.findMany({
      where: {
        winnings_id: {
          equals: winningsId,
        },
      },
      select: {
        billing_account: true,
      }
    });;

    if (!payments || payments.length === 0) {
      // nothing to check
      return;
    }

    const allowedBAs = await this.getBillingAccountsForUser(userId);
    const paymentBAs = payments
      .map((p) => p.billing_account)
      .filter((b) => b !== null && b !== undefined);

    const unauthorized = paymentBAs.some((ba) => !allowedBAs.includes(`${ba}`));
    if (unauthorized) {
      this.logger.warn(
        `BA admin ${userId} attempted to access winnings ${winningsId} for unauthorized billing account(s)`,
      );
      throw new BadRequestException(
        'BA admin user does not have access to the billing account for this winnings',
      );
    }
  }

  /**
   * Update winnings with parameters
   * @param body the request body
   * @param userId the request user id
   * @returns the Promise with response result
   */
  async updateWinnings(
    body: WinningUpdateRequestDto,
    userId: string,
    isBaAdmin?: boolean,
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    let needsReconciliation = false;
    const winningsId = body.winningsId;
    this.logger.log(
      `updateWinnings called by ${userId} for winningsId=${winningsId}`,
    );
    this.logger.log(`updateWinnings payload: ${JSON.stringify(body)}`);

    if (isBaAdmin) {
      await this.verifyBaAdminAccessToWinning(body.winningsId, userId);
    }

    try {
      const payments = await this.getPaymentsByWinningsId(
        winningsId,
        body.paymentId,
      );

      this.logger.log(
        `Found ${payments.length} payment(s) for winningsId=${winningsId}`,
      );
      if (payments.length === 0) {
        this.logger.warn(
          `No payments found for winningsId=${winningsId}, paymentId=${body.paymentId}`,
        );
        throw new NotFoundException('failed to get current payments');
      }



      let releaseDate;
      if (body.paymentStatus) {
        releaseDate = await this.getPaymentReleaseDateByWinningsId(winningsId);
        this.logger.log(
          `Payment release date for winningsId=${winningsId}: ${releaseDate}`,
        );
      }

      const transactions: ((
        tx: Prisma.TransactionClient,
      ) => Promise<unknown>)[] = [];
      const now = new Date().getTime();

      // iterate payments and build transaction list
      payments.forEach((payment) => {
        this.logger.log(
          `Processing payment ${payment.payment_id} (installment ${payment.installment_number}) with current status=${payment.payment_status}`,
        );

        if (
          payment.payment_status &&
          payment.payment_status === PaymentStatus.CANCELLED
        ) {
          this.logger.warn(
            `Attempt to update cancelled payment ${payment.payment_id} — rejecting`,
          );
          throw new BadRequestException('cannot update cancelled winnings');
        }

        let version = payment.version ?? 1;
        const queuedActions: string[] = [];

        if (body.description) {
          transactions.push((tx) =>
            tx.payment.update({
              where: {
                payment_id: payment.payment_id,
                version: version,
              },
              data: {
                winnings: {
                  update: {
                    data: {
                      description: body.description,
                    },
                  },
                },
                updated_at: new Date(),
                updated_by: userId,
                version,
              },
            }),
          );
          queuedActions.push(
            `update description -> "${body.description}" (version ${version})`,
          );

          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                `Modified payment description from "${payment.winnings.description}" to "${body.description}"`,
                body.auditNote,
                tx,
              ),
            );
            queuedActions.push('add audit for description change');
          }
        }

        let paymentStatus = payment.payment_status as PaymentStatus;
        // Update Payment Status if requested
        if (body.paymentStatus) {
          let errMessage = '';
          switch (body.paymentStatus) {
            case PaymentStatus.ON_HOLD_ADMIN:
              errMessage = 'cannot put a processing payment on hold';
              break;
            case PaymentStatus.CANCELLED:
              errMessage = 'cannot cancel processing payment';
              break;
            case PaymentStatus.OWED:
              if (releaseDate) {
                const sinceRelease =
                  (now - releaseDate.getTime()) / (3600 * 1000);
                if (sinceRelease < 12) {
                  errMessage = `Cannot put a processing payment back to owed, unless it's been processing for at least 12 hours.  Currently it's only been ${sinceRelease.toFixed(1)} hours`;
                } else {
                  transactions.push((tx) =>
                    this.markPaymentReleaseAsFailedByWinningsId(winningsId, tx),
                  );
                }
              } else {
                errMessage = 'cannot put a processing payment back to owed';
                if (
                  payment.payment_status !== PaymentStatus.ON_HOLD_ADMIN &&
                  payment.payment_status !== PaymentStatus.PAID
                ) {
                  this.logger.warn(
                    `Invalid attempt to set OWED for payment ${payment.payment_id} when not on hold admin or paid`,
                  );
                  throw new BadRequestException(
                    "cannot put a payment back to owed unless it is on hold by an admin, or it's been paid",
                  );
                }
              }

              break;

            default:
              this.logger.warn(
                `Invalid payment status provided: ${body.paymentStatus}`,
              );
              throw new BadRequestException('invalid payment status provided');
          }

          if (
            errMessage &&
            payment.payment_status === PaymentStatus.PROCESSING
          ) {
            this.logger.warn(
              `Rejected status change for ${payment.payment_id}: ${errMessage}`,
            );
            throw new BadRequestException(errMessage);
          }

          transactions.push((tx) =>
            this.updatePaymentStatus(
              userId,
              winningsId,
              payment.payment_id,
              payment.payment_status,
              body.paymentStatus,
              version++,
              tx,
            ),
          );
          queuedActions.push(
            `update status ${payment.payment_status} -> ${body.paymentStatus}`,
          );

          paymentStatus = body.paymentStatus as PaymentStatus;

          if (body.paymentStatus === PaymentStatus.OWED) {
            needsReconciliation = true;
            this.logger.log(
              `Payment ${payment.payment_id} marked OWED; will trigger reconciliation later`,
            );
          }

          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                `Modified payment status from ${payment.payment_status} to ${body.paymentStatus}`,
                body.auditNote,
                tx,
              ),
            );
            queuedActions.push('add audit for status change');
          }
        }

        // Update Release Date if requested
        if (body.releaseDate) {
          const newReleaseDate = new Date(body.releaseDate);

          if (
            ![
              PaymentStatus.OWED,
              PaymentStatus.ON_HOLD,
              PaymentStatus.ON_HOLD_ADMIN,
            ].includes(paymentStatus)
          ) {
            this.logger.warn(
              `Cannot update release date for payment ${payment.payment_id} in status ${paymentStatus}`,
            );
            throw new BadRequestException(
              `Cannot update release date for payment unless it's in one of the states: ${[
                PaymentStatus.OWED,
                PaymentStatus.ON_HOLD,
                PaymentStatus.ON_HOLD_ADMIN,
              ].join(', ')}`,
            );
          }

          transactions.push((tx) =>
            this.updateReleaseDate(
              userId,
              winningsId,
              payment.payment_id,
              newReleaseDate,
              version++,
              tx,
            ),
          );
          queuedActions.push(
            `update release_date ${payment.release_date?.toISOString()} -> ${newReleaseDate.toISOString()}`,
          );

          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                `Modified release date from ${payment.release_date?.toISOString()} to ${newReleaseDate.toISOString()}`,
                body.auditNote,
                tx,
              ),
            );
            queuedActions.push('add audit for release date change');
          }
        }

        // Update payment amount if requested
        if (
          body.paymentAmount !== undefined &&
          (payment.payment_status === PaymentStatus.OWED ||
            payment.payment_status === PaymentStatus.ON_HOLD ||
            payment.payment_status === PaymentStatus.ON_HOLD_ADMIN)
        ) {
          // ideally we should be maintaining the original split of the payment amount between installments - but we aren't really using splits anymore
          if (payment.installment_number === 1) {
            transactions.push((tx) =>
              this.updatePaymentAmount(
                userId,
                winningsId,
                payment.payment_id,
                body.paymentAmount,
                body.paymentAmount,
                body.paymentAmount,
                version,
                tx,
              ),
            );

            transactions.push((tx) =>
              this.addAudit(
                userId,
                winningsId,
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `Modified payment amount from ${payment.total_amount} to ${body.paymentAmount.toFixed(2)}`,
                body.auditNote,
                tx,
              ),
            );

            queuedActions.push(
              `update amounts -> ${body.paymentAmount.toFixed(2)} (installment 1)`,
            );
          } else {
            transactions.push((tx) =>
              this.updatePaymentAmount(
                userId,
                winningsId,
                payment.payment_id,
                0,
                0,
                body.paymentAmount,
                version,
                tx,
              ),
            );
            queuedActions.push(
              `update amounts -> total ${body.paymentAmount.toFixed(2)} (installment ${payment.installment_number})`,
            );
          }
        }

        this.logger.log(
          `Queued ${queuedActions.length} action(s) for payment ${payment.payment_id}: ${queuedActions.join(
            ' ; ',
          )}`,
        );
      });

      this.logger.log(
        `Executing ${transactions.length} transaction step(s) for winningsId=${winningsId}`,
      );

      // Run all transaction tasks in a single prisma transaction
      await this.prisma.$transaction(async (tx) => {
        for (let i = 0; i < transactions.length; i++) {
          this.logger.log(
            `Executing transaction ${i + 1}/${transactions.length}`,
          );
          await transactions[i](tx);
        }
      });

      this.logger.log(
        `Successfully executed transactions for winningsId=${winningsId}`,
      );

      if (needsReconciliation) {
        const winning = await this.prisma.winnings.findFirst({
          select: {
            winner_id: true,
          },
          where: {
            winning_id: winningsId,
          },
        });

        if (winning?.winner_id) {
          this.logger.log(
            `Triggering payments reconciliation for user ${winning.winner_id}`,
          );
          await this.paymentsService.reconcileUserPayments(winning.winner_id);
          this.logger.log(
            `Reconciliation triggered for user ${winning.winner_id}`,
          );
        } else {
          this.logger.warn(
            `Needs reconciliation but no winner_id found for winningsId=${winningsId}`,
          );
        }
      }

      result.data = 'Successfully updated winnings';
      this.logger.log(
        `updateWinnings completed for winningsId=${winningsId}: ${result.data}`,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        this.logger.warn(
          `updateWinnings validation error for winningsId=${winningsId}: ${error.message}`,
        );
        throw error;
      }
      this.logger.error('Updating winnings failed', error);
      const message = 'Updating winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }

  private async getPaymentReleaseDateByWinningsId(
    winningsId: string,
  ): Promise<Date | null | undefined> {
    const paymentReleases = await this.prisma.payment_releases.findFirst({
      where: {
        payment_release_associations: {
          some: {
            payment: {
              winnings_id: {
                equals: winningsId,
              },
            },
          },
        },
      },
      include: {
        payment_release_associations: {
          include: {
            payment: true,
          },
        },
      },
    });

    return paymentReleases?.release_date;
  }

  private markPaymentReleaseAsFailedByWinningsId(
    winningsId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment_releases.updateMany({
      where: {
        payment_release_associations: {
          some: {
            payment: {
              winnings_id: {
                equals: winningsId,
              },
            },
          },
        },
      },
      data: {
        status: 'FAILED',
      },
    });
  }

  private updatePaymentStatus(
    userId: string,
    winningsId: string,
    paymentId: string,
    oldPaymentStatus: string | null,
    newPaymentStatus: PaymentStatus,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ) {
    let setDatePaidNull = false;
    if (
      [
        PaymentStatus.PAID,
        PaymentStatus.PROCESSING,
        PaymentStatus.RETURNED,
        PaymentStatus.FAILED,
      ].includes(oldPaymentStatus as PaymentStatus) &&
      newPaymentStatus === PaymentStatus.OWED
    ) {
      setDatePaidNull = true;
    }

    return (tx ?? this.prisma).payment.update({
      where: {
        payment_id: paymentId,
        winnings_id: winningsId,
        version: currentVersion,
      },
      data: {
        payment_status: newPaymentStatus,
        updated_at: new Date(),
        updated_by: userId,
        version: currentVersion + 1,
        date_paid: setDatePaidNull ? null : undefined,
      },
    });
  }

  private addAudit(
    userId: string,
    winningsId: string,
    action: string,
    auditNote?: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).audit.create({
      data: {
        user_id: userId,
        winnings_id: winningsId,
        action,
        note: auditNote,
      },
    });
  }

  private updateReleaseDate(
    userId: string,
    winningsId: string,
    paymentId: string,
    newReleaseDate: Date,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment.update({
      where: {
        payment_id: paymentId,
        winnings_id: winningsId,
        version: currentVersion,
        payment_status: {
          in: [
            PaymentStatus.OWED,
            PaymentStatus.ON_HOLD,
            PaymentStatus.ON_HOLD_ADMIN,
          ],
        },
      },
      data: {
        release_date: newReleaseDate,
        updated_at: new Date(),
        updated_by: userId,
        version: currentVersion + 1,
      },
    });
  }

  private updatePaymentAmount(
    userId: string,
    winningsId: string,
    paymentId: string,
    netAmount: number,
    grossAmount: number,
    totalAmount: number,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).payment.update({
      where: {
        payment_id: paymentId,
        winnings_id: winningsId,
        version: currentVersion,
        payment_status: {
          in: [
            PaymentStatus.OWED,
            PaymentStatus.ON_HOLD,
            PaymentStatus.ON_HOLD_ADMIN,
            PaymentStatus.PAID,
            PaymentStatus.PROCESSING,
          ],
        },
      },
      data: {
        net_amount: netAmount,
        gross_amount: grossAmount,
        total_amount: totalAmount,
        updated_at: new Date(),
        updated_by: userId,
        version: currentVersion + 1,
      },
    });
  }

  /**
   * Get winning audit for winningId
   * @param winningId the winningId
   * @returns the Promise with response result
   */
  async getWinningAudit(
    winningId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ResponseDto<WinningAuditDto[]>> {
    const result = new ResponseDto<WinningAuditDto[]>();

    try {
      const audits = await (tx ?? this.prisma).audit.findMany({
        where: {
          winnings_id: {
            equals: winningId,
          },
        },
        take: 1000,
        orderBy: { created_at: 'desc' },
      });

      result.data = audits.map((item) => ({
        id: item.id,
        winningsId: item.winnings_id,
        userId: item.user_id,
        action: item.action,
        note: item.note,
        createdAt: item.created_at,
      }));
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

  /**
   * Get winning audit for winningId
   * @param winningId the winningId
   * @returns the Promise with response result
   */
  async getWinningAuditPayout(
    winningId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ResponseDto<AuditPayoutDto[]>> {
    const result = new ResponseDto<AuditPayoutDto[]>();

    try {
      const paymentReleases = await (
        tx ?? this.prisma
      ).payment_releases.findMany({
        where: {
          payment_release_associations: {
            some: {
              payment: {
                winnings_id: {
                  equals: winningId,
                },
              },
            },
          },
        },
        include: {
          payment_release_associations: {
            include: {
              payment: true,
            },
          },
          payment_method: true,
        },
        orderBy: [
          {
            created_at: 'desc',
          },
        ],
      });

      result.data = paymentReleases.map((item) => ({
        externalTransactionId: item.external_transaction_id ?? '',
        status: item.status ?? '',
        totalNetAmount: item.total_net_amount.toNumber(),
        createdAt: item.created_at!,
        metadata: JSON.stringify(item.metadata),
        paymentMethodUsed: item.payment_method.name,
        externalTransactionDetails: {},
      }));
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
}
