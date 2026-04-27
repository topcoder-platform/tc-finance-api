import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { isNumber, includes } from 'lodash';
import { ENV_CONFIG } from 'src/config';
import { ChallengeStatuses } from 'src/dto/challenge.dto';
import { Logger } from 'src/shared/global';
import {
  TopcoderM2MHttpError,
  TopcoderM2MService,
} from './topcoder-m2m.service';

const { TOPCODER_API_V6_BASE_URL, TGBillingAccounts } = ENV_CONFIG;

const CANCELLED_CHALLENGE_STATUSES = [
  ChallengeStatuses.Deleted,
  ChallengeStatuses.Canceled,
  ChallengeStatuses.CancelledFailedReview,
  ChallengeStatuses.CancelledFailedScreening,
  ChallengeStatuses.CancelledZeroSubmissions,
  ChallengeStatuses.CancelledWinnerUnresponsive,
  ChallengeStatuses.CancelledClientRequest,
  ChallengeStatuses.CancelledRequirementsInfeasible,
  ChallengeStatuses.CancelledZeroRegistrations,
  ChallengeStatuses.CancelledPaymentFailed,
].map((status) => status.toLowerCase());

interface LockAmountDTO {
  challengeId: string;
  amount: number;
}
interface ConsumeAmountDTO {
  challengeId?: string;
  externalId?: string;
  externalType?: 'CHALLENGE' | 'ENGAGEMENT';
  amount: number;
}

interface ConsumeAmountsItemDTO extends ConsumeAmountDTO {
  billingAccountId: number;
}

interface ConsumeAmountsDTO {
  consumes: ConsumeAmountsItemDTO[];
}

interface BillingAccountDetailsResponse {
  id: number | string;
  markup: number | string;
}

export interface BillingAccountDetails {
  id: number;
  markup: number;
}

export interface BAValidation {
  challengeId?: string;
  billingAccountId?: number;
  markup?: number;
  prevStatus?: string;
  status?: string;
  prevTotalPrizesInCents?: number;
  totalPrizesInCents: number;
}

/**
 * Determines whether a challenge status should clear or consume challenge
 * budget reservations.
 *
 * @param status Challenge status received from challenge-api-v6.
 * @returns True when the status is deleted or cancelled.
 */
function isCancelledChallengeStatus(status?: string): boolean {
  return status
    ? CANCELLED_CHALLENGE_STATUSES.includes(status.toLowerCase())
    : false;
}

@Injectable()
export class BillingAccountsService {
  private readonly logger = new Logger(BillingAccountsService.name);

  constructor(private readonly m2MService: TopcoderM2MService) {}

  /**
   * Extracts the most useful upstream error message from an M2M failure.
   * @param err error thrown by the M2M client or fetch runtime.
   * @param fallback message to use when the upstream body has no readable text.
   * @returns normalized error message.
   */
  private getUpstreamErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof TopcoderM2MHttpError) {
      return err.message || fallback;
    }

    const typedError = err as {
      message?: string;
      response?: {
        data?: {
          error?: string;
          message?: string | string[];
          result?: { content?: string };
        };
      };
    };
    const responseData = typedError?.response?.data;

    if (Array.isArray(responseData?.message)) {
      return responseData.message.join(', ');
    }

    return (
      responseData?.message ??
      responseData?.result?.content ??
      responseData?.error ??
      typedError?.message ??
      fallback
    );
  }

  /**
   * Converts an upstream billing-account error into a Nest HTTP exception.
   * @param err error thrown by the M2M client.
   * @param fallback message to use when no upstream message is available.
   * @returns HTTP exception preserving the upstream status and message when present.
   */
  private toBillingAccountHttpException(
    err: unknown,
    fallback: string,
  ): HttpException | Error {
    const status =
      err instanceof TopcoderM2MHttpError
        ? err.status
        : ((err as { response?: { status?: number }; status?: number })
            ?.response?.status ?? (err as { status?: number })?.status);
    const message = this.getUpstreamErrorMessage(err, fallback);

    if (status === 400) {
      return new BadRequestException(message);
    }

    if (typeof status === 'number' && Number.isInteger(status)) {
      return new HttpException(message, status);
    }

    return err instanceof Error ? err : new Error(message);
  }

  /**
   * Normalizes legacy challenge consume calls and typed consume calls into the
   * billing-accounts API's canonical request shape.
   *
   * @param dto consume request from finance callers.
   * @returns typed consume request with `externalId`, `externalType`, and `amount`.
   * @throws BadRequestException when the external reference is missing.
   */
  private normalizeConsumeAmountDto(dto: ConsumeAmountDTO): ConsumeAmountDTO {
    const externalType = dto.externalType ?? 'CHALLENGE';
    const externalId = dto.externalId ?? dto.challengeId;

    if (!externalId) {
      throw new BadRequestException('externalId is required');
    }

    return {
      amount: dto.amount,
      ...(externalType === 'CHALLENGE' && dto.challengeId
        ? { challengeId: dto.challengeId }
        : {}),
      externalId,
      externalType,
    };
  }

  /**
   * Normalizes one item in an atomic batch consume request.
   *
   * @param dto consume request with the target billing account id.
   * @returns typed consume item accepted by billing-accounts-api-v6.
   * @throws BadRequestException when the billing account id or external
   * reference is invalid.
   */
  private normalizeConsumeAmountsItemDto(
    dto: ConsumeAmountsItemDTO,
  ): ConsumeAmountsItemDTO {
    if (
      !Number.isSafeInteger(dto.billingAccountId) ||
      dto.billingAccountId <= 0
    ) {
      throw new BadRequestException(
        'billingAccountId must be a positive integer',
      );
    }

    return {
      billingAccountId: dto.billingAccountId,
      ...this.normalizeConsumeAmountDto(dto),
    };
  }

  /**
   * Fetches billing-account metadata needed by finance budget consumers.
   *
   * @param billingAccountId billing account identifier.
   * @returns normalized billing-account id and markup.
   * @throws Error when the upstream response cannot be normalized.
   * @throws HttpException when the billing-accounts API rejects the request.
   */
  async getBillingAccountById(
    billingAccountId: number,
  ): Promise<BillingAccountDetails> {
    this.logger.log('Fetching billing account details:', billingAccountId);

    try {
      const response =
        await this.m2MService.m2mFetch<BillingAccountDetailsResponse>(
          `${TOPCODER_API_V6_BASE_URL}/billing-accounts/${billingAccountId}`,
        );
      const normalizedId = Number(response.id);
      const markup = Number(response.markup);

      if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        throw new Error(
          `Billing account ${billingAccountId} returned an invalid id`,
        );
      }

      if (!Number.isFinite(markup)) {
        throw new Error(
          `Billing account ${billingAccountId} returned an invalid markup`,
        );
      }

      return {
        id: normalizedId,
        markup,
      };
    } catch (err: any) {
      const exception = this.toBillingAccountHttpException(
        err,
        `Failed to fetch billing account #${billingAccountId}`,
      );
      this.logger.error(exception.message, err);
      throw exception;
    }
  }

  async lockAmount(billingAccountId: number, dto: LockAmountDTO) {
    this.logger.log('BA validation lock amount:', billingAccountId, dto);

    try {
      return await this.m2MService.m2mFetch(
        `${TOPCODER_API_V6_BASE_URL}/billing-accounts/${billingAccountId}/lock-amount`,
        {
          method: 'PATCH',
          body: JSON.stringify(dto),
        },
      );
    } catch (err: any) {
      this.logger.error(
        err.response?.data?.result?.content ??
          'Failed to lock challenge amount',
      );
      throw new Error(
        `Budget Error: Requested amount $${dto.amount} exceeds available budget for Billing Account #${billingAccountId}.
        Please contact the Topcoder Project Manager for further assistance.`,
      );
    }
  }

  async consumeAmount(billingAccountId: number, dto: ConsumeAmountDTO) {
    const request = this.normalizeConsumeAmountDto(dto);

    this.logger.log('BA validation consume amount:', billingAccountId, request);

    try {
      return await this.m2MService.m2mFetch(
        `${TOPCODER_API_V6_BASE_URL}/billing-accounts/${billingAccountId}/consume-amount`,
        {
          method: 'PATCH',
          body: JSON.stringify(request),
        },
      );
    } catch (err: any) {
      const exception = this.toBillingAccountHttpException(
        err,
        'Failed to consume billing account amount',
      );
      this.logger.error(exception.message, err);
      throw exception;
    }
  }

  /**
   * Sends one atomic engagement consume request to billing-accounts-api-v6.
   *
   * The upstream service validates all items and writes them in a single
   * database transaction, so finance does not leave partial remote budget
   * consumes behind when a winning request later fails.
   *
   * @param dto batch consume request for engagement payment details.
   * @returns upstream batch consume response.
   * @throws BadRequestException when the request is invalid or the billing
   * account has insufficient funds.
   * @throws HttpException for other upstream HTTP failures.
   */
  async consumeAmounts(dto: ConsumeAmountsDTO) {
    const request = {
      consumes: dto.consumes.map((consume) =>
        this.normalizeConsumeAmountsItemDto(consume),
      ),
    };

    this.logger.log('BA validation batch consume amount:', request);

    try {
      return await this.m2MService.m2mFetch(
        `${TOPCODER_API_V6_BASE_URL}/billing-accounts/consume-amounts`,
        {
          method: 'POST',
          body: JSON.stringify(request),
        },
      );
    } catch (err: any) {
      const exception = this.toBillingAccountHttpException(
        err,
        'Failed to consume billing account amounts',
      );
      this.logger.error(exception.message, err);
      throw exception;
    }
  }

  async lockConsumeAmount(
    baValidation: BAValidation,
    rollback: boolean = false,
  ): Promise<void> {
    const billingAccountId = baValidation.billingAccountId
      ? +baValidation.billingAccountId
      : undefined;
    if (!isNumber(billingAccountId)) {
      this.logger.warn(
        "Challenge doesn't have billing account id:",
        baValidation,
      );
      return;
    }
    if (includes(TGBillingAccounts, billingAccountId)) {
      this.logger.info(
        'Ignore BA validation for Topgear account:',
        billingAccountId,
      );
      return;
    }

    this.logger.log('BA validation:', baValidation);

    const status = baValidation.status?.toLowerCase();
    if (
      status === ChallengeStatuses.Active.toLowerCase() ||
      status === ChallengeStatuses.Approved.toLowerCase()
    ) {
      // Update lock amount
      const currAmount = baValidation.totalPrizesInCents / 100;
      const prevAmount = (baValidation.prevTotalPrizesInCents ?? 0) / 100;

      await this.lockAmount(billingAccountId, {
        challengeId: baValidation.challengeId!,
        amount:
          (rollback ? prevAmount : currAmount) * (1 + baValidation.markup!),
      });
    } else if (status === ChallengeStatuses.Completed.toLowerCase()) {
      // Note an already completed challenge could still be updated with prizes
      const currAmount = baValidation.totalPrizesInCents / 100;
      const prevAmount =
        baValidation.prevStatus === ChallengeStatuses.Completed
          ? (baValidation.prevTotalPrizesInCents ?? 0) / 100
          : 0;

      if (currAmount !== prevAmount) {
        await this.consumeAmount(billingAccountId, {
          challengeId: baValidation.challengeId!,
          amount:
            (rollback ? prevAmount : currAmount) * (1 + baValidation.markup!),
        });
      }
    } else if (isCancelledChallengeStatus(status)) {
      const currAmount = baValidation.totalPrizesInCents / 100;

      if (currAmount > 0) {
        await this.consumeAmount(billingAccountId, {
          challengeId: baValidation.challengeId!,
          amount: currAmount * (1 + baValidation.markup!),
        });
        return;
      }

      if (
        baValidation.prevStatus?.toLowerCase() ===
        ChallengeStatuses.Active.toLowerCase()
      ) {
        // Challenge canceled, unlock previous locked amount
        const prevAmount = (baValidation.prevTotalPrizesInCents ?? 0) / 100;

        if (currAmount !== prevAmount) {
          await this.lockAmount(billingAccountId, {
            challengeId: baValidation.challengeId!,
            amount: rollback ? prevAmount : 0,
          });
        }
      } else {
        await this.lockAmount(billingAccountId, {
          challengeId: baValidation.challengeId!,
          amount: 0,
        });
      }
    }
  }

  async getBillingAccountsForUser(userId: string): Promise<string[]> {
    this.logger.log(`Fetching billing accounts for user '${userId}'`);

    try {
      return await this.m2MService
        .m2mFetch<
          { tcBillingAccountId: string }[]
        >(`${TOPCODER_API_V6_BASE_URL}/billing-accounts/users/${userId}`)
        .then((r) => r.map((b) => `${b.tcBillingAccountId}`));
    } catch (err: any) {
      this.logger.error(
        err.response?.data?.result?.content ??
          `Failed to fetch billing accounts for user '${userId}'!`,
        err,
      );
      throw new Error('Failed to fetch billing acccounts!');
    }
  }
}
