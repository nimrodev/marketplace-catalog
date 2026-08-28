import type { AuthUser, LoginRequest } from '@marketplace/shared';
import { apiClient } from './client';

export function fetchCurrentUser(): Promise<AuthUser> {
  return apiClient.get<AuthUser>('/auth/me');
}

export function login(credentials: LoginRequest): Promise<AuthUser> {
  return apiClient.post<AuthUser>('/auth/login', credentials);
}

export function logout(): Promise<{ success: true }> {
  return apiClient.post<{ success: true }>('/auth/logout');
}
