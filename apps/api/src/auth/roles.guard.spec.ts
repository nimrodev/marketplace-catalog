import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@marketplace/shared';
import { RolesGuard } from './roles.guard';

function buildContext(user: { id: string; role: UserRole } | undefined): ExecutionContext {
  const req = { user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('allows a public route through without checking req.user', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true); // isPublic
    const context = buildContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an authenticated user through when no @Roles minimum is set', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined); // isPublic, requiredRole
    const context = buildContext({ id: 'user-1', role: UserRole.CONTRIBUTOR });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('401s (not 403) if somehow reached with no req.user — JwtAuthGuard should have run first', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(UserRole.MODERATOR);
    const context = buildContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('403s an authenticated contributor on a @Roles(MODERATOR) route (under-privileged, not unauthenticated)', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(UserRole.MODERATOR);
    const context = buildContext({ id: 'user-1', role: UserRole.CONTRIBUTOR });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('passes a moderator on a @Roles(MODERATOR) route', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(UserRole.MODERATOR);
    const context = buildContext({ id: 'user-1', role: UserRole.MODERATOR });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes an admin on a @Roles(MODERATOR) route without the route naming ADMIN (rank comparison)', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(UserRole.MODERATOR);
    const context = buildContext({ id: 'user-1', role: UserRole.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('403s a moderator on a @Roles(ADMIN) route', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(UserRole.ADMIN);
    const context = buildContext({ id: 'user-1', role: UserRole.MODERATOR });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('passes an admin on a @Roles(ADMIN) route', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(UserRole.ADMIN);
    const context = buildContext({ id: 'user-1', role: UserRole.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });
});
