import { Injectable } from '@nestjs/common';
import { verification_status } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

@Injectable()
export class IdentityVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if the user has completed their identity verification by checking the identity verification associations
   *
   * @param userId - The unique identifier of the user.
   * @returns A promise that resolves to `true` if the user has at least one active identity verification association, otherwise `false`.
   */
  async completedIdentityVerification(userId: string): Promise<boolean> {
    const count =
      await this.prisma.user_identity_verification_associations.count({
        where: {
          user_id: userId,
          verification_status: verification_status.ACTIVE,
        },
      });

    return count > 0;
  }
}
