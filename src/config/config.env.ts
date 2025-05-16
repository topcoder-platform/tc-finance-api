import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class ConfigEnv {
  @IsString()
  @IsOptional()
  API_BASE = '/v5/finance';

  @IsInt()
  @IsOptional()
  PORT = 3000;

  @IsString()
  TOPCODER_API_BASE_URL!: string;

  @IsString()
  AUTH0_M2M_AUDIENCE!: string;

  @IsString()
  AUTH0_TC_PROXY_URL!: string;

  @IsString()
  AUTH0_M2M_CLIENT_ID!: string;

  @IsString()
  AUTH0_M2M_SECRET!: string;

  @IsString()
  AUTH0_M2M_TOKEN_URL!: string;

  @IsString()
  AUTH0_M2M_GRANT_TYPE!: string;

  @IsString()
  AUTH0_CERT!: string;

  @IsString()
  AUTH0_CLIENT_ID!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  TROLLEY_WIDGET_BASE_URL!: string;

  @IsString()
  TROLLEY_WH_HMAC!: string;

  @IsString()
  TROLLEY_ACCESS_KEY!: string;

  @IsString()
  TROLLEY_SECRET_KEY!: string;

  @IsInt()
  @IsOptional()
  TROLLEY_MINIMUM_PAYMENT_AMOUNT: number = 0;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;

    return value.toLowerCase() === 'true';
  })
  ACCEPT_CUSTOM_PAYMENTS_MEMO;
}
