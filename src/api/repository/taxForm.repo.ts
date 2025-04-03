import { Injectable } from '@nestjs/common';
import { TaxFormStatus } from 'src/dto/adminWinning.dto';
import { TaxFormQueryResult } from 'src/dto/taxForm.dto';
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
    const ret = await this.findTaxFormByUserId(userId);
    for (const r of ret) {
      if (r.status_id === TaxFormStatus.Active.toString()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find tax forms by user id
   *
   * @param userId user id
   * @param tx transaction
   * @returns tax forms
   */
  async findTaxFormByUserId(
    userId: string,
    tx?,
  ): Promise<TaxFormQueryResult[]> {
    const query = `
      SELECT u.id, u.user_id, t.tax_form_id, t.name, t.text, t.description, u.date_filed, u.withholding_amount, u.withholding_percentage, u.status_id::text, u.use_percentage 
          FROM user_tax_form_associations AS u
          JOIN tax_forms AS t ON u.tax_form_id = t.tax_form_id
          WHERE u.user_id = '${userId}'
    `;
    const db = tx || this.prisma;

    const ret = await db.$queryRawUnsafe(query);
    return (ret || []) as TaxFormQueryResult[];
  }
}
