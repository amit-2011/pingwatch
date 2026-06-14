import { createHash, randomBytes } from 'node:crypto';
import { Controller, Get, Inject, Optional, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SsoProvidersResponse } from '@pingwatch/shared';
import { PINGWATCH_CONFIG } from '../common/di-tokens';
import type { ResolvedConfig } from '../config/schema';
import { DomainException } from '../common/domain.exception';
import { AuthService } from './auth.service';
import { setRefreshCookie } from './cookies';
import { ExternalIdentityService } from './external-identity.service';
import { OidcStrategy } from './frontends/oidc.strategy';

const OIDC_COOKIE = 'pingwatch_oidc';
const OIDC_COOKIE_PATH = '/api/auth/sso';

interface OidcCookie {
  state: string;
  nonce: string;
  verifier: string;
}

/** SSO endpoints (P4.5): advertise the active mode + run the OIDC authorization-code flow. */
@Controller('auth/sso')
export class SsoController {
  constructor(
    @Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig,
    private readonly auth: AuthService,
    private readonly externalIdentity: ExternalIdentityService,
    @Optional() private readonly oidc?: OidcStrategy,
  ) {}

  @Get('providers')
  providers(): SsoProvidersResponse {
    if (this.config.auth.mode === 'oidc') {
      return { mode: 'oidc', loginUrl: '/api/auth/sso/oidc/start', label: 'Sign in with SSO' };
    }
    return { mode: this.config.auth.mode };
  }

  @Get('oidc/start')
  async start(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!this.oidc) throw new DomainException('NOT_FOUND', 'OIDC is not enabled', 404);
    const state = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const payload: OidcCookie = { state, nonce, verifier };
    res.cookie(OIDC_COOKIE, JSON.stringify(payload), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      path: OIDC_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(await this.oidc.authorizationUrl(state, nonce, challenge));
  }

  @Get('oidc/callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    if (!this.oidc) throw new DomainException('NOT_FOUND', 'OIDC is not enabled', 404);
    if (!code || !state) throw new DomainException('UNAUTHORIZED', 'Missing OIDC code/state', 401);

    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    let parsed: OidcCookie;
    try {
      parsed = JSON.parse(cookies?.[OIDC_COOKIE] ?? '{}') as OidcCookie;
    } catch {
      throw new DomainException('UNAUTHORIZED', 'Invalid OIDC session', 401);
    }
    if (!parsed.state || parsed.state !== state) {
      throw new DomainException('UNAUTHORIZED', 'OIDC state mismatch', 401);
    }

    const identity = await this.oidc.exchangeAndVerify(code, parsed.verifier, parsed.nonce);
    const user = await this.externalIdentity.provisionUser(identity);
    const session = await this.auth.issueSessionForUser(user.id, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    res.clearCookie(OIDC_COOKIE, { path: OIDC_COOKIE_PATH });
    setRefreshCookie(req, res, session.refresh.raw, session.refresh.expiresAt);
    res.redirect('/');
  }
}
