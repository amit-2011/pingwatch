import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { type CreateApiTokenInput, createApiTokenSchema } from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiTokenService } from './api-token.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('tokens')
export class ApiTokenController {
  constructor(private readonly tokens: ApiTokenService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tokens.list(user.organizationId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createApiTokenSchema)) dto: CreateApiTokenInput,
  ) {
    return this.tokens.create(user.organizationId, user.id, dto);
  }

  @Post(':id/rotate')
  rotate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tokens.rotate(user.organizationId, id);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.tokens.revoke(user.organizationId, id);
    return { ok: true };
  }
}
