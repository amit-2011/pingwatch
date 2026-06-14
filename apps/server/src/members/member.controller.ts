import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type AddMemberInput,
  type UpdateMemberRoleInput,
  addMemberSchema,
  updateMemberRoleSchema,
} from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MemberService } from './member.service';

/** Member management for the current org (P2.2). Reads = any member; writes = admin only. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('members')
export class MemberController {
  constructor(private readonly members: MemberService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.members.list(user.organizationId, user.id);
  }

  @Roles('admin')
  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberInput,
  ) {
    return this.members.add(user.organizationId, dto);
  }

  @Roles('admin')
  @Patch(':userId')
  async setRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) dto: UpdateMemberRoleInput,
  ) {
    await this.members.setRole(user.organizationId, userId, dto.role);
    return { ok: true };
  }

  @Roles('admin')
  @Delete(':userId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('userId') userId: string) {
    await this.members.remove(user.organizationId, userId);
    return { ok: true };
  }
}
