import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PresignResponse, UserRole } from '@marketplace/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { Roles } from '../auth/roles.decorator';
import { PresignRequestDto } from './dto/presign-request.dto';
import { UploadsService } from './uploads.service';
import { UserThrottlerGuard } from './user-throttler.guard';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // CONTRIBUTOR is the lowest rank, so this is really "any authenticated
  // user" — named explicitly to match the route table in PLAN.md §4.
  @Roles(UserRole.CONTRIBUTOR)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('presign')
  @HttpCode(200)
  async presign(@Body() dto: PresignRequestDto, @CurrentUser() user: AuthenticatedUser): Promise<PresignResponse> {
    return this.uploads.createPresignedUpload(user.id, dto);
  }
}
