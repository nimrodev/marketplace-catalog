import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from './jwt-payload';

// Only valid behind JwtAuthGuard, which is what actually populates req.user.
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user!;
});

// For @Public() routes: JwtAuthGuard resolves a viewer from the cookie
// when one is present, but never requires it — so this can be undefined.
export const OptionalCurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user;
});
