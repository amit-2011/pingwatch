import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { APP_SECRET } from '../common/di-tokens';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  email: string;
}

/** Short-lived access token TTL (PLAN §6.1). Refresh tokens (long-lived, DB-backed) live elsewhere. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class AuthJwtService {
  constructor(@Inject(APP_SECRET) private readonly secret: string) {}

  sign(claims: AccessTokenClaims): string {
    return jwt.sign(claims, this.secret, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  /** Verify + decode. Throws if invalid/expired (caller maps to 401). */
  verify(token: string): AccessTokenClaims {
    const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new Error('Malformed access token');
    }
    return { sub: decoded.sub, email: String(decoded['email'] ?? '') };
  }
}
