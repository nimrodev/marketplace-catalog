import { randomUUID } from 'node:crypto';
import { PhotoContentType } from '@marketplace/shared';

const EXTENSION_BY_CONTENT_TYPE: Record<PhotoContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Server-generated, never client-supplied — the userId segment is what
// makes the MAR-17 ownership check enforceable (a contributor can only
// ever be handed a key under their own prefix).
export function buildPhotoKey(userId: string, contentType: PhotoContentType): string {
  return `listings/${userId}/${randomUUID()}.${EXTENSION_BY_CONTENT_TYPE[contentType]}`;
}
