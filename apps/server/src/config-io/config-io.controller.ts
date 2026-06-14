import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { type ImportConfigInput, type ImportReport, importConfigSchema } from '@pingwatch/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DomainException } from '../common/domain.exception';
import { MonitorEngineService } from '../engine/monitor-engine.service';
import { ConfigExportService } from './config-export.service';
import { ConfigImportService } from './config-import.service';
import { fromYaml, toYaml } from './config-yaml';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('config')
export class ConfigIoController {
  constructor(
    private readonly exporter: ConfigExportService,
    private readonly importer: ConfigImportService,
    private readonly engine: MonitorEngineService,
  ) {}

  /** Download the org's full config as YAML (channel secrets redacted). */
  @Get('export')
  @Header('content-type', 'application/yaml; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="pingwatch-config.yaml"')
  async export(@CurrentUser() user: AuthenticatedUser): Promise<string> {
    return toYaml(await this.exporter.export(user.organizationId));
  }

  /** Apply a YAML bundle (idempotent). `dryRun` computes the report without writing. */
  @Post('import')
  async import(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(importConfigSchema)) dto: ImportConfigInput,
  ): Promise<ImportReport> {
    let bundle;
    try {
      bundle = fromYaml(dto.yaml);
    } catch (err) {
      throw new DomainException(
        'VALIDATION_ERROR',
        `Invalid config YAML: ${err instanceof Error ? err.message : 'parse error'}`,
        400,
      );
    }
    const { report, monitorIds } = await this.importer.import(user.organizationId, bundle, dto.dryRun);
    if (!dto.dryRun) {
      for (const id of monitorIds) await this.engine.restart(id);
    }
    return report;
  }
}
