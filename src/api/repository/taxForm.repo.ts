import { Injectable } from '@nestjs/common';
import { tax_form_status } from '@prisma/client';
import { PrismaService } from 'src/shared/global/prisma.service';

@Injectable()
export class TaxFormRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check user has tax form or not
   *
   * @param userId user id
   * @returns true if user has active tax form
   */
  async hasActiveTaxForm(userId: string): Promise<boolean> {
    const count = await this.prisma.user_tax_form_associations.count({
      where: {
        user_id: userId,
        tax_form_status: tax_form_status.ACTIVE,
      },
    });

    return count > 0;
  }
}
