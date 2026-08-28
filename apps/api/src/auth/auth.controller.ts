import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser } from '@marketplace/shared';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { SESSION_MAX_AGE_MS } from './session.constants';

export const AUTH_COOKIE_NAME = 'auth_token';

interface JwtPayload {
  sub: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // secure:false locally (Compose/dev over plain HTTP) or the cookie
  // would silently never be sent by the browser; true in production,
  // where Caddy terminates TLS in front of the API (PLAN.md).
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginRequestDto, @Res({ passthrough: true }) res: Response): Promise<AuthUser> {
    const user = await this.authService.validateLogin(dto.email, dto.password);
    const token = this.authService.signToken(user);
    res.cookie(AUTH_COOKIE_NAME, token, { ...this.cookieOptions(), maxAge: SESSION_MAX_AGE_MS });
    return user;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response): { success: true } {
    res.clearCookie(AUTH_COOKIE_NAME, this.cookieOptions());
    return { success: true };
  }

  @Get('me')
  async me(@Req() req: Request): Promise<AuthUser> {
    const token: unknown = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException();
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      // Tampered/expired/malformed token — 401, never a 500.
      throw new UnauthorizedException();
    }

    return this.authService.getCurrentUser(payload.sub);
  }
}
