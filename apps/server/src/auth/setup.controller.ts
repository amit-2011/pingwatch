import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type SetupInput, setupSchema } from '@pingwatch/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { setRefreshCookie } from './cookies';
import { AllowDuringSetup } from './setup.guard';

@Controller('setup')
export class SetupController {
  constructor(private readonly auth: AuthService) {}

  @AllowDuringSetup()
  @Get('state')
  state(): Promise<{ completed: boolean }> {
    return this.auth.getSetupState();
  }

  @AllowDuringSetup()
  @Post()
  async setup(
    @Body(new ZodValidationPipe(setupSchema)) dto: SetupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.setup(dto, { userAgent: req.headers['user-agent'], ip: req.ip });
    setRefreshCookie(req, res, session.refresh.raw, session.refresh.expiresAt);
    return { user: session.user, accessToken: session.accessToken };
  }
}
