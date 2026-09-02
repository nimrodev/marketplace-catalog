import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ListingDetail, ModerationQueueItem, Page, RejectedListingItem, UserRole } from '@marketplace/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { Roles } from '../auth/roles.decorator';
import { InvalidCursorError } from '../listings/cursor';
import { RejectRequestDto } from './dto/reject-request.dto';
import { InvalidQueueCursorError } from './queue-cursor';
import { ModerationRepository } from './moderation.repository';
import { ModerationService } from './moderation.service';
import { parseQueueQuery } from './parse-queue-query';

function parseCursorAndLimit(rawQuery: Record<string, unknown>): { cursor?: string; limit?: number } {
  const result: { cursor?: string; limit?: number } = {};
  if (rawQuery.cursor !== undefined) result.cursor = String(rawQuery.cursor);
  if (rawQuery.limit !== undefined) result.limit = Number(rawQuery.limit);
  return result;
}

@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly queue: ModerationRepository,
  ) {}

  @Roles(UserRole.MODERATOR)
  @Get('queue')
  async findQueue(@Query() rawQuery: Record<string, unknown>): Promise<Page<ModerationQueueItem>> {
    const query = parseQueueQuery(rawQuery);
    try {
      return await this.queue.findQueue(query);
    } catch (err) {
      if (err instanceof InvalidQueueCursorError) {
        throw new BadRequestException('Invalid cursor');
      }
      throw err;
    }
  }

  @Roles(UserRole.MODERATOR)
  @Get('rejected')
  async findRejected(@Query() rawQuery: Record<string, unknown>): Promise<Page<RejectedListingItem>> {
    try {
      return await this.queue.findRejected(parseCursorAndLimit(rawQuery));
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        throw new BadRequestException('Invalid cursor');
      }
      throw err;
    }
  }

  @Roles(UserRole.MODERATOR)
  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ListingDetail> {
    return this.moderation.approve(user, id);
  }

  @Roles(UserRole.MODERATOR)
  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingDetail> {
    return this.moderation.reject(user, id, dto.reason);
  }
}
