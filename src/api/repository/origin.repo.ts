import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/global/prisma.service';

@Injectable()
export class OriginRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get origin id by name
   *
   * @param name origin name
   * @param tx transaction
   */
  async getOriginIdByName(name: string, tx?): Promise<number | null> {
    const db = tx || this.prisma;
    const originData = await db.origin.findFirst({
      where: { origin_name: name },
    });
    if (!originData) {
      return null;
    }
    return originData.origin_id as number;
  }
}
