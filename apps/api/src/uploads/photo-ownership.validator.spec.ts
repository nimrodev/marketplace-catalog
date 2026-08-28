import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { LISTING_LIMITS } from '@marketplace/shared';
import { PhotoOwnershipValidator } from './photo-ownership.validator';
import { buildPhotoKey } from './upload-key';

function buildConfig(): ConfigService {
  const values: Record<string, string> = {
    AWS_REGION: 'eu-central-1',
    S3_PHOTOS_BUCKET: 'marketplace-catalog-photos',
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('PhotoOwnershipValidator', () => {
  let sendSpy: jest.SpyInstance;
  let validator: PhotoOwnershipValidator;
  const userId = 'user-1';

  beforeEach(() => {
    sendSpy = jest.spyOn(S3Client.prototype, 'send');
    validator = new PhotoOwnershipValidator(buildConfig());
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('rejects a key belonging to another user, without ever calling S3', async () => {
    const key = buildPhotoKey('someone-else', 'image/jpeg');

    await expect(validator.validate(userId, [key])).rejects.toBeInstanceOf(BadRequestException);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed key, without calling S3', async () => {
    await expect(validator.validate(userId, [`listings/${userId}/not-a-uuid.jpg`])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects a well-formed key that does not exist in S3', async () => {
    const key = buildPhotoKey(userId, 'image/jpeg');
    sendSpy.mockRejectedValue(new Error('NotFound'));

    await expect(validator.validate(userId, [key])).rejects.toThrow(/was not found/i);
  });

  it('rejects an oversized object', async () => {
    const key = buildPhotoKey(userId, 'image/jpeg');
    sendSpy.mockResolvedValue({ ContentLength: LISTING_LIMITS.photos.maxBytes + 1, ContentType: 'image/jpeg' });

    await expect(validator.validate(userId, [key])).rejects.toThrow(/exceeds/i);
  });

  it('rejects an object with a disallowed content type', async () => {
    const key = buildPhotoKey(userId, 'image/jpeg');
    sendSpy.mockResolvedValue({ ContentLength: 1024, ContentType: 'application/pdf' });

    await expect(validator.validate(userId, [key])).rejects.toThrow(/unsupported content type/i);
  });

  it('resolves for a well-formed, existing, correctly-sized and typed key', async () => {
    const key = buildPhotoKey(userId, 'image/png');
    sendSpy.mockResolvedValue({ ContentLength: 2048, ContentType: 'image/png' });

    await expect(validator.validate(userId, [key])).resolves.toBeUndefined();
  });

  it('rejects the whole submission if any one of several keys fails', async () => {
    const good = buildPhotoKey(userId, 'image/jpeg');
    const bad = buildPhotoKey('someone-else', 'image/jpeg');

    await expect(validator.validate(userId, [good, bad])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves when every key in a multi-photo submission is valid', async () => {
    const keys = [buildPhotoKey(userId, 'image/jpeg'), buildPhotoKey(userId, 'image/png')];
    sendSpy.mockResolvedValue({ ContentLength: 2048, ContentType: 'image/jpeg' });

    await expect(validator.validate(userId, keys)).resolves.toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});
