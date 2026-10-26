import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { createJwtVerifier, type JwtVerifier } from 'tc-core-library-js';
import { ENV_CONFIG } from 'src/config';
import { Logger } from 'src/shared/global';

const logger = new Logger(`Auth/TokenValidatorMiddleware`);

@Injectable()
export class TokenValidatorMiddleware implements NestMiddleware {
  private verifier?: JwtVerifier;

  /** Verifies the request token with the shared issuer policy and sets the finance identity; returns next or throws UnauthorizedException. */
  async use(req: any, res: Response, next: (error?: any) => void) {
    const [type, idToken] = req.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !idToken) {
      return next();
    }

    let decoded: any;
    try {
      this.verifier ??= createJwtVerifier({
        issuers: [
          {
            issuer: `${ENV_CONFIG.AUTH0_M2M_TOKEN_URL.replace(/\/$/, '')}/`,
            algorithm: 'RS256',
            audience: [
              ENV_CONFIG.AUTH0_M2M_AUDIENCE,
              ENV_CONFIG.AUTH0_CLIENT_ID,
            ],
          },
        ],
      });
      decoded = await this.verifier.verify(idToken);
    } catch (error) {
      logger.error('Error verifying JWT', error);
      throw new UnauthorizedException('Invalid or expired JWT!');
    }

    if (!decoded) {
      req.idTokenVerified = false;
      return next();
    }

    req.isM2M = decoded.isMachine === true;
    const aud = req.isM2M
      ? ENV_CONFIG.AUTH0_M2M_AUDIENCE
      : ENV_CONFIG.AUTH0_CLIENT_ID;

    if (
      !(Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud]).includes(aud)
    ) {
      req.idTokenVerified = false;
      return next();
    }

    req.idTokenVerified = true;
    if (req.isM2M) {
      req.m2mTokenScope = decoded.scope;
      req.m2mTokenAudience = decoded.aud;
      req.m2mClientId = decoded.azp;
      req.m2mUserId = decoded.sub;
    } else {
      req.email = decoded?.email;
      req.auth0User = decoded;
    }

    return next();
  }
}
