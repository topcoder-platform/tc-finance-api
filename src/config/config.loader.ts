import * as dotenv from 'dotenv';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConfigEnv } from './config.env';
import { Logger } from 'src/shared/global';

const logger = new Logger('ENV_CONFIG');

/**
 * Loads and validates environment variables into a `ConfigEnv` instance.
 *
 * This function uses `plainToInstance` to map environment variables from `process.env`
 * into a `ConfigEnv` class instance, enabling implicit conversion and exposing default values.
 * It then validates the resulting instance using `validateSync` to ensure all required
 * properties are present and conform to the expected constraints.
 *
 * If validation errors are found, they are logged using a `Logger` instance, and an error
 * is thrown to indicate invalid environment variables.
 *
 * @throws {Error} If any environment variables are invalid or missing.
 * @returns {ConfigEnv} A validated instance of the `ConfigEnv` class.
 */
function loadAndValidateEnv(): ConfigEnv {
  // eslint-disable-next-line no-restricted-syntax
  const env = plainToInstance(ConfigEnv, process.env, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(env, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    for (const err of errors) {
      logger.error(
        'Invalid or missing environment variables!',
        err.constraints,
      );
    }
    throw new Error('Invalid environment variables');
  }

  logger.debug(`Environment config vars successfully loaded and validated!`);

  return env;
}

dotenv.config();
export const ENV_CONFIG = loadAndValidateEnv();
