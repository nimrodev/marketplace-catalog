import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthUser } from '@marketplace/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginRequestDto } from './dto/login-request.dto';
import { AuthenticatedUser } from './jwt-payload';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_MS } from './session.constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    // Re-fetch from the DB (rather than trusting the token's role claim)
    // so an account deactivated since login loses access on this call,
    // not just on its next login (MAR-12).
    return this.authService.getCurrentUser(user.id);
  }
}
