import { Inject, Injectable } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { AuthUser, LoginInput, SetupInput, UserRole } from '@pingwatch/shared';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { slugify } from '../common/slug';
import { PasswordService } from '../crypto/password.service';
import { AuthJwtService } from './jwt.service';
import { type IssuedRefreshToken, RefreshTokenService, type RotationContext } from './refresh-token.service';

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly passwords: PasswordService,
    private readonly jwt: AuthJwtService,
    private readonly refresh: RefreshTokenService,
  ) {}

  async getSetupState(): Promise<{ completed: boolean }> {
    const state = await this.db.setupState.findUnique({ where: { id: 'singleton' } });
    return { completed: state?.completedAt != null };
  }

  /** First-run: create admin + default org + project + admin membership, then auto-login. */
  async setup(input: SetupInput, ctx: RotationContext): Promise<AuthSession> {
    if ((await this.getSetupState()).completed) {
      throw new DomainException('CONFLICT', 'Setup has already been completed', 409);
    }
    const passwordHash = await this.passwords.hash(input.password);
    const orgName = input.orgName ?? 'My Organization';

    const created = await this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName, slug: slugify(orgName) } });
      await tx.project.create({ data: { organizationId: org.id, name: 'Default', slug: 'default' } });
      const user = await tx.user.create({
        data: { email: input.email.toLowerCase(), name: input.name ?? null, passwordHash },
      });
      await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'admin' } });
      await tx.setupState.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', completedAt: new Date() },
        update: { completedAt: new Date() },
      });
      return { user, orgId: org.id };
    });

    return this.startSession(
      { id: created.user.id, email: created.user.email, name: created.user.name, organizationId: created.orgId, role: 'admin' },
      ctx,
    );
  }

  async login(input: LoginInput, ctx: RotationContext): Promise<AuthSession> {
    const user = await this.db.user.findUnique({ where: { email: input.email.toLowerCase() } });
    // NOTE (P2 hardening): add a constant-time dummy verify on the not-found path to fully kill
    // user-enumeration via timing. MVP returns a generic INVALID_CREDENTIALS for both paths.
    const valid = user ? await this.passwords.verify(input.password, user.passwordHash) : false;
    if (!user || !valid || !user.isActive) {
      throw new DomainException('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const membership = await this.db.membership.findFirst({ where: { userId: user.id } });
    if (!membership) {
      throw new DomainException('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    await this.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.startSession(
      { id: user.id, email: user.email, name: user.name, organizationId: membership.organizationId, role: membership.role as UserRole },
      ctx,
    );
  }

  async refreshSession(
    rawRefresh: string | undefined,
    ctx: RotationContext,
  ): Promise<{ accessToken: string; refresh: IssuedRefreshToken; user: AuthUser }> {
    if (!rawRefresh) throw new DomainException('UNAUTHORIZED', 'No refresh token', 401);
    const rotated = await this.refresh.rotate(rawRefresh, ctx);
    if (!rotated) throw new DomainException('UNAUTHORIZED', 'Invalid or expired session', 401);

    const user = await this.db.user.findUnique({ where: { id: rotated.userId } });
    const membership = await this.db.membership.findFirst({ where: { userId: rotated.userId } });
    if (!user || !user.isActive || !membership) {
      throw new DomainException('UNAUTHORIZED', 'Invalid session', 401);
    }
    const authUser: AuthUser = {
      id: user.id, email: user.email, name: user.name, organizationId: membership.organizationId, role: membership.role,
    };
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      refresh: { raw: rotated.raw, expiresAt: rotated.expiresAt },
      user: authUser,
    };
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (rawRefresh) await this.refresh.revoke(rawRefresh);
  }

  /** Change own password — verify current, rehash, and revoke all other sessions. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw new DomainException('INVALID_CREDENTIALS', 'Current password is incorrect', 401);
    }
    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    await this.refresh.revokeAllForUser(userId);
  }

  private async startSession(user: AuthUser, ctx: RotationContext): Promise<AuthSession> {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email });
    const refresh = await this.refresh.issue(user.id, ctx);
    return { user, accessToken, refresh };
  }
}
