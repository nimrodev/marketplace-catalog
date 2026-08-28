import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthUser } from '@marketplace/shared';
import { User } from '../users/user.entity';
import { UsersRepository } from '../users/users.repository';

const INVALID_CREDENTIALS = 'Invalid email or password';

// Precomputed once at process start so an unknown-email login still pays
// the same bcrypt.compare cost as a real one (MAR-12 timing-uniformity
// requirement) — comparing against this instead of skipping the call
// entirely is what keeps the code path identical either way.
const DUMMY_HASH = bcrypt.hashSync('no-such-user-placeholder', 10);

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
  ) {}

  async validateLogin(email: string, password: string): Promise<AuthUser> {
    const user = await this.users.findByEmail(email);
    // bcrypt.compare always runs, real hash or dummy — same code path,
    // same cost, whether or not the email exists (MAR-12 acceptance
    // criterion: unknown-email and wrong-password must be indistinguishable).
    const isValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !isValid || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return toAuthUser(user);
  }

  // `role` rides along so guards can authorize without a DB hit on every
  // request (MAR-13) — the cost is a role change only takes effect once
  // the token expires. getCurrentUser still re-fetches for /auth/me itself.
  signToken(user: AuthUser): string {
    return this.jwt.sign({ sub: user.id, role: user.role });
  }

  // Fresh DB fetch rather than trusting the JWT payload — an account
  // deactivated after login must lose access on its next /auth/me call,
  // not just on its next login (MAR-12).
  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return toAuthUser(user);
  }
}
