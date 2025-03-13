import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import {
  WinningsCategory,
  PaymentStatus,
  DateFilterType,
  SortPagination,
} from './adminWinning.dto';

export class UserInfo {
  id: string;
  handle: string;
}

export class UserWinningRequestDto extends SortPagination {
  @ApiProperty({
    description: 'The ID of the winner',
    example: 'admin_01',
  })
  @IsString()
  @IsNotEmpty()
  winnerId: string;

  @ApiProperty({
    description: 'The type of winnings category',
    example: WinningsCategory.ALGORITHM_CONTEST_PAYMENT,
    enum: WinningsCategory,
  })
  @IsOptional()
  @IsEnum(WinningsCategory)
  type: WinningsCategory;

  @ApiProperty({
    description: 'The payment status',
    example: PaymentStatus.OWED,
    enum: PaymentStatus,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiProperty({
    description: 'The filter date',
    example: DateFilterType.LAST7DAYS,
    enum: DateFilterType,
  })
  @IsOptional()
  @IsEnum(DateFilterType)
  date: DateFilterType;
}
