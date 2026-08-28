import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from './session.constants';
import { JwtPayload } from './jwt-payload';
import { isPublicRoute } from './is-public-route';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = isPublicRoute(this.reflector, context);
    const req = context.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token || typeof token !== 'string') {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // A public route still resolves a logged-in viewer when there's a
      // valid cookie (catalog/detail visibility depends on it) — but a
      // bad cookie there just means "treat as anonymous", not a 401.
      // A route that requires auth has no such fallback.
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    return true;
  }
}
