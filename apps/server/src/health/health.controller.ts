import { Controller, Get } from '@nestjs/common';
import { AllowDuringSetup } from '../auth/setup.guard';

/** Liveness endpoint. With the global `api` prefix this is `GET /api/health` (PLAN §6.9). */
@Controller()
export class HealthController {
  @AllowDuringSetup()
  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'pingwatch' };
  }
}
