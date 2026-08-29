import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginRequest } from '@marketplace/shared';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/auth';
import { onUnauthorized } from '../api/client';

export const ME_QUERY_KEY = ['auth', 'me'];

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Everything viewer-scoped that isn't "who am I" — a moderator/admin's
// unfiltered catalog/listing/queue views included. Deliberately NOT
// queryClient.clear(): that also tears down this same provider's own
// ME_QUERY_KEY observer (mounted below, in the component calling this),
// orphaning it from the cache until a full reload — setQueryData right
// after would populate a cache entry the stale observer never resubscribes to.
function forgetViewerScopedData(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.removeQueries({ queryKey: ['catalog'] });
  queryClient.removeQueries({ queryKey: ['listing'] });
  queryClient.removeQueries({ queryKey: ['moderation'] });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // An anonymous visitor 401s here — react-query surfaces that as
  // data: undefined, not a thrown error, so "no user" falls out for free.
  const { data: user, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
  });

  useEffect(
    () =>
      onUnauthorized(() => {
        forgetViewerScopedData(queryClient);
        queryClient.setQueryData(ME_QUERY_KEY, null);
      }),
    [queryClient],
  );

  async function login(credentials: LoginRequest): Promise<AuthUser> {
    const loggedInUser = await loginRequest(credentials);
    // Clears out whatever an anonymous visit cached, so a moderator/admin
    // immediately sees the full unfiltered view rather than a stale
    // public-only one until staleTime happens to expire.
    forgetViewerScopedData(queryClient);
    queryClient.setQueryData(ME_QUERY_KEY, loggedInUser);
    return loggedInUser;
  }

  async function logout(): Promise<void> {
    await logoutRequest();
    // Without this, a moderator/admin's cached catalog view — which
    // includes PENDING/REJECTED rows nobody else can see — keeps
    // rendering after logout until something happens to refetch it.
    forgetViewerScopedData(queryClient);
    queryClient.setQueryData(ME_QUERY_KEY, null);
  }

  return <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
