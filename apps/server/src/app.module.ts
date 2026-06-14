import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { ResolvedConfig } from './config/schema';
import { HealthController } from './health/health.controller';
import { SystemController } from './health/system.controller';
import { APP_SECRET, PINGWATCH_CONFIG, PRISMA_CLIENT } from './common/di-tokens';
import { PasswordService } from './crypto/password.service';
import { SecretBoxService } from './crypto/secret-box.service';
import { TokenService } from './crypto/token.service';
import { AuthJwtService } from './auth/jwt.service';
import { RefreshTokenService } from './auth/refresh-token.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { SetupController } from './auth/setup.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { SetupGuard } from './auth/setup.guard';
import { MonitorTypeRegistry } from './engine/monitor-type.registry';
import { CheckRunnerService } from './engine/check-runner.service';
import { SchedulerService } from './engine/scheduler.service';
import { HeartbeatWriterService } from './engine/heartbeat-writer.service';
import { MetricsWriterService } from './engine/metrics-writer.service';
import { RollupService } from './engine/rollup.service';
import { MonitorEngineService } from './engine/monitor-engine.service';
import { NotificationProviderRegistry } from './notifications/notification-provider.registry';
import { IncidentService } from './notifications/incident.service';
import { DispatchService } from './notifications/dispatch.service';
import { IncidentListener } from './notifications/incident.listener';
import { RepeatNotifyService } from './notifications/repeat-notify.service';
import { ChannelService } from './notifications/channel.service';
import { ChannelController } from './notifications/channel.controller';
import { MonitorService } from './monitors/monitor.service';
import { MonitorController } from './monitors/monitor.controller';
import { RealtimeService } from './realtime/realtime.service';
import { OrgController } from './orgs/org.controller';
import { MemberService } from './members/member.service';
import { MemberController } from './members/member.controller';

export interface AppModuleDeps {
  secret: string;
  db: PingWatchPrismaClient;
  config: ResolvedConfig;
}

/**
 * Root module, built at bootstrap so runtime values (the resolved APP_SECRET, the DB client, the
 * config) can be injected as providers. T7+ add auth/engine/notification controllers + guards here.
 */
@Module({})
export class AppModule {
  static register(deps: AppModuleDeps): DynamicModule {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      module: AppModule,
      imports: [
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        LoggerModule.forRoot({
          pinoHttp: {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
            ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
          },
        }),
      ],
      controllers: [
        HealthController,
        SystemController,
        SetupController,
        AuthController,
        ChannelController,
        MonitorController,
        OrgController,
        MemberController,
      ],
      providers: [
        { provide: APP_SECRET, useValue: deps.secret },
        { provide: PRISMA_CLIENT, useValue: deps.db },
        { provide: PINGWATCH_CONFIG, useValue: deps.config },
        PasswordService,
        SecretBoxService,
        TokenService,
        AuthJwtService,
        RefreshTokenService,
        AuthService,
        JwtAuthGuard,
        RolesGuard,
        MonitorTypeRegistry,
        CheckRunnerService,
        SchedulerService,
        HeartbeatWriterService,
        MetricsWriterService,
        RollupService,
        MonitorEngineService,
        NotificationProviderRegistry,
        IncidentService,
        DispatchService,
        IncidentListener,
        RepeatNotifyService,
        ChannelService,
        MonitorService,
        RealtimeService,
        MemberService,
        // Global first-run gate: 409 SETUP_REQUIRED until setup completes.
        { provide: APP_GUARD, useClass: SetupGuard },
      ],
      exports: [
        APP_SECRET,
        PRISMA_CLIENT,
        PINGWATCH_CONFIG,
        PasswordService,
        SecretBoxService,
        TokenService,
        AuthJwtService,
        RefreshTokenService,
        MonitorTypeRegistry,
        CheckRunnerService,
        SchedulerService,
        RollupService,
        MonitorEngineService,
      ],
    };
  }
}
