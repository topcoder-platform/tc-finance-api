import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/shared/global/prisma.service';
import { TopcoderM2MService } from 'src/shared/topcoder/topcoder-m2m.service';
import { Logger } from 'src/shared/global';
import { ENV_CONFIG } from 'src/config';
import { ChallengeResource, ResourceRole } from '../challenges/models/challenge';
import { Prisma, winnings, payment } from '@prisma/client';

type Auth0User = Record<string, unknown>;

interface ListPaymentsParams {
  challengeId: string;
  requestUserId?: string;
  isMachineToken: boolean;
  winnerOnly: boolean;
  auth0User?: Auth0User;
}

interface SerializedPaymentDetail {
  id: string;
  netAmount: string;
  grossAmount: string;
  totalAmount: string;
  installmentNumber: number;
  status: string;
  currency: string;
  datePaid: string | null;
}

interface SerializedWinning {
  id: string;
  type: string;
  handle: string;
  winnerId: string;
  origin: string;
  category: string;
  title?: string;
  description: string;
  externalId: string;
  attributes: Record<string, string>;
  details: SerializedPaymentDetail[];
  createdAt: string;
  releaseDate: string;
  datePaid: string | null;
}

interface PaginatedResponse {
  winnings: SerializedWinning[];
  pagination: {
    totalItems: number;
    totalPages: number;
    pageSize: number;
    currentPage: number;
  };
}

const PRIVILEGED_ROLES = new Set([
  'payment admin',
  'payment editor',
  'payment viewer',
  'administrator',
]);

@Injectable()
export class ChallengePaymentsService {
  private readonly logger = new Logger(ChallengePaymentsService.name);
  private readonly tcApiBase = ENV_CONFIG.TOPCODER_API_V6_BASE_URL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly topcoderM2M: TopcoderM2MService,
  ) {}

  async listChallengePayments(params: ListPaymentsParams): Promise<PaginatedResponse> {
    const {
      challengeId,
      requestUserId,
      isMachineToken,
      winnerOnly,
      auth0User,
    } = params;

    if (!isMachineToken && !requestUserId) {
      throw new UnauthorizedException('Authenticated user is missing required identifier');
    }

    let allowAllForChallenge = isMachineToken || this.hasPrivilegedRole(auth0User);
    let winnerFilter: string | undefined;

    if (!allowAllForChallenge && requestUserId) {
      if (winnerOnly) {
        winnerFilter = requestUserId;
      }

      try {
        const isCopilot = await this.isCopilotForChallenge(challengeId, requestUserId);
        if (isCopilot) {
          allowAllForChallenge = true;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to verify copilot status for user ${requestUserId} on challenge ${challengeId}`,
          error instanceof Error ? error.message : error,
        );
      }

      if (!allowAllForChallenge) {
        winnerFilter = requestUserId;
      }
    }

    const winnings = await this.fetchWinnings(challengeId, allowAllForChallenge ? undefined : winnerFilter);
    return this.serializeResponse(challengeId, winnings);
  }

  private hasPrivilegedRole(auth0User?: Auth0User): boolean {
    if (!auth0User) {
      return false;
    }

    const roles = this.extractRoles(auth0User);
    return roles.some((role) => PRIVILEGED_ROLES.has(role.toLowerCase()));
  }

  private extractRoles(auth0User: Auth0User): string[] {
    const roles: string[] = [];

    Object.entries(auth0User).forEach(([key, value]) => {
      if (!key.match(/\/roles$/i)) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((role) => {
          if (role) {
            roles.push(String(role));
          }
        });
      } else if (value) {
        roles.push(String(value));
      }
    });

    const claimRoles = auth0User['roles'];
    if (Array.isArray(claimRoles)) {
      claimRoles
        .filter(Boolean)
        .forEach((role) => roles.push(String(role)));
    } else if (typeof claimRoles === 'string') {
      roles.push(claimRoles);
    }

    return roles;
  }

  private async isCopilotForChallenge(
    challengeId: string,
    userId: string,
  ): Promise<boolean> {
    const resourcesUrl = `${this.tcApiBase}/resources?challengeId=${challengeId}&memberId=${userId}`;
    const resourceRolesUrl = `${this.tcApiBase}/resource-roles`;

    const [resources, resourceRoles] = await Promise.all([
      this.topcoderM2M.m2mFetch<ChallengeResource[]>(resourcesUrl),
      this.topcoderM2M.m2mFetch<ResourceRole[]>(resourceRolesUrl),
    ]);

    if (!Array.isArray(resources) || resources.length === 0) {
      return false;
    }

    const copilotRoleIds = new Set(
      resourceRoles
        ?.filter((role) =>
          role?.name ? role.name.toLowerCase().includes('copilot') : false,
        )
        .map((role) => role.id),
    );

    if (copilotRoleIds.size === 0) {
      return false;
    }

    return resources.some((resource) =>
      copilotRoleIds.has(resource.roleId),
    );
  }

  private async fetchWinnings(
    challengeId: string,
    winnerId?: string,
  ): Promise<(winnings & { payment: payment[] })[]> {
    const where: Prisma.winningsWhereInput = {
      external_id: challengeId,
      type: 'PAYMENT',
    };

    if (winnerId) {
      where.winner_id = winnerId;
    }

    return this.prisma.winnings.findMany({
      where,
      include: {
        payment: {
          orderBy: [
            { installment_number: 'asc' },
            { created_at: 'asc' },
          ],
        },
      },
      orderBy: [{ created_at: 'desc' }],
    });
  }

  private serializeResponse(
    challengeId: string,
    winnings: Array<winnings & { payment: payment[] }>,
  ): PaginatedResponse {
    const serialized: SerializedWinning[] = winnings.map((winning) => {
      const firstPayment = winning.payment?.[0];
      const details = (winning.payment || []).map((detail) =>
        this.serializePayment(detail),
      );

      return {
        id: winning.winning_id,
        type: 'PAYMENT',
        handle: '',
        winnerId: winning.winner_id,
        origin: '',
        category: winning.category ?? 'CONTEST_PAYMENT',
        title: winning.title ?? undefined,
        description: winning.description ?? '',
        externalId: winning.external_id ?? challengeId,
        attributes: { url: '' },
        details,
        createdAt:
          this.toIsoString(winning.created_at) ??
          this.toIsoString(new Date()),
        releaseDate:
          this.toIsoString(firstPayment?.release_date ?? null) ??
          this.toIsoString(new Date()),
        datePaid: this.toIsoString(
          (firstPayment?.date_paid as Date | null) ?? null,
        ),
      };
    });

    return {
      winnings: serialized,
      pagination: {
        totalItems: serialized.length,
        totalPages: 1,
        pageSize: serialized.length,
        currentPage: 1,
      },
    };
  }

  private serializePayment(detail: payment): SerializedPaymentDetail {
    return {
      id: detail.payment_id,
      netAmount: this.decimalToString(detail.net_amount),
      grossAmount: this.decimalToString(detail.gross_amount),
      totalAmount: this.decimalToString(detail.total_amount),
      installmentNumber: detail.installment_number ?? 1,
      status: detail.payment_status ?? 'OWED',
      currency: detail.currency ?? 'USD',
      datePaid: this.toIsoString(detail.date_paid),
    };
  }

  private decimalToString(value?: Prisma.Decimal | null): string {
    if (value === null || value === undefined) {
      return '0';
    }

    if (typeof value === 'object' && 'toString' in value) {
      return value.toString();
    }

    return String(value);
  }

  private toIsoString(value?: Date | null): string | null {
    if (!value) {
      return null;
    }

    try {
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  }
}
