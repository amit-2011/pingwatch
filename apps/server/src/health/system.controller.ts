import { Controller, Get, Inject, Optional, UseGuards } from '@nestjs/common';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PINGWATCH_CONFIG, PRISMA_CLIENT } from '../common/di-tokens';
import type { ResolvedConfig } from '../config/schema';
import { CheckRunnerService } from '../engine/check-runner.service';
import { RollupService } from '../engine/rollup.service';
import { SCHEDULER_DRIVER, type SchedulerDriver } from '../engine/scheduler.driver';
import { LeaderElectionService } from '../engine/bullmq/leader-election.service';

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
    @Inject(SCHEDULER_DRIVER) private readonly scheduler: SchedulerDriver,
    @Inject(PINGWATCH_CONFIG) private readonly config: ResolvedConfig,
    private readonly runner: CheckRunnerService,
    private readonly rollup: RollupService,
    @Optional() private readonly leader?: LeaderElectionService,
  ) {}

  @Get()
  async system() {
    const lastSuccess = this.rollup.getLastSuccessAt();
    return {
      version: '0.0.0',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      monitors: {
        active: await this.scheduler.activeCount(),
        total: await this.db.monitor.count(),
      },
      engine: {
        checksInFlight: this.runner.inFlight(),
      },
      scheduler: {
        driver: this.config.scheduler,
        isLeader: this.leader ? this.leader.isLeader() : true,
      },
      rollup: {
        lastSuccessAt: lastSuccess !== null ? new Date(lastSuccess).toISOString() : null,
      },
    };
  }
}
