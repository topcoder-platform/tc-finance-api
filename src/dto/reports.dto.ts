import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsDateString,
} from 'class-validator';

const transformArray = ({ value }: { value: string }) =>
  Array.isArray(value) ? value : [value];

export class PaymentsReportQueryDto {
  @ApiProperty({
    description:
      'List of billing account IDs associated with the payments to retrieve',
    example: ['80001012'],
  })
  @IsOptional()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Transform(transformArray)
  billingAccountIds?: string[];

  @ApiProperty({
    description: 'List of challenge IDs',
    example: ['e74c3e37-73c9-474e-a838-a38dd4738906'],
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  challengeName?: string;

  @ApiProperty({
    description: 'List of challenge IDs',
    example: ['e74c3e37-73c9-474e-a838-a38dd4738906'],
  })
  @IsOptional()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Transform(transformArray)
  challengeIds?: string[];

  @ApiProperty({
    description: 'Start date for the report query in ISO format',
    example: '2023-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @ApiProperty({
    description: 'End date for the report query in ISO format',
    example: '2023-01-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @ApiProperty({
    description: 'List of user handles',
    example: ['user_01', 'user_02'],
  })
  @IsOptional()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Transform(transformArray)
  handles?: string[];

  @ApiProperty({
    description: 'Minimum payment amount for filtering the report',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => +value)
  minPaymentAmount?: number;

  @ApiProperty({
    description: 'Maximum payment amount for filtering the report',
    example: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => +value)
  maxPaymentAmount?: number;
}

export class PaymentsReportResponse {
  billingAccountId: string;
  challengeName: string;
  challengeId: string;
  paymentDate: string;
  paymentId: string;
  paymentStatus: string;
  winnerId: string;
  winnerHandle: string;
  winnerFirstName: string;
  winnerLastName: string;
  isTask: boolean;
  challengeFee: number;
  paymentAmount: number;
}
