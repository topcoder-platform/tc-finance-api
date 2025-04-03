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
      decoded = jwt.verify(idToken, process.env.AUTH0_CERT, {
        audience: process.env.AUTH0_CLIENT_ID,
      });
    } catch (error) {
      console.error('Error verifying JWT', error);
      throw new UnauthorizedException('Invalid or expired JWT!');
    }

    // TODO: verify decoded.aud
    if (!decoded) {
      req.idTokenVerified = false;
      return next();
    }

    req.idTokenVerified = true;
    req.isM2M = !!decoded.scope;

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
