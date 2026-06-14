import { Inject, Injectable } from '@nestjs/common';
import type { AgentMetricsInput } from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { TokenService } from '../crypto/token.service';

@Injectable()
export class AgentService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly tokens: TokenService,
  ) {}

  /** Mint an agent token bound to a monitor (raw token shown once). */
  async createToken(organizationId: string, monitorId: string): Promise<{ token: string; prefix: string }> {
    const monitor = await this.db.monitor.findFirst({
      where: { id: monitorId, organizationId },
      select: { id: true },
    });
    if (!monitor) throw new DomainException('NOT_FOUND', 'Monitor not found', 404);

    const token = `pwt_${this.tokens.generate().raw}`;
    await this.db.apiToken.create({
      data: {
        name: 'agent',
        type: 'agent',
        tokenHash: this.tokens.hash(token),
        prefix: token.slice(0, 12),
        organizationId,
        monitorId,
        scopes: JSON.stringify(['metrics:write']),
      },
    });
    return { token, prefix: token.slice(0, 12) };
  }

  async recordSample(monitorId: string, sample: AgentMetricsInput): Promise<void> {
    await this.db.metricSample.create({
      data: {
        monitorId,
        cpuPct: sample.cpuPct ?? null,
        memPct: sample.memPct ?? null,
        diskPct: sample.diskPct ?? null,
        netInKbps: sample.netInKbps ?? null,
        netOutKbps: sample.netOutKbps ?? null,
      },
    });
    await this.db.monitor.update({ where: { id: monitorId }, data: { status: 'up', lastCheckedAt: new Date() } });
  }
}
