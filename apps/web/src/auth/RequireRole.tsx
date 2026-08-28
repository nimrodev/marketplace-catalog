import type { ReactNode } from 'react';
import { USER_ROLE_RANK, type UserRole } from '@marketplace/shared';
import NotAuthorizedPage from '../pages/NotAuthorizedPage';
import { useAuth } from './AuthContext';

export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user } = useAuth();
  // Always nested inside RequireAuth, which already redirected an
  // anonymous visitor — a null user here means the role check failed,
  // not that no one is logged in.
  if (!user || USER_ROLE_RANK[user.role] < USER_ROLE_RANK[role]) {
    return <NotAuthorizedPage />;
  }
  return <>{children}</>;
}
