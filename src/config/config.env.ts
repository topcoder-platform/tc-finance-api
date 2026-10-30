import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ConfigEnv {
  @IsString()
  @IsNotEmpty()
  VALID_ISSUERS!: string;

  @IsString()
  @IsOptional()
  AUTH_SECRET?: string;

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE!: string;

  @IsString()
  @IsNotEmpty()
  AUTH0_AUDIENCE!: string;

  @IsString()
  @IsOptional()
  API_BASE = '/v6/finance';

  @IsOptional()
  PORT = 3000;

  @IsString()
  TOPCODER_API_V5_BASE_URL!: string;

  @IsString()
  TOPCODER_API_V6_BASE_URL!: string;

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

  @IsInt()
  @Min(3)
  @Max(5)
  @IsOptional()
  ENGAGEMENT_PAYMENT_RELEASE_WINDOW_DAYS: number = 5;

  @IsInt()
  @Min(0)
  @Max(99)
  @IsOptional()
  TROLLEY_PAYPAL_FEE_PERCENT: number = 0;

  @IsNumber()
  @IsOptional()
  TROLLEY_PAYPAL_FEE_MAX_AMOUNT: number = 0;

  @IsNumber()
  @IsOptional()
  OTP_CODE_VALIDITY_MINUTES: number = 5;

  @IsString()
  SENDGRID_TEMPLATE_ID_OTP_CODE: string = 'd-2d0ab9f6c9cc4efba50080668a9c35c1';

  @IsNumber()
  @Min(0)
  @IsOptional()
  DESIGN_SCREENER_FEE: number = 100;

  @IsInt({ each: true })
  TGBillingAccounts = [80000062, 80002800];

  @IsBoolean()
  @IsOptional()
  // read the raw env value: implicit conversion has already turned 'false' into true
  @Transform(({ obj, key }) => {
    const raw: unknown = (obj as Record<string, unknown>)[key];
    if (raw === undefined || raw === null || raw === '') return true;
    if (typeof raw === 'boolean') return raw;
    return typeof raw !== 'string' || raw.toLowerCase() !== 'false';
  })
  DUPLICATE_PAYMENTS_CHECK_ENABLED: boolean = true;

  @IsString()
  @IsOptional()
  DUPLICATE_PAYMENTS_CHECK_CRON = '0 * * * *';

  // Only releases created within this window are checked, so each duplicate
  // alerts on a few runs instead of on every run forever.
  @IsInt()
  @Min(1)
  @IsOptional()
  DUPLICATE_PAYMENTS_CHECK_LOOKBACK_HOURS: number = 2;

  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value)
      ? (value as unknown[])
      : String(value ?? '').split(',')
    )
      .map((email) => String(email).trim())
      .filter(Boolean),
  )
  DUPLICATE_PAYMENTS_ALERT_EMAILS: string[] = [];

  @IsString()
  @IsOptional()
  SENDGRID_TEMPLATE_ID_DUPLICATE_PAYMENTS_ALERT?: string =
    'd-ad7a0c9723c449e1ad0b9aa929e68a0d';

  @IsString()
  BILLING_ACCOUNTS_DB_URL!: string;
}
