import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser } from '@marketplace/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginRequestDto } from './dto/login-request.dto';
import { AuthenticatedUser } from './jwt-payload';
import { Public } from './public.decorator';
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_MS } from './session.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Driven by the actual connection (req.secure — trust-proxy-aware, see
  // bootstrap.ts), not NODE_ENV: a NODE_ENV=production request that's
  // still plain HTTP (Caddy TLS is MAR-44, not yet built) must still get
  // secure:false, or the browser silently refuses to store the cookie at
  // all and every authenticated request 401s despite a "successful" login.
  private cookieOptions(req: Request): CookieOptions {
    return {
      httpOnly: true,
      secure: req.secure,
      sameSite: 'lax',
      path: '/',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const user = await this.authService.validateLogin(dto.email, dto.password);
    const token = this.authService.signToken(user);
    res.cookie(AUTH_COOKIE_NAME, token, { ...this.cookieOptions(req), maxAge: SESSION_MAX_AGE_MS });
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): { success: true } {
    res.clearCookie(AUTH_COOKIE_NAME, this.cookieOptions(req));
    return { success: true };
  }

  // No @Public() — protected by the global JwtAuthGuard by default (MAR-14).
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    // Re-fetch from the DB (rather than trusting the token's role claim)
    // so an account deactivated since login loses access on this call,
    // not just on its next login (MAR-12).
    return this.authService.getCurrentUser(user.id);
  }
}
