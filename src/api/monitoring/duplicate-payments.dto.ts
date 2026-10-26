import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DuplicatePaymentsQueryDto {
  @ApiPropertyOptional({
    description:
      'Only include pairs whose newer release was created in the last N days. Omit for the whole history.',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}

export class DuplicateSharedWinningDto {
  @ApiProperty()
  winningId: string;

  @ApiProperty({ nullable: true })
  title: string | null;

  @ApiProperty({ example: '1609.00' })
  amount: string;
}

export class DuplicatePaymentReleaseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ nullable: true })
  handle: string | null;

  @ApiProperty({ description: 'The older release of the pair' })
  release1Id: string;

  @ApiProperty({ description: 'The newer release of the pair' })
  release2Id: string;

  @ApiProperty({ nullable: true })
  release1Status: string | null;

  @ApiProperty({ nullable: true })
  release2Status: string | null;

  @ApiProperty()
  release1CreatedAt: Date;

  @ApiProperty()
  release2CreatedAt: Date;

  @ApiProperty({ example: '10893.00' })
  release1Amount: string;

  @ApiProperty({ example: '10893.00' })
  release2Amount: string;

  @ApiProperty({ nullable: true })
  trolleyPayment1Id: string | null;

  @ApiProperty({ nullable: true })
  trolleyPayment2Id: string | null;

  @ApiProperty({ description: 'Number of payments in both releases' })
  sharedPayments: number;

  @ApiProperty({ description: 'Total amount of the shared payments' })
  sharedAmount: string;

  @ApiProperty({ type: [DuplicateSharedWinningDto] })
  sharedWinnings: DuplicateSharedWinningDto[];
}
