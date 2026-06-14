import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DomainException } from '../common/domain.exception';
import { ScopedTokenGuard, type TokenRequest } from '../auth/scoped-token.guard';

export interface AgentRequest extends Request {
  agentMonitorId?: string;
  agentOrgId?: string;
}

/**
 * Authenticates the `pingwatch-agent` via its `Bearer pwt_…` token bound to a system monitor (P3.3).
 * Delegates the Bearer-token validation to {@link ScopedTokenGuard} (P4.6) and then enforces the
 * agent-specific contract: the token must be of type `agent`, bound to a monitor, and hold the
 * `metrics:write` scope. The 401/403 codes are preserved byte-for-byte from the original guard.
 */
@Injectable()
export class AgentGuard implements CanActivate {
  constructor(private readonly scoped: ScopedTokenGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AgentRequest & TokenRequest>();
    const token = await this.scoped.authenticate(req); // 401 on missing/invalid/expired
    if (token.type !== 'agent' || token.monitorId === null) {
      throw new DomainException('UNAUTHORIZED', 'Invalid agent token', 401);
    }
    if (!token.scopes.includes('metrics:write')) {
      throw new DomainException('FORBIDDEN', 'Token lacks the metrics:write scope', 403);
    }
    req.agentMonitorId = token.monitorId;
    req.agentOrgId = token.organizationId;
    return true;
  }
}
