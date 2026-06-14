import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { UserRole } from '@pingwatch/shared';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import type { RequestWithUser } from './authenticated-user';
import { AuthJwtService } from './jwt.service';

/**
 * Verifies the HS256 access token from `Authorization: Bearer`, then loads the user's membership
 * (org + role) and attaches the principal to `req.user`. 401 on any failure (PLAN §6.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: AuthJwtService,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new DomainException('UNAUTHORIZED', 'Missing access token', 401);
    }

    let sub: string;
    try {
      sub = this.jwt.verify(header.slice('Bearer '.length)).sub;
    } catch {
      throw new DomainException('UNAUTHORIZED', 'Invalid or expired access token', 401);
    }

    const membership = await this.db.membership.findFirst({
      where: { userId: sub },
      include: { user: true },
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
