import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class WithdrawRequestDto {
  @ApiProperty({
    description: 'The ID of the winnings to withdraw',
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4',{ each: true })
  @IsNotEmpty({ each: true })
  winningsIds: string[];
}
