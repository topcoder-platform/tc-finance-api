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
  ValidateIf,
} from 'class-validator';
import { auth } from 'tc-core-library-js';

/**
 * Reports whether the settings being validated select Keycloak for M2M, using the shared
 * tc-core-library-js rule (`auth.useKeycloak`): "true" selects Keycloak; missing, empty or
 * "false" selects Auth0. Used by the `ValidateIf` conditions below.
 * @param env Settings being validated.
 * @returns True when Keycloak is selected.
 * @throws TypeError for any other USE_KEYCLOAK value, so startup fails before serving.
 */
function keycloakSelected(env: ConfigEnv): boolean {
  return auth.useKeycloak({ USE_KEYCLOAK: env.USE_KEYCLOAK });
}

/**
 * Validates deployment settings for Finance. USE_KEYCLOAK=true requires the KEYCLOAK_*
 * M2M settings; otherwise the pre-migration AUTH0_M2M_* settings are required.
 */
export class ConfigEnv {
  @IsString()
  @IsOptional()
  API_BASE = '/v6/finance';

  @IsOptional()
  PORT = 3000;

  @IsString()
  TOPCODER_API_V5_BASE_URL!: string;

  @IsString()
  TOPCODER_API_V6_BASE_URL!: string;

  /** M2M provider switch: "true" = Keycloak, unset/empty/"false" = Auth0. */
  @IsOptional()
  @IsString()
  USE_KEYCLOAK?: string;

  // Keycloak M2M settings, required when USE_KEYCLOAK=true
  @ValidateIf(keycloakSelected)
  @IsString()
  KEYCLOAK_ISSUER!: string;

  @ValidateIf(keycloakSelected)
  @IsString()
  KEYCLOAK_AUDIENCE!: string;

  @ValidateIf(keycloakSelected)
  @IsString()
  KEYCLOAK_TOKEN_URL!: string;

  @ValidateIf(keycloakSelected)
  @IsString()
  KEYCLOAK_CLIENT_ID!: string;

  @ValidateIf(keycloakSelected)
  @IsString()
  KEYCLOAK_CLIENT_SECRET!: string;

  // Auth0 M2M settings, required when USE_KEYCLOAK is not true
  @ValidateIf((env: ConfigEnv) => !keycloakSelected(env))
  @IsString()
  AUTH0_M2M_AUDIENCE!: string;

  @ValidateIf((env: ConfigEnv) => !keycloakSelected(env))
  @IsString()
  AUTH0_TC_PROXY_URL!: string;

  @ValidateIf((env: ConfigEnv) => !keycloakSelected(env))
  @IsString()
  AUTH0_M2M_CLIENT_ID!: string;

  @ValidateIf((env: ConfigEnv) => !keycloakSelected(env))
  @IsString()
  AUTH0_M2M_SECRET!: string;

  @ValidateIf((env: ConfigEnv) => !keycloakSelected(env))
  @IsString()
  AUTH0_M2M_TOKEN_URL!: string;

  @ValidateIf((env: ConfigEnv) => !keycloakSelected(env))
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

  @IsString()
  BILLING_ACCOUNTS_DB_URL!: string;
}
