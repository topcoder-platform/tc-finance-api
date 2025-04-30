import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsIn, IsEnum, IsOptional } from 'class-validator';

export const OrderBy = [
  'winning_id',
  'winner_id',
  'type',
  'category',
  'title',
  'external_id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
] as const;

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class PaginationInfo {
  totalItems: number;
  totalPages: number;
  pageSize: number;
  currentPage: number;
}

export class SortPagination {
  @ApiProperty({
    description: 'The limit parameter for pagination',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiProperty({
    description: 'The offset parameter for pagination',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiProperty({
    description: 'The sortBy parameter for sorting',
    example: 'type',
  })
  @IsOptional()
  @IsIn(OrderBy)
  sortBy: string;

  @ApiProperty({
    description: 'The sort order',
    enum: SortOrder,
    example: SortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.ASC;
}
