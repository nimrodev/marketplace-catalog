import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@marketplace/shared';
import { User } from '../users/user.entity';
import { UsersRepository } from '../users/users.repository';
import { AuthService } from './auth.service';

// jest.spyOn can't redefine bcrypt's non-configurable namespace export;
// jest.mock swaps in a plain object wrapping the real compare instead.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof bcrypt>('bcrypt');
  return { ...actual, compare: jest.fn(actual.compare) };
});

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'contributor@example.com',
    passwordHash: 'real-hash',
    role: UserRole.CONTRIBUTOR,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let usersRepo: jest.Mocked<UsersRepository>;
  let jwt: jest.Mocked<JwtService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    jwt = { sign: jest.fn() } as unknown as jest.Mocked<JwtService>;
    service = new AuthService(usersRepo, jwt);
  });

  afterEach(() => {
    (bcrypt.compare as jest.Mock).mockClear();
  });

  describe('timing/message uniformity (MAR-12 acceptance criterion)', () => {
    it('still calls bcrypt.compare when the email does not exist (no early-exit shortcut)', async () => {
      usersRepo.findByEmail.mockResolvedValue(null);

      await expect(service.validateLogin('nobody@example.com', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );

      // Proves the unknown-email path executes the same bcrypt comparison
      // as the wrong-password path below — same code, same cost, either way.
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(bcrypt.compare).toHaveBeenCalledWith('whatever', expect.any(String));
    });

    it('unknown-email and wrong-password rejections carry the identical message', async () => {
      usersRepo.findByEmail.mockResolvedValueOnce(null);
      const unknownEmailError = await service
        .validateLogin('nobody@example.com', 'whatever')
        .catch((err: unknown) => err);

      usersRepo.findByEmail.mockResolvedValueOnce(buildUser());
      const wrongPasswordError = await service
        .validateLogin('contributor@example.com', 'wrong-password')
        .catch((err: unknown) => err);

      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect((unknownEmailError as UnauthorizedException).message).toBe(
        (wrongPasswordError as UnauthorizedException).message,
      );
    });
  });

  it('rejects a deactivated account even with the correct password', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    usersRepo.findByEmail.mockResolvedValue(buildUser({ passwordHash: hash, isActive: false }));

    await expect(service.validateLogin('contributor@example.com', 'correct-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('resolves the AuthUser shape (id, email, role only) for a correct, active login', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const user = buildUser({ passwordHash: hash });
    usersRepo.findByEmail.mockResolvedValue(user);

    const result = await service.validateLogin('contributor@example.com', 'correct-password');

    expect(result).toEqual({ id: user.id, email: user.email, role: user.role });
    expect(Object.keys(result).sort()).toEqual(['email', 'id', 'role']);
  });

  describe('getCurrentUser', () => {
    it('returns the AuthUser for an active user', async () => {
      const user = buildUser();
      usersRepo.findById.mockResolvedValue(user);

      const result = await service.getCurrentUser(user.id);

      expect(result).toEqual({ id: user.id, email: user.email, role: user.role });
    });

    it('throws for a user deactivated since login (fresh DB fetch, not a stale JWT claim)', async () => {
      usersRepo.findById.mockResolvedValue(buildUser({ isActive: false }));

      await expect(service.getCurrentUser('user-1')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the user no longer exists', async () => {
      usersRepo.findById.mockResolvedValue(null);

      await expect(service.getCurrentUser('user-1')).rejects.toThrow(UnauthorizedException);
    });
  });
});
