import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateMaintenanceWindowInput,
  type UpdateMaintenanceWindowInput,
  createMaintenanceWindowSchema,
  updateMaintenanceWindowSchema,
} from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MaintenanceService } from './maintenance.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.maintenance.list(user.organizationId);
  }

  @Roles('member')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createMaintenanceWindowSchema)) dto: CreateMaintenanceWindowInput,
  ) {
    return this.maintenance.create(user.organizationId, dto);
  }

  @Roles('member')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMaintenanceWindowSchema)) dto: UpdateMaintenanceWindowInput,
  ) {
    return this.maintenance.update(user.organizationId, id, dto);
  }

  @Roles('member')
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.maintenance.remove(user.organizationId, id);
    return { ok: true };
  }
}
