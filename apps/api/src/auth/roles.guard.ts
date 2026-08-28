import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { USER_ROLE_RANK, UserRole } from '@marketplace/shared';
import { isPublicRoute } from './is-public-route';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(this.reflector, context)) {
      return true;
    }

    const requiredRole = this.reflector.getAllAndOverride<UserRole | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRole) {
      // Protected but no minimum rank set — any authenticated role passes.
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: { role: UserRole } }>();
    // JwtAuthGuard runs first and always sets req.user or throws 401 itself;
    // this is a defensive fallback, not the normal unauthenticated path.
    if (!req.user) {
      throw new UnauthorizedException();
    }

    // Ranked, not parallel — @Roles(MODERATOR) admits an ADMIN automatically.
    if (USER_ROLE_RANK[req.user.role] < USER_ROLE_RANK[requiredRole]) {
      throw new ForbiddenException();
    }

    return true;
  }
}
