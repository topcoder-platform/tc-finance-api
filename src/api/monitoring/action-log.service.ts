import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

import { ActionLogType } from './action-log.dto';

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
   * @param since - Only return actions made at or after this date.
   * @param prismaClient - Transaction client to run the query in.
   * @returns one row per audited action, newest first, with the current state
   *   of the payment's first installment.
   */
  findActions(
    since: Date,
    prismaClient: Prisma.TransactionClient = this.prisma,
  ) {
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
        SELECT *
        FROM payment
        WHERE payment.winnings_id = a.winnings_id
          AND payment.installment_number = 1
        ORDER BY payment.version DESC NULLS LAST
        LIMIT 1
      ) p ON TRUE
      WHERE a.created_at >= ${since}
      ORDER BY a.created_at DESC
    `;
  }
}
