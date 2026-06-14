import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { CheckRunnerService } from '../engine/check-runner.service';
import { RollupService } from '../engine/rollup.service';
import { SchedulerService } from '../engine/scheduler.service';

/**
 * Self-observability (PLAN §6.9): a monitoring tool must watch itself. Exposes the rollup cron's
 * last-success time (so silent cron failure is visible), the scheduler's active-monitor count, and
 * in-flight checks. Authed.
 */
@UseGuards(JwtAuthGuard)
@Controller('system')
export class SystemController {
  private readonly startedAt = Date.now();

  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
    private readonly scheduler: SchedulerService,
    private readonly runner: CheckRunnerService,
    private readonly rollup: RollupService,
  ) {}

  @Get()
  async system() {
    const lastSuccess = this.rollup.getLastSuccessAt();
    return {
      version: '0.0.0',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      monitors: {
        active: this.scheduler.activeCount(),
        total: await this.db.monitor.count(),
      },
      engine: {
        checksInFlight: this.runner.inFlight(),
      },
      rollup: {
        lastSuccessAt: lastSuccess !== null ? new Date(lastSuccess).toISOString() : null,
      },
    };
  }
}
