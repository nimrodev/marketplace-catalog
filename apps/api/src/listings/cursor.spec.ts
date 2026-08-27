import { Cursor, InvalidCursorError, decodeCursor, encodeCursor } from './cursor';

// encodeCursor can't produce these shapes — its Cursor type forbids them —
// so malformed/tampered payloads are built directly here instead.
function rawCursor(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

describe('cursor encode/decode', () => {
  it('round-trips a cursor losslessly', () => {
    const cursor: Cursor = { createdAt: '2024-03-14T09:26:53.589793Z', id: 'a1b2c3d4-0000-0000-0000-000000000001' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('preserves microsecond precision on the timestamp', () => {
    // Postgres timestamptz precision; a JS Date round-trip would truncate
    // this to '...589000Z' or '...590000Z' via millisecond rounding.
    const cursor: Cursor = { createdAt: '2024-03-14T09:26:53.123456Z', id: 'a1b2c3d4-0000-0000-0000-000000000002' };
    const decoded = decodeCursor(encodeCursor(cursor));
    expect(decoded.createdAt).toBe('2024-03-14T09:26:53.123456Z');
  });

  it('produces a URL-safe token (base64url, no padding/plus/slash)', () => {
    const token = encodeCursor({ createdAt: '2024-03-14T09:26:53.123456Z', id: 'a1b2c3d4-0000-0000-0000-000000000003' });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a cursor that is not valid base64url', () => {
    expect(() => decodeCursor('not base64url!! @#$')).toThrow(InvalidCursorError);
  });

  it('rejects a truncated cursor (decodes to incomplete JSON)', () => {
    const token = encodeCursor({ createdAt: '2024-03-14T09:26:53.123456Z', id: 'a1b2c3d4-0000-0000-0000-000000000004' });
    expect(() => decodeCursor(token.slice(0, token.length - 5))).toThrow(InvalidCursorError);
  });

  it('rejects a tampered cursor (valid base64url/JSON, wrong shape)', () => {
    expect(() => decodeCursor(rawCursor({ createdAt: '2024-03-14T09:26:53.123456Z' }))).toThrow(InvalidCursorError);
  });

  it('rejects a cursor whose createdAt is not a valid timestamp', () => {
    expect(() => decodeCursor(rawCursor({ createdAt: 'not-a-date', id: 'x' }))).toThrow(InvalidCursorError);
  });

  it('rejects an empty string', () => {
    expect(() => decodeCursor('')).toThrow(InvalidCursorError);
  });

  it('rejects extra fields (tampered payload)', () => {
    expect(() =>
      decodeCursor(rawCursor({ createdAt: '2024-03-14T09:26:53.123456Z', id: 'x', role: 'ADMIN' })),
    ).toThrow(InvalidCursorError);
  });

  it('property: decode(encode(x)) === x across generated inputs', () => {
    for (let i = 0; i < 200; i++) {
      const cursor: Cursor = {
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 1e12)).toISOString().replace(
          /\.\d+Z$/,
          `.${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}Z`,
        ),
        id: `${Math.floor(Math.random() * 1e9)}-${Math.floor(Math.random() * 1e9)}`,
      };
      expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    }
  });
});
