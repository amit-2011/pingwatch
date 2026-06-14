import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { ExternalIdentity } from '@pingwatch/shared';
import { PINGWATCH_CONFIG } from '../../common/di-tokens';
import type { ResolvedConfig } from '../../config/schema';
import { type AuthFrontend, isTrustedProxy } from './auth-frontend';

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reverse-proxy SSO (P4.5): Authelia/Authentik (or any proxy) authenticates the user and forwards
 * the identity in X-Forwarded-User/-Email/-Groups. We honor those headers ONLY when the request's
 * immediate peer is a configured trusted proxy — so a direct client can never spoof them.
 */
@Injectable()
export class TrustedHeaderStrategy implements AuthFrontend {
  readonly mode = 'trusted-header' as const;

  constructor(@Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig) {}

  tryResolve(req: Request): Promise<ExternalIdentity | null> {
    if (!isTrustedProxy(req.socket.remoteAddress, this.config.auth.trustedProxyCidrs)) {
      return Promise.resolve(null);
    }
    const email = header(req, this.config.auth.headerEmail);
    if (!email) return Promise.resolve(null);

    const userName = header(req, this.config.auth.headerUser);
    const groups = (header(req, this.config.auth.headerGroups) ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    const identity: ExternalIdentity = {
      subject: userName ?? email,
      email,
      groups,
      source: 'trusted-header',
      ...(userName ? { name: userName } : {}),
    };
    return Promise.resolve(identity);
  }
}
