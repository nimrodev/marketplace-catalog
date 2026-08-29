import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ListingDetail, UserRole } from '@marketplace/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { Roles } from '../auth/roles.decorator';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ModerationService } from './moderation.service';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

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
