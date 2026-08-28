import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ListingDetail, ListingSummary, Page } from '@marketplace/shared';
import { InvalidCursorError } from './cursor';
import { ListingsRepository } from './listings.repository';
import { parseCatalogQuery } from './parse-catalog-query';

// No auth yet (MAR-16) — every viewer is anonymous until then. The
// repository already supports contributor/moderator viewers; wiring a
// real viewer in from req.user is that later issue's job, not this one's.
const ANONYMOUS = { role: null } as const;

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsRepository) {}

  @Get()
  async findAll(@Query() rawQuery: Record<string, unknown>): Promise<Page<ListingSummary>> {
    const query = parseCatalogQuery(rawQuery);
    try {
      return await this.listings.findCatalogPage(query, ANONYMOUS);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        throw new BadRequestException('Invalid cursor');
      }
      throw err;
    }
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ListingDetail> {
    const listing = await this.listings.findDetail(id, ANONYMOUS);
    if (!listing) {
      throw new NotFoundException();
    }
    return listing;
  }
}
