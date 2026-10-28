import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

export interface DuplicateSharedWinning {
  winningId: string;
  title: string | null;
  amount: string;
}

export interface DuplicatePaymentRelease {
  userId: string;
  release1Id: string;
  release2Id: string;
  release1Status: string | null;
  release2Status: string | null;
  release1CreatedAt: Date;
  release2CreatedAt: Date;
  release1Amount: string;
  release2Amount: string;
  trolleyPayment1Id: string | null;
  trolleyPayment2Id: string | null;
  sharedPayments: number;
  sharedAmount: string;
  sharedWinnings: DuplicateSharedWinning[];
}

/**
 * Finds pairs of active payment releases (not FAILED or RETURNED) that contain
 * the same payment, i.e. payments that were withdrawn more than once.
 */
@Injectable()
export class DuplicatePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param options.since - Only report pairs whose newer release was created
   *   at or after this date. Omit to search the whole history.
   * @param prismaClient - Transaction client to run the query in.
   * @returns one row per pair of releases, newest first.
   */
  findDuplicateReleases(
    options: { since?: Date } = {},
    prismaClient: Prisma.TransactionClient = this.prisma,
  ) {
    const sinceFilter = options.since
      ? Prisma.sql`AND r2.created_at >= ${options.since}`
      : Prisma.empty;

    return prismaClient.$queryRaw<DuplicatePaymentRelease[]>`
      SELECT
        r1.user_id                     AS "userId",
        r1.payment_release_id::text    AS "release1Id",
        r2.payment_release_id::text    AS "release2Id",
        r1.status                      AS "release1Status",
        r2.status                      AS "release2Status",
        r1.created_at                  AS "release1CreatedAt",
        r2.created_at                  AS "release2CreatedAt",
        r1.total_net_amount::text      AS "release1Amount",
        r2.total_net_amount::text      AS "release2Amount",
        r1.external_transaction_id     AS "trolleyPayment1Id",
        r2.external_transaction_id     AS "trolleyPayment2Id",
        COUNT(*)::int                  AS "sharedPayments",
        SUM(p.total_amount)::text      AS "sharedAmount",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'winningId', w.winning_id,
            'title', w.title,
            'amount', p.total_amount::text
          )
          ORDER BY w.title
        )                              AS "sharedWinnings"
      FROM payment_release_associations a
      JOIN payment_release_associations b
        ON b.payment_id = a.payment_id
       AND b.payment_release_id <> a.payment_release_id
      JOIN payment_releases r1 ON r1.payment_release_id = a.payment_release_id
      JOIN payment_releases r2 ON r2.payment_release_id = b.payment_release_id
      JOIN payment p           ON p.payment_id = a.payment_id
      JOIN winnings w          ON w.winning_id = p.winnings_id
      WHERE COALESCE(r1.status, '') NOT IN ('FAILED', 'RETURNED')
        AND COALESCE(r2.status, '') NOT IN ('FAILED', 'RETURNED')
        -- order each pair by creation so it is reported once, oldest first
        AND (r1.created_at, r1.payment_release_id) < (r2.created_at, r2.payment_release_id)
        ${sinceFilter}
      GROUP BY r1.payment_release_id, r2.payment_release_id
      ORDER BY r2.created_at DESC
    `;
  }
}
