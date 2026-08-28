import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { LISTING_LIMITS } from '@marketplace/shared';
import { PresignRequestDto } from './presign-request.dto';

// Same config as bootstrap.ts's global pipe.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function bodyMetadata(): ArgumentMetadata {
  return { type: 'body', metatype: PresignRequestDto, data: '' };
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contentType: 'image/jpeg',
    contentLength: 1024,
    ...overrides,
  };
}

async function expectValid(payload: Record<string, unknown>): Promise<void> {
  await expect(pipe.transform(payload, bodyMetadata())).resolves.toBeDefined();
}

async function expectRejects(payload: Record<string, unknown>, field: string): Promise<void> {
  try {
    await pipe.transform(payload, bodyMetadata());
    throw new Error(`expected validation to reject payload for field "${field}", but it passed`);
  } catch (err) {
    const response = (err as { status?: number; response?: { statusCode: number; message: string[] } }).response;
    expect((err as { status: number }).status).toBe(400);
    expect(response?.statusCode).toBe(400);
    expect(response?.message.some((m) => m.toLowerCase().includes(field.toLowerCase()))).toBe(true);
  }
}

describe('PresignRequestDto', () => {
  describe('contentType (must be an allowed image MIME type)', () => {
    it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', async (contentType) => {
      await expectValid(validPayload({ contentType }));
    });

    it('rejects an unlisted content type', async () => {
      await expectRejects(validPayload({ contentType: 'application/pdf' }), 'contentType');
    });

    it('rejects a content type that merely starts with image/ (no wildcard)', async () => {
      await expectRejects(validPayload({ contentType: 'image/gif' }), 'contentType');
    });
  });

  describe(`contentLength (positive integer, <= ${LISTING_LIMITS.photos.maxBytes} bytes)`, () => {
    it('accepts a value within the cap', async () => {
      await expectValid(validPayload({ contentLength: LISTING_LIMITS.photos.maxBytes }));
    });

    it('rejects zero', async () => {
      await expectRejects(validPayload({ contentLength: 0 }), 'contentLength');
    });

    it('rejects a negative value', async () => {
      await expectRejects(validPayload({ contentLength: -1 }), 'contentLength');
    });

    it('rejects a non-integer value', async () => {
      await expectRejects(validPayload({ contentLength: 1024.5 }), 'contentLength');
    });

    it('rejects a value over the 5MB cap', async () => {
      await expectRejects(validPayload({ contentLength: LISTING_LIMITS.photos.maxBytes + 1 }), 'contentLength');
    });
  });

  it('strips and rejects unknown properties', async () => {
    await expectRejects(validPayload({ key: 'listings/attacker/x.jpg' }), 'key');
  });
});
