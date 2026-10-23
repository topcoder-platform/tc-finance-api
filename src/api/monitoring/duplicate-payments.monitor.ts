import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';
import { PrismaService } from 'src/shared/global/prisma.service';
import { TopcoderEmailService } from 'src/shared/topcoder/tc-email.service';
import {
  DuplicatePaymentRelease,
  DuplicatePaymentsService,
} from './duplicate-payments.service';

/**
 * Fixed marker in the alert log line. Point the CloudWatch metric filter at it.
 */
export const DUPLICATE_PAYMENTS_ALERT_MARKER =
  'DUPLICATE_PAYMENT_RELEASES_DETECTED';

/**
 * Safety net for double withdrawals: on a schedule, looks for pairs of active
 * payment releases that contain the same payment, and alerts if any exist.
 */
@Injectable()
export class DuplicatePaymentsMonitor {
  private readonly logger = new Logger(DuplicatePaymentsMonitor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tcEmailService: TopcoderEmailService,
    private readonly duplicatePaymentsService: DuplicatePaymentsService,
  ) {}

  @Cron(ENV_CONFIG.DUPLICATE_PAYMENTS_CHECK_CRON, {
    name: 'duplicate-payments-check',
    disabled: !ENV_CONFIG.DUPLICATE_PAYMENTS_CHECK_ENABLED,
    waitForCompletion: true,
  })
  async runScheduledCheck() {
    try {
      await this.checkForDuplicates();
    } catch (error) {
      this.logger.error(
        `Duplicate payments check failed: ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Runs the check once. Only one instance runs it per tick: the others fail to
   * get the advisory lock and skip.
   *
   * @returns the duplicates found, or `undefined` if another instance holds the lock.
   */
  async checkForDuplicates(): Promise<DuplicatePaymentRelease[] | undefined> {
    const lookbackHours = ENV_CONFIG.DUPLICATE_PAYMENTS_CHECK_LOOKBACK_HOURS;

    // The lock is held until the alert is sent, so an instance whose tick lands
    // slightly later finds it taken instead of sending the same alert again.
    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${DUPLICATE_PAYMENTS_ALERT_MARKER})) AS locked
        `;

        if (!locked) {
          this.logger.debug(
            'Duplicate payments check is running on another instance; skipping.',
          );
          return undefined;
        }

        const duplicates =
          await this.duplicatePaymentsService.findDuplicateReleases(
            { since: new Date(Date.now() - lookbackHours * 60 * 60 * 1000) },
            tx,
          );

        if (duplicates.length === 0) {
          this.logger.debug(
            `Duplicate payments check found no duplicates in the last ${lookbackHours}h.`,
          );
          return duplicates;
        }

        await this.alert(duplicates, lookbackHours);

        return duplicates;
      },
      { timeout: 30_000 },
    );
  }

  private async alert(
    duplicates: DuplicatePaymentRelease[],
    lookbackHours: number,
  ) {
    this.logger.error(
      `${DUPLICATE_PAYMENTS_ALERT_MARKER}: ${duplicates.length} pair(s) of payment releases share payments (releases created in the last ${lookbackHours}h).`,
      duplicates,
    );

    const recipients = ENV_CONFIG.DUPLICATE_PAYMENTS_ALERT_EMAILS;
    const templateId = ENV_CONFIG.SENDGRID_TEMPLATE_ID_DUPLICATE_PAYMENTS_ALERT;

    if (!recipients.length || !templateId) {
      this.logger.debug(
        'Duplicate payments alert email not configured; only logged the alert.',
      );
      return;
    }

    try {
      await this.tcEmailService.sendEmail(recipients, templateId, {
        data: {
          duplicates_count: duplicates.length,
          lookback_hours: lookbackHours,
          duplicates: duplicates.map((d) => ({
            user_id: d.userId,
            release_1_id: d.release1Id,
            release_2_id: d.release2Id,
            release_1_status: d.release1Status,
            release_2_status: d.release2Status,
            release_1_created_at: new Date(d.release1CreatedAt).toISOString(),
            release_2_created_at: new Date(d.release2CreatedAt).toISOString(),
            trolley_payment_1_id: d.trolleyPayment1Id,
            trolley_payment_2_id: d.trolleyPayment2Id,
            shared_payments: d.sharedPayments,
            shared_amount: d.sharedAmount,
          })),
        },
      });
    } catch (error) {
      // already logged as an alert above; don't fail the check over the email
      this.logger.error(
        `Failed to send duplicate payments alert email: ${error?.message ?? error}`,
      );
    }
  }
}
