import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { DateFilterType } from 'src/dto/date-filter.type';
import { PaymentStatus } from 'src/dto/payment.dto';
import { SortPagination } from 'src/dto/sort-pagination.dto';
import { WinningsCategory } from 'src/dto/winning.dto';

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
