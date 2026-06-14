import { Controller, Get } from '@nestjs/common';

/** Liveness endpoint. With the global `api` prefix this is `GET /api/health` (PLAN §6.9). */
@Controller()
export class HealthController {
  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'pingwatch' };
  }
}
