import { HttpStatus, Injectable } from '@nestjs/common';
import {
  payment,
  payment_status,
  Prisma,
  winnings,
  winnings_category,
  winnings_type,
} from '@prisma/client';
import { uniq } from 'lodash';
import { ResponseDto } from 'src/dto/api-response.dto';
import { DateFilterType } from 'src/dto/date-filter.type';
import { PaymentStatus } from 'src/dto/payment.dto';
import {
  WinningRequestDto,
  SearchWinningResult,
  WinningsCategory,
  WinningDto,
} from 'src/dto/winning.dto';
import { PrismaService } from 'src/shared/global/prisma.service';
import { Logger } from 'src/shared/global';

const ONE_DAY = 24 * 60 * 60 * 1000;

// Rows are updated in place: version is an optimistic lock, not a history key.
// Keep installment 1 first and preserve separate rows sharing an installment.
const CURRENT_INSTALLMENTS = {
  where: { installment_number: { gte: 1 } },
  orderBy: [
    { installment_number: 'asc' },
    { created_at: 'desc' },
    { payment_id: 'asc' },
  ],
} satisfies Prisma.paymentFindManyArgs;

interface SearchWinningsOptions {
  includeCount?: boolean;
  includePayoutStatus?: boolean;
}

/**
 * Reads winnings for member/admin Wallet listings, exports and external-ID
 * consumers, preserving current installment details and their gross total.
 */
@Injectable()
export class WinningsRepository {
  private readonly logger = new Logger(WinningsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Totals the member gross amounts of the current installments for display.
   *
   * @param payments Current payment rows for all installments in one winning.
   * @returns Decimal-safe gross total across all statuses, including cancelled
   * installments for historical display; this is not a withdrawable balance.
   * @throws Decimal errors for invalid stored amounts; read methods report them
   * through their existing error response. Null amounts contribute zero.
   */
  private getGrossAmount(payments: Pick<payment, 'gross_amount'>[]): number {
    return payments
      .reduce(
        (total, installment) => total.plus(installment.gross_amount ?? 0),
        new Prisma.Decimal(0),
      )
      .toNumber();
  }

  /**
   * Extracts the optional hours-worked value from winning attributes.
   * @param attributes Winning attributes payload retrieved from the database.
   * @returns Parsed hours-worked value, or `undefined` when absent/invalid.
   */
  private getHoursWorked(
    attributes: Prisma.JsonValue | null,
  ): number | undefined {
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    ) {
      return undefined;
    }

    const value = (attributes as Record<string, unknown>).hoursWorked;
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : undefined;
  }

  private generateFilterDate(date?: DateFilterType) {
    let filterDate: object | undefined;
    const currentDay = new Date(new Date().setHours(0, 0, 0, 0));
    const currentDayEnd = new Date(currentDay.getTime() + ONE_DAY - 1);

    switch (date) {
      case DateFilterType.LAST7DAYS:
        // eslint-disable-next-line no-case-declarations
        const last7days = new Date(currentDay.getTime() - 6 * ONE_DAY);
        filterDate = {
          gte: last7days,
          lte: currentDayEnd,
        };
        break;
      case DateFilterType.LAST30DAYS:
        // eslint-disable-next-line no-case-declarations
        const last30days = new Date(currentDay.getTime() - 29 * ONE_DAY);
        filterDate = {
          gte: last30days,
          lte: currentDayEnd,
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

  private parseFilterDate(value: string): Date | undefined {
    const trimmed = value.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);

    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const parsed = new Date(year, month, day);

      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    const parsed = new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private generateFilterDateRange(
    dateFrom?: string,
    dateTo?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!dateFrom && !dateTo) {
      return undefined;
    }

    const range: { gte?: Date; lte?: Date } = {};

    if (dateFrom) {
      const start = this.parseFilterDate(dateFrom);

      if (start) {
        start.setHours(0, 0, 0, 0);
        range.gte = start;
      }
    }

    if (dateTo) {
      const end = this.parseFilterDate(dateTo);

      if (end) {
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
    }

    if (!range.gte && !range.lte) {
      return undefined;
    }

    return range;
  }

  private resolveCreatedAtFilter(
    date?: DateFilterType,
    dateFrom?: string,
    dateTo?: string,
  ): object | undefined {
    const customRange = this.generateFilterDateRange(dateFrom, dateTo);

    if (customRange) {
      return customRange;
    }

    return this.generateFilterDate(date);
  }

  private normalizeStatusFilter(
    status?: PaymentStatus | PaymentStatus[],
  ): PaymentStatus[] | undefined {
    if (status === undefined) {
      return undefined;
    }

    const values = Array.isArray(status) ? status : [status];

    return values.length > 0 ? values : undefined;
  }

  private getWinningsQueryFilters(
    type?: string,
    category?: string,
    categories?: string[],
    status?: PaymentStatus | PaymentStatus[],
    winnerIds?: string[],
    externalIds?: string[],
    date?: DateFilterType,
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.winningsWhereInput {
    const typeFilter = type
      ? {
          equals: type as winnings_type,
        }
      : undefined;

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
      category: category
        ? {
            equals: category as winnings_category,
          }
        : categories?.length
          ? {
              in: categories as winnings_category[],
            }
          : undefined,
      type: typeFilter,
      payment: (() => {
        const statuses = this.normalizeStatusFilter(status);

        if (statuses?.length) {
          return {
            some: {
              payment_status:
                statuses.length === 1
                  ? {
                      equals: statuses[0] as payment_status,
                    }
                  : {
                      in: statuses as payment_status[],
                    },
              installment_number: {
                equals: 1,
              },
            },
          };
        }

        return {
          some: {
            installment_number: {
              equals: 1,
            },
          },
        };
      })(),
      created_at: this.resolveCreatedAtFilter(date, dateFrom, dateTo),
    };
  }

  private getOrderByWithWinnerId(
    sortBy: string | undefined,
    sortOrder: 'asc' | 'desc' | undefined,
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
   * Searches winnings with every current numbered installment payment row.
   *
   * @param searchProps Listing filters and pagination from the request body.
   * @param options Controls count and payout-setup lookups for batched exports.
   * @returns Winnings with installment details and a gross member-payment total.
   * @throws This method reports query/serialization failures in result.error.
   */
  async searchWinnings(
    searchProps: WinningRequestDto,
    options: SearchWinningsOptions = {},
  ): Promise<ResponseDto<SearchWinningResult>> {
    const result = new ResponseDto<SearchWinningResult>();
    const includeCount = options.includeCount ?? true;
    const includePayoutStatus = options.includePayoutStatus ?? true;

    try {
      let winnerIds: string[] | undefined;
      let externalIds: string[] | undefined;
      if (searchProps.winnerId) {
        winnerIds = [searchProps.winnerId];
      } else if (searchProps.winnerIds) {
        winnerIds = [...searchProps.winnerIds];
      } else if ((searchProps.externalIds?.length ?? 0) > 0) {
        externalIds = searchProps.externalIds;
      }

      const queryWhere = this.getWinningsQueryFilters(
        searchProps.type,
        searchProps.category,
        searchProps.categories,
        searchProps.status,
        winnerIds,
        externalIds,
        searchProps.date,
        searchProps.dateFrom,
        searchProps.dateTo,
      );

      if (searchProps.billingAccounts) {
        // override payment filter to include billing account constraint
        // while preserving status/installment constraints
        (queryWhere as any).payment.some = {
          ...queryWhere.payment!.some,
          billing_account: {
            in: searchProps.billingAccounts,
          },
        };
      }

      const orderBy = this.getOrderByWithWinnerId(
        searchProps.sortBy,
        searchProps.sortOrder,
        !winnerIds && !!externalIds?.length,
      );

      const limit = searchProps.limit ?? 10;
      const offset = searchProps.offset ?? 0;
      const winningsPromise = this.prisma.winnings.findMany({
        where: queryWhere,
        include: {
          payment: CURRENT_INSTALLMENTS,
          origin: true,
        },
        orderBy,
        skip: offset,
        take: limit,
      });

      const [winnings, count] = includeCount
        ? await Promise.all([
            winningsPromise,
            this.prisma.winnings.count({ where: queryWhere }),
          ])
        : [await winningsPromise, 0];

      const usersPayoutStatusMap: Record<string, unknown> =
        includePayoutStatus && winnings?.length
          ? await this.getUsersPayoutStatusForWinnings(winnings)
          : {};
      const totalItems = includeCount ? count : winnings.length;

      result.data = {
        winnings: winnings.map((item) => {
          const attributes = (item.attributes ?? {}) as object;

          return {
            id: item.winning_id,
            type: item.type,
            winnerId: item.winner_id,
            createdBy: item.payment?.[0]?.created_by ?? item.created_by,
            origin: item.origin?.origin_name,
            category: (item.category ?? '') as WinningsCategory,
            title: item.title as string,
            description: item.description as string,
            externalId: item.external_id as string,
            attributes,
            hoursWorked: this.getHoursWorked(item.attributes),
            grossAmount: this.getGrossAmount(item.payment),
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
              challengeFee:
                paymentItem.challenge_fee === null ||
                paymentItem.challenge_fee === undefined
                  ? undefined
                  : Number(paymentItem.challenge_fee),
              challengeMarkup:
                paymentItem.challenge_markup === null ||
                paymentItem.challenge_markup === undefined
                  ? undefined
                  : Number(paymentItem.challenge_markup),
            })),
            createdAt: item.created_at as Date,
            updatedAt: (item.payment?.[0].date_paid ??
              item.payment?.[0].updated_at ??
              undefined) as Date,
            releaseDate: item.payment?.[0]?.release_date as Date,
            paymentStatus: usersPayoutStatusMap[
              item.winner_id
            ] as WinningDto['paymentStatus'],
          };
        }),
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          pageSize: limit,
          currentPage: Math.ceil(offset / limit) + 1,
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

  /**
   * Reads winnings for a challenge/assignment with all current installments.
   *
   * @param externalId Challenge or assignment identifier linked to winnings.
   * @returns Matching winnings with installment details and gross display totals.
   * @throws This method reports query/serialization failures in result.error.
   */
  async getWinningsByExternalId(
    externalId: string,
  ): Promise<ResponseDto<WinningDto[]>> {
    const result = new ResponseDto<WinningDto[]>();

    try {
      const queryWhere = this.getWinningsQueryFilters(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        [externalId],
        undefined,
        undefined,
        undefined,
      );

      const winnings = await this.prisma.winnings.findMany({
        where: queryWhere,
        include: {
          payment: CURRENT_INSTALLMENTS,
          origin: true,
        },
        orderBy: [
          {
            created_at: 'desc',
          },
        ],
      });
      const usersPayoutStatusMap = winnings?.length
        ? await this.getUsersPayoutStatusForWinnings(winnings)
        : ({} as { [key: string]: payment_status });

      result.data = winnings.map((item) => {
        const attributes = (item.attributes ?? {}) as object;

        return {
          id: item.winning_id,
          type: item.type,
          winnerId: item.winner_id,
          createdBy: item.payment?.[0]?.created_by ?? item.created_by,
          origin: item.origin?.origin_name,
          category: (item.category ?? '') as WinningsCategory,
          title: item.title as string,
          description: item.description as string,
          externalId: item.external_id as string,
          attributes,
          hoursWorked: this.getHoursWorked(item.attributes),
          grossAmount: this.getGrossAmount(item.payment),
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
            challengeFee:
              paymentItem.challenge_fee === null ||
              paymentItem.challenge_fee === undefined
                ? undefined
                : Number(paymentItem.challenge_fee),
            challengeMarkup:
              paymentItem.challenge_markup === null ||
              paymentItem.challenge_markup === undefined
                ? undefined
                : Number(paymentItem.challenge_markup),
          })),
          createdAt: item.created_at as Date,
          updatedAt: (item.payment?.[0].date_paid ??
            item.payment?.[0].updated_at ??
            undefined) as Date,
          releaseDate: item.payment?.[0]?.release_date as Date,
          paymentStatus: usersPayoutStatusMap[item.winner_id],
        };
      });
    } catch (error) {
      this.logger.error('Getting winnings by external ID failed', error);
      const message = 'Getting winnings by external ID failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }
}
