// Single source for the session lifetime — the JWT's own expiry and the
// cookie's maxAge must agree, or one outlives the other.
export const SESSION_HOURS = 24;
export const SESSION_EXPIRES_IN = `${SESSION_HOURS}h`;
export const SESSION_MAX_AGE_MS = SESSION_HOURS * 60 * 60 * 1000;

export const AUTH_COOKIE_NAME = 'auth_token';
