import { AuthenticatedUser } from './jwt-payload';

// Populated by JwtAuthGuard from the verified token's own claims — not a
// fresh DB read, per the role-as-claim tradeoff (MAR-13): cheap on every
// guarded request, at the cost of a role/deactivation change taking up to
// 24h (token expiry) to take effect. Endpoints needing the live DB state
// (e.g. /auth/me) fetch it themselves instead of trusting this.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
