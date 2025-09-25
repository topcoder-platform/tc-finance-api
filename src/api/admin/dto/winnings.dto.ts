import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';
import { PaymentStatus } from 'src/dto/payment.dto';

export class WinningUpdateRequestDto {
  @ApiProperty({
    description: 'The ID of the winnings',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
  })
  @IsString()
  @IsUUID()
  winningsId: string;

  @ApiProperty({
    description: 'Payment description',
    example: 'Task Payment',
  })
  @IsOptional()
  @IsString()
  description: string;

  @ApiProperty({
    description: 'The audit note',
    example: 'audit note',
  })
  @IsOptional()
  @IsString()
  auditNote: string;

  @ApiProperty({
    description: 'The ID of the payment',
    example: '2ccba36d-8db7-49da-94c9-b6c5b7bf47fb',
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    description: 'The payment status',
    enum: PaymentStatus,
    example: PaymentStatus.PAID,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @ApiProperty({
    description: 'The payment amount',
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount: number;

  @ApiProperty({
    description: 'The filter date',
    example: '2025-03-05T01:58:05.726Z',
  })
  @IsOptional()
  @IsDateString()
  releaseDate: string;
}
