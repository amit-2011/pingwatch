import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ExternalIdentity, UserRole } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PINGWATCH_CONFIG, PRISMA_CLIENT } from '../common/di-tokens';
import type { ResolvedConfig } from '../config/schema';
import { DomainException } from '../common/domain.exception';
import { PasswordService } from '../crypto/password.service';
import type { AuthenticatedUser } from './authenticated-user';

/**
 * Maps an externally-authenticated identity (reverse-proxy header or OIDC) to a PingWatch
 * User + Membership (P4.5). New users are auto-provisioned (if enabled) into the seeded default org
 * with a role from the group→role map (or the default role), and given a random un-loginable
 * password hash so the local-password flow can never be used for an SSO account.
 */
@Injectable()
export class ExternalIdentityService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    @Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig,
    private readonly passwords: PasswordService,
  ) {}

  /** Resolve the identity to a principal, provisioning the user/membership on first sight. */
  async provisionUser(identity: ExternalIdentity): Promise<AuthenticatedUser> {
    const email = identity.email.toLowerCase();
    const role = this.mapRole(identity.groups);

    let user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      if (!this.config.auth.autoProvision) {
        throw new DomainException('FORBIDDEN', 'Auto-provisioning is disabled for unknown users', 403);
      }
      const org = await this.requireDefaultOrg();
      const passwordHash = await this.passwords.hash(randomBytes(32).toString('hex'));
      user = await this.db.user.create({ data: { email, name: identity.name ?? null, passwordHash } });
      await this.db.membership.create({ data: { userId: user.id, organizationId: org.id, role } });
    }

    const membership = await this.db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      const org = await this.requireDefaultOrg();
      const created = await this.db.membership.create({
        data: { userId: user.id, organizationId: org.id, role },
      });
      return this.toPrincipal(user, created.organizationId, created.role as UserRole);
    }
    return this.toPrincipal(user, membership.organizationId, membership.role as UserRole);
  }

  private async requireDefaultOrg(): Promise<{ id: string }> {
    const org = await this.db.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!org) throw new DomainException('CONFLICT', 'No organization exists yet — complete first-run setup first', 409);
    return org;
  }

  private mapRole(groups: string[]): UserRole {
    for (const group of groups) {
      const mapped = this.config.auth.groupRoleMap[group];
      if (mapped) return mapped;
    }
    return this.config.auth.defaultRole;
  }

  private toPrincipal(
    user: { id: string; email: string; name: string | null },
    organizationId: string,
    role: UserRole,
  ): AuthenticatedUser {
    return { id: user.id, email: user.email, name: user.name, organizationId, role };
  }
}
