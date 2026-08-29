import { IsString, MaxLength, MinLength } from 'class-validator';
import { MODERATION_LIMITS, RejectRequest } from '@marketplace/shared';

export class RejectRequestDto implements RejectRequest {
  @IsString()
  @MinLength(MODERATION_LIMITS.rejectionReason.min)
  @MaxLength(MODERATION_LIMITS.rejectionReason.max)
  reason!: string;
}
