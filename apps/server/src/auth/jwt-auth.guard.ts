import { type CanActivate, type ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { UserRole } from '@pingwatch/shared';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import type { RequestWithUser } from './authenticated-user';
import { AuthJwtService } from './jwt.service';
import { AUTH_FRONTEND, type AuthFrontend } from './frontends/auth-frontend';
import { ExternalIdentityService } from './external-identity.service';

/**
 * Verifies the HS256 access token from `Authorization: Bearer`, then loads the user's membership
 * (org + role) and attaches the principal to `req.user`. 401 on any failure (PLAN §6.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: AuthJwtService,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    @Optional() @Inject(AUTH_FRONTEND) private readonly frontend?: AuthFrontend,
    @Optional() private readonly externalIdentity?: ExternalIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      // P4.5 trusted-header mode: no Bearer → let the reverse-proxy headers authenticate (the
      // strategy itself enforces the trusted-proxy source). The Bearer/JWT path below is unchanged.
      if (this.frontend?.mode === 'trusted-header' && this.externalIdentity) {
        const identity = await this.frontend.tryResolve(req);
        if (identity) {
          req.user = await this.externalIdentity.provisionUser(identity);
          return true;
        }
      }
      throw new DomainException('UNAUTHORIZED', 'Missing access token', 401);
    }

    let sub: string;
    try {
      sub = this.jwt.verify(header.slice('Bearer '.length)).sub;
    } catch {
      throw new DomainException('UNAUTHORIZED', 'Invalid or expired access token', 401);
    }

    // Multi-tenant: the active org comes from the X-Pingwatch-Org header (verified against the
    // user's memberships); falls back to the user's first org (stable order) for single-org clients.
    const requestedOrg = req.headers['x-pingwatch-org'];
    let membership =
      typeof requestedOrg === 'string' && requestedOrg.length > 0
        ? await this.db.membership.findUnique({
            where: { userId_organizationId: { userId: sub, organizationId: requestedOrg } },
            include: { user: true },
          })
        : null;
    membership ??= await this.db.membership.findFirst({
      where: { userId: sub },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership || !membership.user.isActive) {
      throw new DomainException('UNAUTHORIZED', 'Session is no longer valid', 401);
    }

    req.user = {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      organizationId: membership.organizationId,
      role: membership.role as UserRole,
    };
    return true;
  }
}
