import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { auth } from 'tc-core-library-js';

/** Adapts the common verified principal to Finance's existing request fields. */
@Injectable()
export class TokenValidatorMiddleware implements NestMiddleware {
  private readonly validator = auth.createValidator();

  /**
   * Verify an optional bearer header and populate Finance's user or machine fields.
   * @param req Current HTTP request.
   * @param _res HTTP response, unused by this adapter.
   * @param next Continue the request, optionally with a sanitized authentication error.
   * @returns Nothing after invoking next.
   * @throws UnauthorizedException when supplied credentials are invalid.
   */
  async use(req: any, _res: Response, next: (error?: any) => void) {
    if (!req.headers.authorization) return next();
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization);
    if (!match) throw new UnauthorizedException('Invalid or expired JWT!');
    try {
      const principal = await this.validator.verify(match[1]);
      req.authUser = principal;
      req.idTokenVerified = true;
      req.isM2M = principal.isMachine;
      if (principal.isMachine) {
        req.m2mTokenScope = principal.scopes.join(' ');
        req.m2mTokenAudience = principal.aud;
        req.m2mClientId = principal.clientId;
        req.m2mUserId = principal.sub;
      } else {
        req.email = principal.email;
        req.auth0User = principal;
      }
      return next();
    } catch {
      throw new UnauthorizedException('Invalid or expired JWT!');
    }
  }
}
