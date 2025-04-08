import {
  Injectable,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaPromise } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

import {
  DateFilterType,
  ResponseDto,
  WinningAuditDto,
  WinningRequestDto,
  SearchWinningResult,
  WinningUpdateRequestDto,
  PaymentStatus,
  AuditPayoutDto,
} from 'src/dto/adminWinning.dto';
import { TaxFormRepository } from '../repository/taxForm.repo';
import { PaymentMethodRepository } from '../repository/paymentMethod.repo';

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * The admin winning service.
 */
@Injectable()
export class AdminWinningService {
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
   * Search winnings with parameters
   * @param body the request body
   * @returns the Promise with response result
   */
  async searchWinnings(
    body: WinningRequestDto,
  ): Promise<ResponseDto<SearchWinningResult>> {
    const result = new ResponseDto<SearchWinningResult>();

    try {
      let winnerIds: string[] | undefined;
      if (body.winnerId) {
        winnerIds = [body.winnerId];
      } else if (body.winnerIds) {
        winnerIds = [...body.winnerIds];
      }

      let query;
      let orderBy;

      if (body.externalIds && body.externalIds.length > 0) {
        query = this.getQueryByExternalIDs(body);
        orderBy = this.getOrderByWithExternalIDs(body);
      } else if (winnerIds) {
        query = this.getQueryByWinnerId(body, winnerIds);
        orderBy = this.getOrderByWithWinnerId(body);
      } else {
        query = this.getQueryByWinnerId(body, undefined);
        orderBy = this.getOrderByWithExternalIDs(body);
      }

      const [winnings, count] = await this.prisma.$transaction([
        this.prisma.winnings.findMany({
          ...query,
          include: {
            payment: {
              where: {
                installment_number: 1,
              },
              orderBy: [
                {
                  created_at: 'desc',
                },
              ],
            },
            origin: true,
          },
          orderBy,
          skip: body.offset,
          take: body.limit,
        }),
        this.prisma.winnings.count({ where: query.where }),
      ]);

      result.data = {
        winnings: winnings.map((item) => ({
          id: item.winning_id,
          type: item.type,
          winnerId: item.winner_id,
          origin: item.origin?.origin_name,
          category: item.category,
          title: item.title,
          description: item.description,
          externalId: item.external_id,
          attributes: item.attributes,
          details: item.payment?.map((paymentItem) => ({
            id: paymentItem.payment_id,
            netAmount: Number(paymentItem.net_amount),
            grossAmount: Number(paymentItem.gross_amount),
            totalAmount: Number(paymentItem.total_amount),
            installmentNumber: paymentItem.installment_number,
            datePaid: paymentItem.date_paid ?? undefined,
            status: paymentItem.payment_status,
            currency: paymentItem.currency,
            releaseDate: paymentItem.release_date,
            category: item.category,
          })),
          createdAt: item.created_at,
          updatedAt:
            item.payment?.[0].date_paid ??
            item.payment?.[0].updated_at ??
            undefined,
          releaseDate: item.payment?.[0]?.release_date,
        })),
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / body.limit),
          pageSize: body.limit,
          currentPage: Math.ceil(body.offset / body.limit) + 1,
        },
      };
      // response.data = winnings as any
    } catch (error) {
      console.error('Searching winnings failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }

  private generateFilterDate(body: WinningRequestDto) {
    let filterDate: object | undefined;
    const currentDay = new Date(new Date().setHours(0, 0, 0, 0));
    switch (body.date) {
      case DateFilterType.LAST7DAYS:
        // eslint-disable-next-line no-case-declarations
        const last7days = new Date(currentDay.getTime() - 6 * ONE_DAY);
        filterDate = {
          gte: last7days,
        };
        break;
      case DateFilterType.LAST30DAYS:
        // eslint-disable-next-line no-case-declarations
        const last30days = new Date(currentDay.getTime() - 29 * ONE_DAY);
        filterDate = {
          gte: last30days,
        };
        break;
      case DateFilterType.ALL:
        filterDate = undefined;
        break;
      default:
        break;
    }
    return filterDate;
  }

  private getQueryByWinnerId(
    body: WinningRequestDto,
    winnerIds: string[] | undefined,
  ) {
    const filterDate: object | undefined = this.generateFilterDate(body);

    const query = {
      where: {
        winner_id: winnerIds
          ? {
              in: winnerIds,
            }
          : undefined,
        category: body.type
          ? {
              equals: body.type,
            }
          : undefined,
        created_at: filterDate,
        payment: body.status
          ? {
              some: {
                payment_status: {
                  equals: body.status,
                },
                installment_number: {
                  equals: 1,
                },
              },
            }
          : {
              some: {
                installment_number: {
                  equals: 1,
                },
              },
            },
      },
    };

    return query;
  }

  private getOrderByWithWinnerId(body: WinningRequestDto) {
    let orderBy: object = [
      {
        created_at: 'desc',
      },
      {
        external_id: 'asc',
      },
    ];
    if (body.sortBy && body.sortOrder) {
      orderBy = [
        {
          [body.sortBy]: body.sortOrder.toString(),
        },
        {
          external_id: 'asc',
        },
      ];
    }

    return orderBy;
  }

  private getQueryByExternalIDs(body: WinningRequestDto) {
    const filterDate: object | undefined = this.generateFilterDate(body);

    const query = {
      where: {
        external_id: {
          in: body.externalIds,
        },
        category: body.type
          ? {
              equals: body.type,
            }
          : undefined,
        created_at: filterDate,
        payment: body.status
          ? {
              some: {
                payment_status: {
                  equals: body.status,
                },
              },
            }
          : undefined,
      },
    };

    return query;
  }

  private getOrderByWithExternalIDs(body: WinningRequestDto) {
    let orderBy: object = [
      {
        created_at: 'desc',
      },
    ];
    if (body.sortBy && body.sortOrder) {
      orderBy = [
        {
          [body.sortBy]: body.sortOrder.toString(),
        },
      ];
    }

    return orderBy;
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
    });
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
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    let needsReconciliation = false;
    const winningsId = body.winningsId;
    try {
      const payments = await this.getPaymentsByWinningsId(
        winningsId,
        body.paymentId,
      );

      if (payments.length === 0) {
        throw new NotFoundException('failed to get current payments');
      }

      let releaseDate;
      if (body.paymentStatus) {
        releaseDate = await this.getPaymentReleaseDateByWinningsId(winningsId);
      }

      const transactions: PrismaPromise<any>[] = [];
      const now = new Date().getTime();
      payments.forEach((payment) => {
        if (
          payment.payment_status &&
          payment.payment_status === PaymentStatus.CANCELLED
        ) {
          throw new BadRequestException('cannot update cancelled winnings');
        }

        let version = payment.version ?? 1;
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
                  transactions.push(
                    this.markPaymentReleaseAsFailedByWinningsId(winningsId),
                  );
                }
              } else {
                errMessage = 'cannot put a processing payment back to owed';
                if (
                  payment.payment_status !== PaymentStatus.ON_HOLD_ADMIN &&
                  payment.payment_status !== PaymentStatus.PAID
                ) {
                  errMessage =
                    "cannot put a payment back to owed unless it is on hold by an admin, or it's been paid";
                }
              }

              break;

            default:
              errMessage = 'invalid payment status provided';
              break;
          }

          if (errMessage) {
            throw new BadRequestException(errMessage);
          }

          transactions.push(
            this.updatePaymentStatus(
              userId,
              winningsId,
              payment.payment_id,
              payment.payment_status,
              body.paymentStatus,
              version,
            ),
          );
          version += 1;

          if (body.paymentStatus === PaymentStatus.OWED) {
            needsReconciliation = true;
          }

          if (payment.installment_number === 1) {
            transactions.push(
              this.addAudit(
                userId,
                winningsId,
                `Modified payment status from ${payment.payment_status} to ${body.paymentStatus}`,
                body.auditNote,
              ),
            );
          }
        }

        // Update Release Date if requested
        if (body.releaseDate) {
          const newReleaseDate = new Date(body.releaseDate);

          transactions.push(
            this.updateReleaseDate(
              userId,
              winningsId,
              payment.payment_id,
              newReleaseDate,
              version,
            ),
          );
          version += 1;

          if (payment.installment_number === 1) {
            transactions.push(
              this.addAudit(
                userId,
                winningsId,
                `Modified release date from ${payment.release_date?.toISOString()} to ${newReleaseDate.toISOString()}`,
                body.auditNote,
              ),
            );
          }
        }

        // Update payment amount if requested
        if (
          body.paymentAmount !== undefined &&
          (payment.payment_status === PaymentStatus.OWED ||
            payment.payment_status === PaymentStatus.ON_HOLD ||
            payment.payment_status === PaymentStatus.ON_HOLD ||
            payment.payment_status === PaymentStatus.ON_HOLD_ADMIN)
        ) {
          // ideally we should be maintaining the original split of the payment amount between installments - but we aren't really using splits anymore
          if (payment.installment_number === 1) {
            transactions.push(
              this.updatePaymentAmount(
                userId,
                winningsId,
                payment.payment_id,
                body.paymentAmount,
                body.paymentAmount,
                body.paymentAmount,
                version,
              ),
            );

            transactions.push(
              this.addAudit(
                userId,
                winningsId,
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `Modified payment amount from ${payment.total_amount} to ${body.paymentAmount.toFixed(2)}`,
                body.auditNote,
              ),
            );
          } else {
            transactions.push(
              this.updatePaymentAmount(
                userId,
                winningsId,
                payment.payment_id,
                0,
                0,
                body.paymentAmount,
                version,
              ),
            );
          }
        }
      });

      if (transactions.length > 0) {
        await this.prisma.$transaction(transactions);
      }

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
          await this.reconcileWinningsStatusOnUserDetailsUpdate(
            winning.winner_id,
          );
        }
      }

      result.data = 'Successfully updated winnings';
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error('Updating winnings failed', error);
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

  private markPaymentReleaseAsFailedByWinningsId(winningsId: string) {
    return this.prisma.payment_releases.updateMany({
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
  ) {
    let setDatePaidNull = false;
    if (
      (oldPaymentStatus === PaymentStatus.PAID ||
        oldPaymentStatus === PaymentStatus.PROCESSING) &&
      newPaymentStatus === PaymentStatus.OWED
    ) {
      setDatePaidNull = true;
    }
    return this.prisma.payment.update({
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
  ) {
    return this.prisma.audit.create({
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
  ) {
    return this.prisma.payment.update({
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
  ) {
    return this.prisma.payment.update({
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
   * Update payment for user from one status to another
   *
   * @param userId user id
   * @param fromStatus from status
   * @param toStatus to status
   * @param tx transaction
   */
  updateWinningsStatus(userId, fromStatus, toStatus) {
    return this.prisma.$executeRaw`
      UPDATE payment
      SET payment_status = ${toStatus}::payment_status,
        updated_at     = now(),
        updated_by     = 'system',
        version        = version + 1
      FROM winnings
      WHERE payment.winnings_id = winnings.winning_id
        AND winnings.winner_id = ${userId}
        AND payment.payment_status = ${fromStatus}::payment_status AND version = version
    `;
  }

  /**
   * Reconcile winning if user data updated
   *
   * @param userId user id
   */
  async reconcileWinningsStatusOnUserDetailsUpdate(userId) {
    const hasTaxForm = await this.taxFormRepo.hasActiveTaxForm(userId);
    const hasPaymentMethod =
      await this.paymentMethodRepo.hasVerifiedPaymentMethod(userId);
    let fromStatus, toStatus;
    if (hasTaxForm && hasPaymentMethod) {
      fromStatus = PaymentStatus.ON_HOLD;
      toStatus = PaymentStatus.OWED;
    } else {
      fromStatus = PaymentStatus.OWED;
      toStatus = PaymentStatus.ON_HOLD;
    }

    await this.updateWinningsStatus(userId, fromStatus, toStatus);
  }

  /**
   * Get winning audit for winningId
   * @param winningId the winningId
   * @returns the Promise with response result
   */
  async getWinningAudit(
    winningId: string,
  ): Promise<ResponseDto<WinningAuditDto[]>> {
    const result = new ResponseDto<WinningAuditDto[]>();

    try {
      const audits = await this.prisma.audit.findMany({
        where: {
          winnings_id: {
            equals: winningId,
          },
        },
        take: 1000,
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
      console.error('Getting winnings audit failed', error);
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
  ): Promise<ResponseDto<AuditPayoutDto[]>> {
    const result = new ResponseDto<AuditPayoutDto[]>();

    try {
      const paymentReleases = await this.prisma.payment_releases.findMany({
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
      console.error('Getting winnings audit failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }
}
