import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import type { ResolvedConfig } from './config/schema';
import { HealthController } from './health/health.controller';
import { APP_SECRET, PINGWATCH_CONFIG, PRISMA_CLIENT } from './common/di-tokens';
import { PasswordService } from './crypto/password.service';
import { SecretBoxService } from './crypto/secret-box.service';
import { TokenService } from './crypto/token.service';
import { AuthJwtService } from './auth/jwt.service';
import { RefreshTokenService } from './auth/refresh-token.service';

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
        LoggerModule.forRoot({
          pinoHttp: {
            level: process.env.LOG_LEVEL ?? 'info',
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
            ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
          },
        }),
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_SECRET, useValue: deps.secret },
        { provide: PRISMA_CLIENT, useValue: deps.db },
        { provide: PINGWATCH_CONFIG, useValue: deps.config },
        PasswordService,
        SecretBoxService,
        TokenService,
        AuthJwtService,
        RefreshTokenService,
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
      ],
    };
  }
}
