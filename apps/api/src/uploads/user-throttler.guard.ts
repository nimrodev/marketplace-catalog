import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

// Tracks by authenticated user id, not IP — the route this guards always
// runs after the global JwtAuthGuard, so req.user is already set. Falls
// back to IP only as a defensive floor; every real caller here is
// authenticated (MAR-23: presign requires a logged-in contributor).
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return req.user?.id ?? req.ip ?? 'unknown';
  }
}
