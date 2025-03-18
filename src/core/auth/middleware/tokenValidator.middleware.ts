import { Injectable, NestMiddleware } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class TokenValidatorMiddleware implements NestMiddleware {
  use(req: any, res: Response, next: (error?: any) => void) {
    const [type, idToken] = req.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !idToken) {
      return next();
    }

    // TODO: use jwt.verify to verify against auth0 secret
    const decoded: any = jwt.decode(idToken, {
      ignoreExpiration: true,
      ignoreNotBefore: true,
    });

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
