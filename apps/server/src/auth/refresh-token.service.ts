import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { TokenService } from '../crypto/token.service';

/** Refresh token lifetime (PLAN §6 — 30-day sliding via rotation). */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

export interface RotationContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

/**
 * Opaque, DB-backed refresh tokens with rotation + reuse detection (PLAN §6.1). Stored as sha256;
 * each rotation issues a new token in the same `family` and revokes the old one. Presenting an
 * already-revoked token (replay/theft) revokes the WHOLE family.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly tokens: TokenService,
  ) {}

  async issue(userId: string, ctx: RotationContext = {}, family?: string): Promise<IssuedRefreshToken> {
    const { raw, hash } = this.tokens.generate();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash: hash,
        family: family ?? randomUUID(),
        expiresAt,
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
      },
    });
    return { raw, expiresAt };
  }

  /** Rotate a presented token → new token + userId, or null if invalid/expired/reused. */
  async rotate(
    raw: string,
    ctx: RotationContext = {},
  ): Promise<(IssuedRefreshToken & { userId: string }) | null> {
    const existing = await this.db.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hash(raw) },
    });
    if (!existing) return null;

    if (existing.revokedAt) {
      // Reuse of a rotated token ⇒ theft signal ⇒ revoke the entire family.
      await this.db.refreshToken.updateMany({
        where: { family: existing.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return null;
    }
    if (existing.expiresAt.getTime() < Date.now()) return null;

    await this.db.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const next = await this.issue(existing.userId, ctx, existing.family);
    return { ...next, userId: existing.userId };
  }

  async revoke(raw: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { tokenHash: this.tokens.hash(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
