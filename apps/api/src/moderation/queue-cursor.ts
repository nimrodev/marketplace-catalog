// Same base64url(JSON) mechanism as listings/cursor.ts, extended with the
// risk rank the queue sorts by first — a plain (createdAt, id) cursor
// can't page correctly across a two-column sort. Kept separate from that
// file rather than widened in place, since the catalog cursor's shape is
// already relied on elsewhere and this queue is the only caller that
// needs the extra field.
export class InvalidQueueCursorError extends Error {}

export interface QueueCursor {
  riskRank: number;
  createdAt: string;
  id: string;
}

export function encodeQueueCursor(cursor: QueueCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeQueueCursor(raw: string): QueueCursor {
  let json: string;
  try {
    json = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw new InvalidQueueCursorError('Cursor is not valid base64url.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidQueueCursorError('Cursor did not decode to valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidQueueCursorError('Cursor JSON did not have the expected shape.');
  }
  const { riskRank, createdAt, id } = parsed as Record<string, unknown>;
  if (
    typeof riskRank !== 'number' ||
    !Number.isInteger(riskRank) ||
    riskRank < 0 ||
    riskRank > 3 ||
    typeof createdAt !== 'string' ||
    Number.isNaN(Date.parse(createdAt)) ||
    typeof id !== 'string' ||
    id === ''
  ) {
    throw new InvalidQueueCursorError('Cursor JSON did not have the expected shape.');
  }

  return { riskRank, createdAt, id };
}
