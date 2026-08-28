import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

// Shared by JwtAuthGuard and RolesGuard so the two never drift on what
// "public" means.
export function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return Boolean(reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]));
}
