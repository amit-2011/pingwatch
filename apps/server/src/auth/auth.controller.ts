import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { type LoginInput, loginSchema } from '@pingwatch/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AuthenticatedUser } from './authenticated-user';
import { AuthService } from './auth.service';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto, { userAgent: req.headers['user-agent'], ip: req.ip });
    setRefreshCookie(req, res, session.refresh.raw, session.refresh.expiresAt);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refreshSession(readRefreshCookie(req), {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setRefreshCookie(req, res, result.refresh.raw, result.refresh.expiresAt);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
