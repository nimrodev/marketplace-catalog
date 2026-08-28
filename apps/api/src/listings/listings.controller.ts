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
import { Public } from '../auth/public.decorator';
import { InvalidCursorError } from './cursor';
import { ListingsRepository } from './listings.repository';
import { parseCatalogQuery } from './parse-catalog-query';

// Every viewer is anonymous for now — the repository already supports
// contributor/moderator viewers, but wiring a real viewer in from
// req.user is a later issue's job, not this one's (MAR-14 only opts
// these routes out of the global auth guard; it doesn't change what
// they see).
const ANONYMOUS = { role: null } as const;

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsRepository) {}

  @Public()
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

  @Public()
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ListingDetail> {
    const listing = await this.listings.findDetail(id, ANONYMOUS);
    if (!listing) {
      throw new NotFoundException();
    }
    return listing;
  }
}
