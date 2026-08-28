import { buildPhotoKey } from './upload-key';

describe('buildPhotoKey', () => {
  it('places the key under listings/{userId}/ — the segment MAR-17 checks for ownership', () => {
    const key = buildPhotoKey('user-123', 'image/jpeg');
    expect(key).toMatch(/^listings\/user-123\/[0-9a-f-]+\.jpg$/);
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ] as const)('maps %s to a .%s extension', (contentType, ext) => {
    const key = buildPhotoKey('user-1', contentType);
    expect(key.endsWith(`.${ext}`)).toBe(true);
  });

  it('never reuses a key across calls', () => {
    const a = buildPhotoKey('user-1', 'image/png');
    const b = buildPhotoKey('user-1', 'image/png');
    expect(a).not.toBe(b);
  });
});
