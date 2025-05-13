import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  payment_status,
  Prisma,
  winnings,
  winnings_category,
} from '@prisma/client';
import { uniq } from 'lodash';
import { ResponseDto } from 'src/dto/api-response.dto';
import { DateFilterType } from 'src/dto/date-filter.type';
import { PaymentStatus } from 'src/dto/payment.dto';
import {
  WinningRequestDto,
  SearchWinningResult,
  WinningsCategory,
} from 'src/dto/winning.dto';
import { PrismaService } from 'src/shared/global/prisma.service';

const ONE_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class WinningsRepository {
  private readonly logger = new Logger(WinningsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateFilterDate(date: DateFilterType) {
    let filterDate: object | undefined;
    const currentDay = new Date(new Date().setHours(0, 0, 0, 0));

    switch (date) {
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

  private getWinningsQueryFilters(
    type: string,
    status: string,
    winnerIds: string[] | undefined,
    externalIds: string[] | undefined,
    date: DateFilterType,
  ): Prisma.winningsFindManyArgs['where'] {
    return {
      winner_id: winnerIds
        ? {
            in: winnerIds,
          }
        : undefined,
      external_id: externalIds
        ? {
            in: externalIds,
          }
        : undefined,
      category: type
        ? {
            equals: type as winnings_category,
          }
        : undefined,
      payment: status
        ? {
            some: {
              payment_status: {
                equals: status as payment_status,
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
      created_at: this.generateFilterDate(date),
    };
  }

  private getOrderByWithWinnerId(
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    externalIds?: boolean,
  ) {
    const orderBy: object = [
      {
        created_at: 'desc',
      },
      ...(externalIds ? [{ external_id: 'asc' }] : []),
    ];

    if (sortBy && sortOrder) {
      orderBy[0] = {
        [sortBy]: sortOrder.toString(),
      };
    }

    return orderBy;
  }

  private async getUsersPayoutStatusForWinnings(winnings: winnings[]) {
    const usersPayoutStatus = await this.prisma.$queryRaw<
      {
        userId: string;
        taxFormSetupComplete: boolean;
        paymentMethodSetupComplete: boolean;
      }[]
    >`
      SELECT
        upm.user_id as "userId",
        CASE WHEN utx.tax_form_status = 'ACTIVE' THEN TRUE ELSE FALSE END as "taxFormSetupComplete",
        CASE WHEN upm.status = 'CONNECTED' THEN TRUE ELSE FALSE END as "payoutSetupComplete"
      FROM user_payment_methods upm
      LEFT JOIN user_tax_form_associations utx ON upm.user_id = utx.user_id AND utx.tax_form_status = 'ACTIVE'
      WHERE upm.user_id IN (${Prisma.join(uniq(winnings.map((w) => w.winner_id)))})
    `;

    return usersPayoutStatus.reduce(
      (map, userPayoutStatus) =>
        Object.assign(map, {
          [userPayoutStatus.userId]: { ...userPayoutStatus, userId: undefined },
        }),
      {},
    );
  }

  /**
   * Search winnings with parameters
   * @param searchProps the request body
   * @returns the Promise with response result
   */
  async searchWinnings(
    searchProps: WinningRequestDto,
  ): Promise<ResponseDto<SearchWinningResult>> {
    const result = new ResponseDto<SearchWinningResult>();

    try {
      let winnerIds: string[] | undefined;
      let externalIds: string[] | undefined;
      if (searchProps.winnerId) {
        winnerIds = [searchProps.winnerId];
      } else if (searchProps.winnerIds) {
        winnerIds = [...searchProps.winnerIds];
      } else if (searchProps.externalIds?.length > 0) {
        externalIds = searchProps.externalIds;
      }

      const queryWhere = this.getWinningsQueryFilters(
        searchProps.type,
        searchProps.status,
        winnerIds,
        externalIds,
        searchProps.date,
      );

      const orderBy = this.getOrderByWithWinnerId(
        searchProps.sortBy,
        searchProps.sortOrder,
        !winnerIds && !!externalIds?.length,
      );

      const [winnings, count] = await this.prisma.$transaction([
        this.prisma.winnings.findMany({
          where: queryWhere,
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
          skip: searchProps.offset,
          take: searchProps.limit,
        }),
        this.prisma.winnings.count({ where: queryWhere }),
      ]);

      const usersPayoutStatusMap = winnings?.length
        ? await this.getUsersPayoutStatusForWinnings(winnings)
        : ({} as { [key: string]: payment_status });

      result.data = {
        winnings: winnings.map((item) => ({
          id: item.winning_id,
          type: item.type,
          winnerId: item.winner_id,
          origin: item.origin?.origin_name,
          category: (item.category ?? '') as WinningsCategory,
          title: item.title as string,
          description: item.description as string,
          externalId: item.external_id as string,
          attributes: (item.attributes ?? {}) as object,
          details: item.payment?.map((paymentItem) => ({
            id: paymentItem.payment_id,
            netAmount: Number(paymentItem.net_amount),
            grossAmount: Number(paymentItem.gross_amount),
            totalAmount: Number(paymentItem.total_amount),
            installmentNumber: paymentItem.installment_number as number,
            datePaid: (paymentItem.date_paid ?? undefined) as Date,
            status: paymentItem.payment_status as PaymentStatus,
            currency: paymentItem.currency as string,
            releaseDate: paymentItem.release_date as Date,
            category: item.category as string,
            billingAccount: paymentItem.billing_account,
          })),
          createdAt: item.created_at as Date,
          updatedAt: (item.payment?.[0].date_paid ??
            item.payment?.[0].updated_at ??
            undefined) as Date,
          releaseDate: item.payment?.[0]?.release_date as Date,
          paymentStatus: usersPayoutStatusMap[item.winner_id],
        })),
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / searchProps.limit),
          pageSize: searchProps.limit,
          currentPage: Math.ceil(searchProps.offset / searchProps.limit) + 1,
        },
      };
      // response.data = winnings as any
    } catch (error) {
      this.logger.error('Searching winnings failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }
}
