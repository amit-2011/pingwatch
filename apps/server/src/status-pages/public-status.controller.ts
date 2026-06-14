import { Controller, Get, Param } from '@nestjs/common';
import { DomainException } from '../common/domain.exception';
import { StatusPageService } from './status-page.service';

/**
 * Anonymous public status page (P3.4). No auth guard — served to the open internet. The projection
 * is curated by {@link StatusPageService.publicProjection}; it never leaks internal ids or config.
 */
@Controller('public/status')
export class PublicStatusController {
  constructor(private readonly pages: StatusPageService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const page = await this.pages.publicProjection(slug);
    if (!page) throw new DomainException('NOT_FOUND', 'Status page not found', 404);
    return page;
  }
}
