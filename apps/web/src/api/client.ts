import type { ApiErrorResponse } from '@marketplace/shared';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

// AuthContext subscribes here so any 401, anywhere in the app, collapses
// to one place: auth state goes to "logged out" without each call site
// having to know it's responsible for that.
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  // A 401 from the login endpoint means "wrong credentials", not "session
  // expired" — LoginPage handles that itself, so it must not fire here too.
  if (res.status === 401 && path !== '/auth/login') {
    unauthorizedListeners.forEach((listener) => listener());
  }
  if (!res.ok) {
    const body = await res.text();
    // Every JSON error body is our own ApiErrorResponse envelope, but a
    // proxy or an unhandled 5xx can still hand back plain text — fall
    // back to the raw body rather than throwing out of an error path.
    try {
      const parsed = JSON.parse(body) as ApiErrorResponse;
      throw new ApiError(res.status, parsed.message, parsed.fieldErrors);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(res.status, body);
    }
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
