import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type TokenScope, scopeMeets } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { TokenService } from '../crypto/token.service';
import { REQUIRED_SCOPE_KEY } from './scopes.decorator';

export interface TokenRequest extends Request {
  apiTokenId?: string;
  apiTokenOrgId?: string;
  apiTokenScopes?: string[];
  apiTokenMonitorId?: string | null;
}

/** The validated token fields the guard exposes to delegators (e.g. AgentGuard) and handlers. */
export interface AuthenticatedToken {
  id: string;
  organizationId: string;
  monitorId: string | null;
  scopes: string[];
  type: string;
}

/**
 * Authenticates any `pwt_…` API token (P4.6) — the generalization of AgentGuard. Validates the
 * Bearer token (exists, not revoked, not expired), attaches `req.apiToken*`, best-effort bumps
 * `lastUsedAt`, then authorizes against the `@RequiredScope()` of the route (admin ⇒ write ⇒ read).
 */
@Injectable()
export class ScopedTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TokenRequest>();
    const token = await this.authenticate(req);
    const required = this.reflector.getAllAndOverride<TokenScope | undefined>(REQUIRED_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !scopeMeets(token.scopes, required)) {
      throw new DomainException('FORBIDDEN', `Token lacks the ${required} scope`, 403);
    }
    return true;
  }

  /** Validate the Bearer token and attach principal fields. Shared with AgentGuard. */
  async authenticate(req: TokenRequest): Promise<AuthenticatedToken> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new DomainException('UNAUTHORIZED', 'Missing token', 401);
    }
    const apiToken = await this.db.apiToken.findUnique({
      where: { tokenHash: this.tokens.hash(header.slice('Bearer '.length)) },
    });
    if (!apiToken) {
      throw new DomainException('UNAUTHORIZED', 'Invalid token', 401);
    }
    if (apiToken.revokedAt !== null) {
      // Reuse of a token that was rotated away ⇒ theft signal ⇒ revoke the whole family (P4.6),
      // mirroring the refresh-token reuse-detection. Plain-revoked (non-rotated) tokens just 401.
      if (apiToken.rotatedToId !== null && apiToken.family !== null) {
        await this.db.apiToken.updateMany({
          where: { family: apiToken.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new DomainException('UNAUTHORIZED', 'Invalid token', 401);
    }
    if (apiToken.expiresAt !== null && apiToken.expiresAt.getTime() < Date.now()) {
      throw new DomainException('UNAUTHORIZED', 'Token expired', 401);
    }
    const scopes = this.parseScopes(apiToken.scopes);
    req.apiTokenId = apiToken.id;
    req.apiTokenOrgId = apiToken.organizationId;
    req.apiTokenScopes = scopes;
    req.apiTokenMonitorId = apiToken.monitorId;
    // Best-effort usage stamp; never block or fail the request on it.
    void this.db.apiToken
      .update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      id: apiToken.id,
      organizationId: apiToken.organizationId,
      monitorId: apiToken.monitorId,
      scopes,
      type: apiToken.type,
    };
  }

  private parseScopes(raw: string): string[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }
}
