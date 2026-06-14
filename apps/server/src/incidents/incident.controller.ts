import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type PostIncidentCommentInput,
  type UpdateIncidentInput,
  postIncidentCommentSchema,
  updateIncidentSchema,
} from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IncidentAdminService } from './incident.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('incidents')
export class IncidentController {
  constructor(private readonly incidents: IncidentAdminService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.incidents.list(user.organizationId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.incidents.get(user.organizationId, id);
  }

  @Roles('member')
  @Post(':id/comment')
  comment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(postIncidentCommentSchema)) dto: PostIncidentCommentInput,
  ) {
    return this.incidents.comment(user.organizationId, id, dto.message);
  }

  @Roles('member')
  @Post(':id/acknowledge')
  acknowledge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.incidents.acknowledge(user.organizationId, id, user.id);
  }

  @Roles('member')
  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.incidents.resolve(user.organizationId, id);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateIncidentSchema)) dto: UpdateIncidentInput,
  ) {
    return this.incidents.update(user.organizationId, id, dto);
  }
}
