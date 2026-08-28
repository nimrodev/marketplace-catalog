import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ListingDetail, ListingSummary, Page, UserRole } from '@marketplace/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { InvalidCursorError } from './cursor';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
import { UpdateListingRequestDto } from './dto/update-listing-request.dto';
import { ListingsRepository } from './listings.repository';
import { ListingsService } from './listings.service';
import { parseCatalogQuery } from './parse-catalog-query';

// Every viewer is anonymous for now — the repository already supports
// contributor/moderator viewers, but wiring a real viewer in from
// req.user is a later issue's job, not this one's (MAR-14 only opts
// these routes out of the global auth guard; it doesn't change what
// they see).
const ANONYMOUS = { role: null } as const;

@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsRepository,
    private readonly listingsService: ListingsService,
  ) {}

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

  // CONTRIBUTOR is the lowest rank, so moderators can create too.
  @Roles(UserRole.CONTRIBUTOR)
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateListingRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<ListingDetail> {
    return this.listingsService.create(user.id, dto);
  }

  // CONTRIBUTOR is the lowest rank; the service enforces ownership for
  // contributors and lets moderators/admins edit anything.
  @Roles(UserRole.CONTRIBUTOR)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingDetail> {
    return this.listingsService.update(user, id, dto);
  }
}
