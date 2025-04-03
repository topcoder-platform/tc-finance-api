import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class TokenValidatorMiddleware implements NestMiddleware {
  use(req: any, res: Response, next: (error?: any) => void) {
    const [type, idToken] = req.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !idToken) {
      return next();
    }

    let decoded: any;
    try {
      decoded = jwt.verify(idToken, process.env.AUTH0_CERT);
    } catch (error) {
      console.error('Error verifying JWT', error);
      throw new UnauthorizedException('Invalid or expired JWT!');
    }

    if (!decoded) {
      req.idTokenVerified = false;
      return next();
    }

    req.isM2M = !!decoded.scope;
    const aud = req.isM2M
      ? process.env.AUTH0_M2M_AUDIENCE
      : process.env.AUTH0_CLIENT_ID;

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
