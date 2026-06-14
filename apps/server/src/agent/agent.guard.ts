import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { TokenService } from '../crypto/token.service';

export interface AgentRequest extends Request {
  agentMonitorId?: string;
  agentOrgId?: string;
}

/** Authenticates the `pingwatch-agent` via its `Bearer pwt_…` token bound to a system monitor (P3.3). */
@Injectable()
export class AgentGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AgentRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new DomainException('UNAUTHORIZED', 'Missing agent token', 401);
    }
    const apiToken = await this.db.apiToken.findUnique({
      where: { tokenHash: this.tokens.hash(header.slice('Bearer '.length)) },
    });
    if (!apiToken || apiToken.revokedAt !== null || apiToken.type !== 'agent' || apiToken.monitorId === null) {
      throw new DomainException('UNAUTHORIZED', 'Invalid agent token', 401);
    }
    if (apiToken.expiresAt !== null && apiToken.expiresAt.getTime() < Date.now()) {
      throw new DomainException('UNAUTHORIZED', 'Agent token expired', 401);
    }
    let scopes: unknown;
    try {
      scopes = JSON.parse(apiToken.scopes);
    } catch {
      scopes = [];
    }
    if (!Array.isArray(scopes) || !scopes.includes('metrics:write')) {
      throw new DomainException('FORBIDDEN', 'Token lacks the metrics:write scope', 403);
    }
    req.agentMonitorId = apiToken.monitorId;
    req.agentOrgId = apiToken.organizationId;
    return true;
  }
}
