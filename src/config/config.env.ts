import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

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

    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return false;
  })
  ACCEPT_CUSTOM_PAYMENTS_MEMO;

  @IsString()
  @IsOptional()
  TC_EMAIL_NOTIFICATIONS_TOPIC = 'external.action.email';

  @IsString()
  @IsOptional()
  TC_EMAIL_FROM_NAME = 'Topcoder';

  @IsString()
  @IsNotEmpty()
  TC_EMAIL_FROM_EMAIL: string;

  @IsString()
  SENDGRID_TEMPLATE_ID_PAYMENT_SETUP_NOTIFICATION =
    'd-919e01f1314e44439bc90971b55f7db7';

  @IsString()
  TOPCODER_WALLET_URL = 'https://wallet.topcoder.com';
}
