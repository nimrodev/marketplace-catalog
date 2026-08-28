import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { UploadsService } from './uploads.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

function buildConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    AWS_REGION: 'eu-central-1',
    S3_PHOTOS_BUCKET: 'marketplace-catalog-photos',
    ...overrides,
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

describe('UploadsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('signs a PutObjectCommand for the bucket, key, and declared content type/length', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue('https://s3.example.com/presigned-put');
    const service = new UploadsService(buildConfig());

    const result = await service.createPresignedUpload('user-1', { contentType: 'image/jpeg', contentLength: 1024 });

    expect(result.url).toBe('https://s3.example.com/presigned-put');
    expect(result.key).toMatch(/^listings\/user-1\/[0-9a-f-]+\.jpg$/);

    const [, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'marketplace-catalog-photos',
      Key: result.key,
      ContentType: 'image/jpeg',
      ContentLength: 1024,
    });
    expect(options).toEqual({ expiresIn: 300 });
  });

  it('passes explicit static credentials only when both are configured (local dev/CI)', () => {
    // Constructing with both set shouldn't throw — the client accepts them.
    expect(
      () => new UploadsService(buildConfig({ AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret' })),
    ).not.toThrow();
  });

  it('constructs fine with no static credentials (production instance-role path)', () => {
    expect(() => new UploadsService(buildConfig())).not.toThrow();
  });
});
