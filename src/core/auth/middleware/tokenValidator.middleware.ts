import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ENV_CONFIG } from 'src/config';
import { getSigningKey } from '../jwt';
import { Logger } from 'src/shared/global';

const logger = new Logger(`Auth/TokenValidatorMiddleware`);

@Injectable()
export class TokenValidatorMiddleware implements NestMiddleware {
  async use(req: any, res: Response, next: (error?: any) => void) {
    const [type, idToken] = req.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !idToken) {
      return next();
    }

    let decoded: any;
    try {
      const signingKey = await getSigningKey(idToken);
      decoded = jwt.verify(idToken, signingKey);
    } catch (error) {
      logger.error('Error verifying JWT', error);
      throw new UnauthorizedException('Invalid or expired JWT!');
    }

    if (!decoded) {
      req.idTokenVerified = false;
      return next();
    }

    req.isM2M = !!decoded.scope;
    const aud = req.isM2M
      ? ENV_CONFIG.AUTH0_M2M_AUDIENCE
      : ENV_CONFIG.AUTH0_CLIENT_ID;

    if (decoded.aud !== aud) {
      req.idTokenVerified = false;
      return next();
    }

    req.idTokenVerified = true;
    if (decoded.scope) {
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
