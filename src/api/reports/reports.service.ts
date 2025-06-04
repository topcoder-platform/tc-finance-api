import { Injectable } from '@nestjs/common';
import { Prisma, winnings_category } from '@prisma/client';
import { isEmpty, uniq } from 'lodash';
import { PaymentsReportQueryDto } from 'src/dto/reports.dto';
import { Logger } from 'src/shared/global';
import { PrismaService } from 'src/shared/global/prisma.service';
import { BASIC_MEMBER_FIELDS } from 'src/shared/topcoder';
import { TopcoderChallengesService } from 'src/shared/topcoder/challenges.service';
import { TopcoderMembersService } from 'src/shared/topcoder/members.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: TopcoderMembersService,
    private readonly challengeService: TopcoderChallengesService,
  ) {}

  private async buildPaymentReportQueryFilters(
    filters: PaymentsReportQueryDto,
  ) {
    const queryFilters: Prisma.paymentWhereInput = {};

    if (filters.billingAccountIds) {
      Object.assign(queryFilters, {
        billing_account: { in: [...filters.billingAccountIds] },
      });
    }

    if (filters.handles) {
      const userIdsMap = await this.membersService.getMembersInfoByHandle(
        filters.handles,
      );

      if (!isEmpty(userIdsMap)) {
        Object.assign(queryFilters, {
          winnings: {
            winner_id: {
              in: Object.values(userIdsMap).map((u) => `${u.userId ?? ''}`),
            },
          },
        });
      }
    }

    if (filters.challengeName) {
      const challenges = await this.challengeService.searchByName(
        filters.challengeName,
      );

      Object.assign(queryFilters, {
        winnings: {
          ...queryFilters.winnings,
          external_id: { in: challenges.map((c: { id: string }) => c.id) },
        },
      });
    }

    if (filters.startDate || filters.endDate) {
      Object.assign(queryFilters, {
        created_at: {
          ...(filters.startDate && { gte: filters.startDate }),
          ...(filters.endDate && { lte: filters.endDate }),
        },
      });
    }

    if (filters.minPaymentAmount || filters.maxPaymentAmount) {
      Object.assign(queryFilters, {
        total_amount: {
          ...(filters.minPaymentAmount && { gte: filters.minPaymentAmount }),
          ...(filters.maxPaymentAmount && { lte: filters.maxPaymentAmount }),
        },
      });
    }

    return queryFilters;
  }

  async getPaymentsReport(filters: PaymentsReportQueryDto) {
    this.logger.debug('Starting getPaymentsReport with filters:', filters);

    const queryFilters = await this.buildPaymentReportQueryFilters(filters);

    const payments = await this.prisma.payment.findMany({
      where: {
        ...queryFilters,
      },
      select: {
        payment_id: true,
        created_at: true,
        billing_account: true,
        payment_status: true,
        challenge_fee: true,
        total_amount: true,
        winnings: {
          select: {
            external_id: true,
            winner_id: true,
            category: true,
          },
        },
      },
    });

    this.logger.debug(`Fetched ${payments.length} payments from the database`);

    const userIds = uniq(payments.map((p) => p.winnings.winner_id as string));
    const challengeIds = uniq(
      payments.map((p) => p.winnings.external_id as string).filter(Boolean),
    );

    this.logger.debug(`Extracted ${userIds.length} unique user IDs`);
    this.logger.debug(`Extracted ${challengeIds.length} unique challenge IDs`);

    const [membersMap, challengeNamesMap] = await Promise.all([
      this.membersService.getMembersInfoByUserId(userIds, BASIC_MEMBER_FIELDS),
      this.challengeService.getChallengesNameByChallengeIds(challengeIds),
    ]);

    this.logger.debug('Fetched member information and challenge names');

    const result = payments.map((payment) => ({
      billingAccountId: payment.billing_account,
      challengeName:
        challengeNamesMap[payment.winnings.external_id as string] ?? '',
      challengeId: payment.winnings.external_id as string,
      paymentDate: payment.created_at,
      paymentId: payment.payment_id,
      paymentStatus: payment.payment_status,
      winnerId: payment.winnings.winner_id,
      winnerHandle: membersMap[payment.winnings.winner_id]?.handle ?? '',
      winnerFirstName: membersMap[payment.winnings.winner_id]?.firstName ?? '',
      winnerLastName: membersMap[payment.winnings.winner_id]?.lastName ?? '',
      isTask: payment.winnings.category === winnings_category.TASK_PAYMENT,
      challengeFee: payment.challenge_fee,
      paymentAmount: payment.total_amount,
    }));

    this.logger.debug('Mapped payments to the final report format');

    return result;
  }
}
