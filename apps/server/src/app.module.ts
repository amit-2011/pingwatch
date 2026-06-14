import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

/**
 * Root Nest module. T6+ register auth, engine, notifications, realtime here. For T5 it just wires
 * the health controller so `/api/*` is provably live alongside the embedded Next.js dashboard.
 */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
