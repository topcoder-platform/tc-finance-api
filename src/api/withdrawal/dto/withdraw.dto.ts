import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ENV_CONFIG } from 'src/config';

export class WithdrawRequestDtoBase {
  @ApiProperty({
    description: 'The ID of the winnings to withdraw',
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @IsNotEmpty({ each: true })
  winningsIds: string[];

  @ApiProperty({
    description: 'The one-time password (OTP) code for withdrawal verification',
    example: '123456',
  })
  @IsNumberString()
  @IsOptional()
  @IsNotEmpty()
  otpCode?: string;
}

export class WithdrawRequestDtoWithMemo extends WithdrawRequestDtoBase {
  @ApiProperty({
    description:
      'A short note (30 chars max) which that will show up on your bank statement',
    example: 'Topcoder payment for week 05/17',
  })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  memo?: string;
}

export const WithdrawRequestDto = ENV_CONFIG.ACCEPT_CUSTOM_PAYMENTS_MEMO
  ? WithdrawRequestDtoWithMemo
  : WithdrawRequestDtoBase;
