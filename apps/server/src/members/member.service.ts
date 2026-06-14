import { Inject, Injectable } from '@nestjs/common';
import type { AddMemberInput, UserRole } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { PasswordService } from '../crypto/password.service';

export interface MemberView {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  isSelf: boolean;
}

@Injectable()
export class MemberService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly passwords: PasswordService,
  ) {}

  async list(organizationId: string, currentUserId: string): Promise<MemberView[]> {
    const memberships = await this.db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      isSelf: m.user.id === currentUserId,
    }));
  }

  /** Add a member — create the user account if the email is new, then attach a membership. */
  async add(organizationId: string, input: AddMemberInput): Promise<MemberView> {
    const email = input.email.toLowerCase();
    const user =
      (await this.db.user.findUnique({ where: { email } })) ??
      (await this.db.user.create({
        data: { email, name: input.name ?? null, passwordHash: await this.passwords.hash(input.password) },
      }));

    const existing = await this.db.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (existing) throw new DomainException('CONFLICT', 'User is already a member of this org', 409);

    await this.db.membership.create({ data: { userId: user.id, organizationId, role: input.role } });
    return { userId: user.id, email: user.email, name: user.name, role: input.role, isSelf: false };
  }

  async setRole(organizationId: string, userId: string, role: UserRole): Promise<void> {
    const membership = await this.requireMembership(organizationId, userId);
    if (membership.role === 'admin' && role !== 'admin') {
      await this.assertNotLastAdmin(organizationId);
    }
    await this.db.membership.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { role },
    });
  }

  async remove(organizationId: string, userId: string): Promise<void> {
    const membership = await this.requireMembership(organizationId, userId);
    if (membership.role === 'admin') await this.assertNotLastAdmin(organizationId);
    await this.db.membership.delete({ where: { userId_organizationId: { userId, organizationId } } });
  }

  private async requireMembership(organizationId: string, userId: string) {
    const membership = await this.db.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) throw new DomainException('NOT_FOUND', 'Member not found', 404);
    return membership;
  }

  private async assertNotLastAdmin(organizationId: string): Promise<void> {
    const admins = await this.db.membership.count({ where: { organizationId, role: 'admin' } });
    if (admins <= 1) {
      throw new DomainException('CONFLICT', 'Cannot remove or demote the last admin', 409);
    }
  }
}
