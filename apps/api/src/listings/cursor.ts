// Pure functions — no TypeORM, no Nest, testable in isolation, matching
// the convention in listing-state-machine.ts.
//
// updatedAt is carried as the exact string handed in, not a JS Date:
// Postgres timestamptz has microsecond precision but JS Date only has
// millisecond precision, so round-tripping through Date would silently
// truncate at a page boundary. Callers are responsible for passing the
// raw ISO string as read from the row (e.g. TypeORM's raw query result,
// not the Date-typed entity property) if microsecond precision matters.

// Plain Error subclass, not a NestJS BadRequestException — same choice
// as IllegalListingTransitionError in listing-state-machine.ts. This is
// a pure domain seam with no Nest dependency; the controller/pipe that
// consumes it (MAR-21, not yet built) is responsible for catching this
// and responding 400.
export class InvalidCursorError extends Error {}

export interface Cursor {
  updatedAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  let json: string;
  try {
    json = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new InvalidCursorError('Cursor is not valid base64url.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidCursorError('Cursor did not decode to valid JSON.');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).updatedAt !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string' ||
    (parsed as Record<string, unknown>).id === '' ||
    Object.keys(parsed as Record<string, unknown>).length !== 2
  ) {
    throw new InvalidCursorError('Cursor JSON did not have the expected shape.');
  }

  const { updatedAt, id } = parsed as Cursor;
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new InvalidCursorError('Cursor updatedAt is not a valid timestamp.');
  }

  return { updatedAt, id };
}
