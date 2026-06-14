import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiTokenSecretView, ApiTokenView, CreateApiTokenInput } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { TokenService } from '../crypto/token.service';

interface TokenRow {
  id: string;
  name: string;
  type: string;
  scopes: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  rotatedToId: string | null;
  createdAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scoped, rotatable programmatic API tokens (P4.6). Mirrors the refresh-token family model: each
 * rotation mints a new token in the same `family` and supersedes the old one (`rotatedToId`); the
 * ScopedTokenGuard revokes the whole family if a superseded token is ever presented again.
 */
@Injectable()
export class ApiTokenService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly tokens: TokenService,
  ) {}

  async list(organizationId: string): Promise<ApiTokenView[]> {
    const rows = await this.db.apiToken.findMany({
      where: { organizationId, type: 'api', rotatedToId: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async create(
    organizationId: string,
    userId: string,
    input: CreateApiTokenInput,
  ): Promise<ApiTokenSecretView> {
    const token = `pwt_${this.tokens.generate().raw}`;
    const row = await this.db.apiToken.create({
      data: {
        name: input.name,
        type: 'api',
        tokenHash: this.tokens.hash(token),
        prefix: token.slice(0, 12),
        organizationId,
        scopes: JSON.stringify(input.scopes),
        createdById: userId,
        family: randomUUID(),
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * DAY_MS) : null,
      },
    });
    return { ...this.toView(row), token };
  }

  /** Mint a replacement in the same family and supersede the old token (raw shown once). */
  async rotate(organizationId: string, id: string): Promise<ApiTokenSecretView> {
    const existing = await this.require(organizationId, id);
    const token = `pwt_${this.tokens.generate().raw}`;
    const next = await this.db.apiToken.create({
      data: {
        name: existing.name,
        type: 'api',
        tokenHash: this.tokens.hash(token),
        prefix: token.slice(0, 12),
        organizationId,
        scopes: existing.scopes,
        family: existing.family ?? randomUUID(),
        expiresAt: existing.expiresAt,
      },
    });
    await this.db.apiToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), rotatedToId: next.id },
    });
    return { ...this.toView(next), token };
  }

  async revoke(organizationId: string, id: string): Promise<void> {
    await this.require(organizationId, id);
    await this.db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  private async require(
    organizationId: string,
    id: string,
  ): Promise<TokenRow & { family: string | null }> {
    const row = await this.db.apiToken.findFirst({ where: { id, organizationId, type: 'api' } });
    if (!row) throw new DomainException('NOT_FOUND', 'API token not found', 404);
    return row;
  }

  private toView(row: TokenRow): ApiTokenView {
    let scopes: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.scopes);
      if (Array.isArray(parsed)) scopes = parsed.filter((s): s is string => typeof s === 'string');
    } catch {
      scopes = [];
    }
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      scopes,
      prefix: row.prefix,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      rotated: row.rotatedToId !== null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
