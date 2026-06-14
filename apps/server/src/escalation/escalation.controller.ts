import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateEscalationPolicyInput,
  type UpdateEscalationPolicyInput,
  createEscalationPolicySchema,
  updateEscalationPolicySchema,
} from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EscalationAdminService } from './escalation-admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('escalation-policies')
export class EscalationController {
  constructor(private readonly policies: EscalationAdminService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.policies.list(user.organizationId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.policies.get(user.organizationId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEscalationPolicySchema)) dto: CreateEscalationPolicyInput,
  ) {
    return this.policies.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEscalationPolicySchema)) dto: UpdateEscalationPolicyInput,
  ) {
    return this.policies.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.policies.remove(user.organizationId, id);
    return { ok: true };
  }
}
