import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsInt, IsString, IsNotEmpty, isEnum, IsEnum } from 'class-validator';
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
    description: 'Challenge markup (fee) for the payment',
    example: '0.5',
  })
  @IsNumber()
  @IsNotEmpty()
  challengeFee: number;
}
