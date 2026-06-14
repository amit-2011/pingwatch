import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { type AgentMetricsInput, agentMetricsSchema } from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AgentGuard, type AgentRequest } from './agent.guard';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /** Remote agent pushes a metrics sample (authed by its agent token). */
  @UseGuards(AgentGuard)
  @Post('metrics')
  async metrics(
    @Req() req: AgentRequest,
    @Body(new ZodValidationPipe(agentMetricsSchema)) dto: AgentMetricsInput,
  ) {
    await this.agent.recordSample(req.agentMonitorId ?? '', dto);
    return { ok: true };
  }

  /** Admin mints an agent token for a system monitor (raw token returned once). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('token/:monitorId')
  createToken(@CurrentUser() user: AuthenticatedUser, @Param('monitorId') monitorId: string) {
    return this.agent.createToken(user.organizationId, monitorId);
  }
}
