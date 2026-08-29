import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DraftListingResponse, UserRole } from '@marketplace/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { Roles } from '../auth/roles.decorator';
import { UserThrottlerGuard } from '../uploads/user-throttler.guard';
import { DraftListingRequestDto } from './dto/draft-listing-request.dto';
import { DraftListingService } from './draft-listing.service';

@Controller('ai')
export class DraftListingController {
  constructor(private readonly draftListing: DraftListingService) {}

  // The only endpoint that costs money per call — throttled far tighter
  // than presign (20/min) to keep a runaway client from burning API spend.
  @Roles(UserRole.CONTRIBUTOR)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('draft-listing')
  @HttpCode(200)
  async generateDraft(
    @Body() dto: DraftListingRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DraftListingResponse> {
    return this.draftListing.draft(user.id, dto.photoKeys);
  }
}
