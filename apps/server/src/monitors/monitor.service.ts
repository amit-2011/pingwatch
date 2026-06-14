import { Inject, Injectable } from '@nestjs/common';
import type { CreateMonitorInput, MonitorStatus, UpdateMonitorInput } from '@pingwatch/shared';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';
import { MonitorEngineService } from '../engine/monitor-engine.service';

interface MonitorRecord {
  id: string;
  projectId: string;
  name: string;
  type: string;
  config: string;
  intervalSeconds: number;
  retries: number;
  retryIntervalSeconds: number;
  timeoutMs: number;
  isActive: boolean;
  status: string;
  lastCheckedAt: Date | null;
  lastStatusChangeAt: Date | null;
  lastResponseTime: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  uptime30d: number | null;
  createdAt: Date;
}

export interface MonitorView extends Omit<MonitorRecord, 'config' | 'status'> {
  status: MonitorStatus;
  config: unknown;
}

@Injectable()
export class MonitorService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly engine: MonitorEngineService,
  ) {}

  async list(organizationId: string): Promise<MonitorView[]> {
    const monitors = await this.db.monitor.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return monitors.map((m) => this.toView(m));
  }

  async get(organizationId: string, id: string): Promise<MonitorView> {
    const monitor = await this.requireMonitor(organizationId, id);
    return this.toView(monitor);
  }

  async create(organizationId: string, input: CreateMonitorInput): Promise<MonitorView> {
    const project = await this.db.project.findFirst({
      where: { id: input.projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new DomainException('VALIDATION_ERROR', 'Project not found', 400);

    const monitor = await this.db.monitor.create({
      data: {
        organizationId,
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        config: JSON.stringify(input.config),
        intervalSeconds: input.intervalSeconds,
        retries: input.retries,
        retryIntervalSeconds: input.retryIntervalSeconds,
        timeoutMs: input.timeoutMs,
        isActive: input.isActive,
        status: 'pending',
      },
    });
    await this.engine.start(monitor.id);
    return this.toView(monitor);
  }

  async update(organizationId: string, id: string, input: UpdateMonitorInput): Promise<MonitorView> {
    await this.requireMonitor(organizationId, id);
    const data: Prisma.MonitorUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.intervalSeconds !== undefined) data.intervalSeconds = input.intervalSeconds;
    if (input.retries !== undefined) data.retries = input.retries;
    if (input.retryIntervalSeconds !== undefined) data.retryIntervalSeconds = input.retryIntervalSeconds;
    if (input.timeoutMs !== undefined) data.timeoutMs = input.timeoutMs;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.config !== undefined) data.config = JSON.stringify(input.config);

    const monitor = await this.db.monitor.update({ where: { id }, data });
    await this.engine.restart(monitor.id);
    return this.toView(monitor);
  }

  async setActive(organizationId: string, id: string, isActive: boolean): Promise<MonitorView> {
    await this.requireMonitor(organizationId, id);
    const monitor = await this.db.monitor.update({ where: { id }, data: { isActive } });
    if (isActive) await this.engine.restart(id);
    else this.engine.stop(id);
    return this.toView(monitor);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.requireMonitor(organizationId, id);
    this.engine.stop(id);
    await this.db.monitor.delete({ where: { id } });
  }

  async heartbeats(organizationId: string, id: string, limit: number): Promise<unknown[]> {
    await this.requireMonitor(organizationId, id);
    return this.db.heartbeat.findMany({
      where: { monitorId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: { status: true, responseTime: true, statusCode: true, message: true, important: true, createdAt: true },
    });
  }

  private async requireMonitor(organizationId: string, id: string): Promise<MonitorRecord> {
    const monitor = await this.db.monitor.findFirst({ where: { id, organizationId } });
    if (!monitor) throw new DomainException('NOT_FOUND', 'Monitor not found', 404);
    return monitor;
  }

  private toView(monitor: MonitorRecord): MonitorView {
    const { config, status, ...rest } = monitor;
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(config);
    } catch {
      parsed = {};
    }
    return { ...rest, status: status as MonitorStatus, config: parsed };
  }
}
