import { ApiProperty } from '@nestjs/swagger';

export enum ResponseStatusType {
  SUCCESS = 'success',
  ERROR = 'error',
}

export class Error {
  code: number;
  message: string;
}

export class ResponseDto<T> {
  @ApiProperty({
    description: 'Type of the response',
    enum: ResponseStatusType,
    example: ResponseStatusType.SUCCESS,
  })
  status: ResponseStatusType;

  @ApiProperty({
    description: 'The response data',
  })
  data: T;

  @ApiProperty({
    description: 'The error message',
  })
  error: Error;
}
