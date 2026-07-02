import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  Min,
  IsInt,
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { PrizeType } from 'src/api/challenges/models';

export enum PaymentStatus {
  PAID = 'PAID',
  ON_HOLD = 'ON_HOLD',
  ON_HOLD_ADMIN = 'ON_HOLD_ADMIN',
  OWED = 'OWED',
  PROCESSING = 'PROCESSING',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  RETURNED = 'RETURNED',
  CREDITED = 'CREDITED',
}

export class PaymentDetailDto {
  id: string;
  netAmount: number;
  grossAmount: number;
  totalAmount: number;
  installmentNumber: number;
  datePaid: Date;
  status: PaymentStatus;
  currency: string;
  releaseDate: Date;
  category: string;
  billingAccount: string;

  @ApiProperty({
    description:
      'Persisted billing-account challenge fee for this payment detail. Engagement payments use this value to reconcile finance payment splits with billing-account consumed rows.',
    example: 386.94,
    required: false,
  })
  challengeFee?: number;

  @ApiProperty({
    description:
      'Persisted billing-account markup used when the challenge fee was calculated.',
    example: 0.71,
    required: false,
  })
  challengeMarkup?: number;
}

export class PaymentCreateRequestDto {
  @ApiProperty({
    description: 'The total amount of the payment',
    example: 12.3,
  })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiProperty({
    description: 'The gross amount of the payment',
    example: 12.3,
  })
  @IsNumber()
  @Min(0)
  grossAmount: number;

  @ApiProperty({
    description: 'The installment number of the payment',
    example: 1,
  })
  @IsInt()
  @Min(0)
  installmentNumber: number;

  @ApiProperty({
    description: 'The currency of the payment',
    example: 'USD',
  })
  @IsEnum(PrizeType)
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: 'Billing Account number for the payment',
    example: '1231231',
  })
  @IsString()
  @IsNotEmpty()
  billingAccount: string;

  @ApiProperty({
    description:
      'Optional challenge markup fee for challenge-generated payments. Engagement payments omit this field because finance derives and persists the fee from the parent project billing-account markup.',
    example: '0.5',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  challengeFee?: number;
}
