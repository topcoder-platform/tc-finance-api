import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

import { WinningsCategory } from 'src/dto/winning.dto';

import { ActionLogPaymentSource, ActionLogType } from './action-log.dto';

/** Categories that are not Topcoder payments. */
const NON_TOPCODER_CATEGORIES: Record<
  Exclude<ActionLogPaymentSource, ActionLogPaymentSource.TOPCODER>,
  WinningsCategory
> = {
  [ActionLogPaymentSource.TAAS]: WinningsCategory.TAAS_PAYMENT,
  [ActionLogPaymentSource.TOPGEAR]: WinningsCategory.TOPGEAR_PAYMENT,
};

export interface ActionLogFilters {
  /** Only return actions made at or after this date. */
  since: Date;
  /** Only return actions made at or before this date. */
  until?: Date;
  paymentSource?: ActionLogPaymentSource;
  categories?: WinningsCategory[];
  adminUserId?: string;
}

export interface ActionLogEntry {
  auditId: string;
  actionedAt: Date;
  adminUserId: string;
  actionType: ActionLogType;
  action: string;
  note: string | null;
  winningId: string;
  winnerId: string;
  winningsType: string;
  category: string | null;
  title: string | null;
  externalId: string | null;
  paymentId: string | null;
  totalAmount: string | null;
  paymentStatus: string | null;
  releaseDate: Date | null;
  datePaid: Date | null;
}

/**
 * Lists the payment changes made manually in Wallet Admin.
 *
 * Every `audit` row is written by the Wallet Admin payment update endpoint
 * (AdminService.updateWinnings), so the audit table is the action log.
 */
@Injectable()
export class ActionLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param filters - Date range, payment source and category, and admin to
   *   filter the actions by.
   * @param prismaClient - Transaction client to run the query in.
   * @returns one row per audited action, newest first, with the current state
   *   of the payment's first installment.
   */
  findActions(
    filters: ActionLogFilters,
    prismaClient: Prisma.TransactionClient = this.prisma,
  ) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`a.created_at >= ${filters.since}`,
    ];

    if (filters.until) {
      conditions.push(Prisma.sql`a.created_at <= ${filters.until}`);
    }

    if (filters.paymentSource === ActionLogPaymentSource.TOPCODER) {
      conditions.push(
        Prisma.sql`(w.category IS NULL OR w.category::text NOT IN (${Prisma.join(
          Object.values(NON_TOPCODER_CATEGORIES),
        )}))`,
      );
    } else if (filters.paymentSource) {
      conditions.push(
        Prisma.sql`w.category::text = ${NON_TOPCODER_CATEGORIES[filters.paymentSource]}`,
      );
    }

    if (filters.categories?.length) {
      conditions.push(
        Prisma.sql`w.category::text IN (${Prisma.join(filters.categories)})`,
      );
    }

    if (filters.adminUserId) {
      conditions.push(Prisma.sql`a.user_id = ${filters.adminUserId}`);
    }

    // action texts are written by AdminService.updateWinnings
    return prismaClient.$queryRaw<ActionLogEntry[]>`
      SELECT
        a.id::text                    AS "auditId",
        a.created_at                  AS "actionedAt",
        a.user_id                     AS "adminUserId",
        CASE
          WHEN a.action LIKE 'Modified payment status%'      THEN 'STATUS_CHANGE'
          WHEN a.action LIKE 'Modified payment amount%'      THEN 'AMOUNT_CHANGE'
          WHEN a.action LIKE 'Modified release date%'        THEN 'RELEASE_DATE_CHANGE'
          WHEN a.action LIKE 'Modified payment description%' THEN 'DESCRIPTION_CHANGE'
          ELSE 'OTHER'
        END                           AS "actionType",
        a.action                      AS "action",
        a.note                        AS "note",
        w.winning_id::text            AS "winningId",
        w.winner_id                   AS "winnerId",
        w.type::text                  AS "winningsType",
        w.category::text              AS "category",
        w.title                       AS "title",
        w.external_id                 AS "externalId",
        p.payment_id::text            AS "paymentId",
        p.total_amount::text          AS "totalAmount",
        p.payment_status::text        AS "paymentStatus",
        p.release_date                AS "releaseDate",
        p.date_paid                   AS "datePaid"
      FROM audit a
      JOIN winnings w ON w.winning_id = a.winnings_id
      LEFT JOIN LATERAL (
        SELECT
          payment.payment_id,
          payment.total_amount,
          payment.payment_status,
          payment.release_date,
          payment.date_paid
        FROM payment
        WHERE payment.winnings_id = a.winnings_id
          AND payment.installment_number = 1
        ORDER BY payment.version DESC NULLS LAST
        LIMIT 1
      ) p ON TRUE
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY a.created_at DESC
    `;
  }

  /**
   * @returns the user IDs of every admin who has made a Wallet Admin payment
   *   change, so the log can be filtered by admins who no longer hold a
   *   payment role.
   */
  findAdminUserIds(
    prismaClient: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    return prismaClient.$queryRaw<{ userId: string }[]>`
      SELECT DISTINCT a.user_id AS "userId"
      FROM audit a
      ORDER BY a.user_id
    `.then((rows) => rows.map((row) => row.userId));
  }
}
