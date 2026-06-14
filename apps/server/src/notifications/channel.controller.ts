import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { type CreateChannelInput, createChannelSchema } from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChannelService } from './channel.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('channels')
export class ChannelController {
  constructor(private readonly channels: ChannelService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createChannelSchema)) dto: CreateChannelInput,
  ) {
    return this.channels.create(user.organizationId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.channels.list(user.organizationId);
  }

  @Post(':id/test')
  test(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.channels.test(user.organizationId, id);
  }
}
