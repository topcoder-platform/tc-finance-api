import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from 'src/shared/global/prisma.service';

import { ResponseDto, WinningCreateRequestDto } from 'src/dto/adminWinning.dto';

/**
 * The winning service.
 */
@Injectable()
export class WinningService {
  /**
   * Constructs the admin winning service with the given dependencies.
   * @param prisma the prisma service.
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create winnings with parameters
   * @param body the request body
   * @param userId the request userId
   * @returns the Promise with response result
   */
  async createWinningWithPayments(
    body: WinningCreateRequestDto,
    userId: string,
  ): Promise<ResponseDto<string>> {
    const result = new ResponseDto<string>();

    try {
      const winningsEntity = await this.prisma.winnings.create({
        data: {
          winner_id: body.winnerId,
          type: body.type,
          origin: {
            create: {
              origin_name: body.origin,
            },
          },
          category: body.category,
          title: body.title,
          description: body.description,
          external_id: body.externalId,
          attributes: body.attributes,
          created_by: userId,
          created_at: new Date(),
        },
      });

      const paymentData: Prisma.paymentCreateManyInput[] = body.details.map(
        (item) => ({
          total_amount: new Prisma.Decimal(item.totalAmount),
          gross_amount: new Prisma.Decimal(item.grossAmount),
          installment_number: item.installmentNumber,
          currency: item.currency,
          created_by: userId,
          created_at: new Date(),
          payment_status: 'ON_HOLD',
          version: 1,
          winnings_id: winningsEntity.winning_id,
        }),
      );

      await this.prisma.payment.createMany({
        data: paymentData,
      });

      result.data = 'Create winnings successfully';
    } catch (error) {
      console.error('Getting winnings audit failed', error);
      const message = 'Searching winnings failed. ' + error;
      result.error = {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message,
      };
    }

    return result;
  }
}
