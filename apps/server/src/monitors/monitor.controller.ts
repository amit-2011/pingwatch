import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateMonitorInput,
  type UpdateMonitorInput,
  createMonitorSchema,
  updateMonitorSchema,
} from '@pingwatch/shared';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MonitorService } from './monitor.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MonitorController {
  constructor(
    private readonly monitors: MonitorService,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
  ) {}

  @Get('projects')
  projects(@CurrentUser() user: AuthenticatedUser) {
    return this.db.project.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('monitors')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.monitors.list(user.organizationId);
  }

  @Get('monitors/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.monitors.get(user.organizationId, id);
  }

  @Get('monitors/:id/heartbeats')
  heartbeats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.monitors.heartbeats(user.organizationId, id, limit ? Number(limit) : 100);
  }

  @Roles('member')
  @Post('monitors')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createMonitorSchema)) dto: CreateMonitorInput,
  ) {
    return this.monitors.create(user.organizationId, dto);
  }

  @Roles('member')
  @Patch('monitors/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMonitorSchema)) dto: UpdateMonitorInput,
  ) {
    return this.monitors.update(user.organizationId, id, dto);
  }

  @Roles('member')
  @Post('monitors/:id/pause')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.monitors.setActive(user.organizationId, id, false);
  }

  @Roles('member')
  @Post('monitors/:id/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.monitors.setActive(user.organizationId, id, true);
  }

  @Roles('member')
  @Delete('monitors/:id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.monitors.remove(user.organizationId, id);
    return { ok: true };
  }
}
