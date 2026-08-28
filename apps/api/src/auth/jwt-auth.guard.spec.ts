import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@marketplace/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AUTH_COOKIE_NAME } from './session.constants';

function buildContext(cookies: Record<string, string>): ExecutionContext {
  const req: { cookies: Record<string, string>; user?: unknown } = { cookies };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let jwt: jest.Mocked<JwtService>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() } as unknown as jest.Mocked<JwtService>;
    guard = new JwtAuthGuard(jwt);
  });

  it('401s with no cookie at all', async () => {
    const context = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('401s for a tampered/expired token instead of throwing the raw jwt error', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const context = buildContext({ [AUTH_COOKIE_NAME]: 'not-a-real-jwt' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches { id, role } from the verified payload to the request and allows access', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', role: UserRole.MODERATOR });
    const context = buildContext({ [AUTH_COOKIE_NAME]: 'a-real-jwt' });
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'user-1', role: UserRole.MODERATOR });
  });
});
