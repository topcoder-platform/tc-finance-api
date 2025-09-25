import { decode } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

const logger = new Logger(`auth/jwks`);

const client = new JwksClient({
  jwksUri: `${ENV_CONFIG.AUTH0_M2M_TOKEN_URL}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
});

/**
 * Retrieves the signing key for a given JWT token.
 *
 * This function decodes the token to extract its header and uses the `kid` (Key ID)
 * to fetch the corresponding signing key from a remote client. The signing key is
 * then resolved as a public key.
 *
 * @param token - The JWT token for which the signing key is to be retrieved.
 * @returns A promise that resolves with the public signing key as a string.
 * @throws An error if the token is invalid, the `kid` is missing, or the signing key
 *         cannot be retrieved or resolved.
 */
export const getSigningKey = (token: string) => {
  const tokenHeader = decode(token, { complete: true })?.header;

  return new Promise<string>((resolve, reject) => {
    if (!tokenHeader || !tokenHeader.kid) {
      logger.error('Invalid token: Missing key ID');
      return reject(new Error('Invalid token: Missing key ID'));
    }

    client.getSigningKey(tokenHeader.kid, function (err, key) {
      if (err || !key) {
        logger.error('Error getting signing key:', err);
        return reject(new Error('Invalid token: Unable to get signing key'));
      }

      // Get the public key using the proper method
      const signingKey = key.getPublicKey();

      if (!signingKey) {
        logger.error('Error getting public key!');
        return reject(new Error('Invalid token: Unable to get public key'));
      }

      resolve(signingKey);
    });
  });
};
