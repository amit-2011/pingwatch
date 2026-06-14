import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateStatusPageInput,
  type UpdateStatusPageInput,
  createStatusPageSchema,
  updateStatusPageSchema,
} from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StatusPageService } from './status-page.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('status-pages')
export class StatusPageController {
  constructor(private readonly pages: StatusPageService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.pages.list(user.organizationId);
  }

  @Roles('admin')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createStatusPageSchema)) dto: CreateStatusPageInput,
  ) {
    return this.pages.create(user.organizationId, dto);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStatusPageSchema)) dto: UpdateStatusPageInput,
  ) {
    return this.pages.update(user.organizationId, id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.pages.remove(user.organizationId, id);
    return { ok: true };
  }
}
