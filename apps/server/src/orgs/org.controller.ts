import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PRISMA_CLIENT } from '../common/di-tokens';

/** The orgs the current user belongs to — powers the org switcher (P2.1). */
@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgController {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  @Get()
  async myOrgs(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.db.membership.findMany({
      where: { userId: user.id },
      include: { organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      current: m.organizationId === user.organizationId,
    }));
  }
}
