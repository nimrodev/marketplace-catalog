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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // An anonymous visitor 401s here — react-query surfaces that as
  // data: undefined, not a thrown error, so "no user" falls out for free.
  const { data: user, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchCurrentUser,
    retry: false,
  });

  useEffect(() => onUnauthorized(() => queryClient.setQueryData(ME_QUERY_KEY, null)), [queryClient]);

  async function login(credentials: LoginRequest): Promise<AuthUser> {
    const loggedInUser = await loginRequest(credentials);
    queryClient.setQueryData(ME_QUERY_KEY, loggedInUser);
    return loggedInUser;
  }

  async function logout(): Promise<void> {
    await logoutRequest();
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
