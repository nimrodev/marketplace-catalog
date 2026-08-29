// crypto.randomUUID() only exists in a secure context (HTTPS or localhost).
// Production currently serves over plain HTTP (TLS is MAR-44, not yet
// built), where it's undefined entirely. This is only ever used as a
// local React list key, never sent anywhere, so a non-cryptographic
// fallback is exactly as good as a real UUID for this purpose.
export function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
