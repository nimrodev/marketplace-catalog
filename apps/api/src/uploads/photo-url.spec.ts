import { ConfigService } from '@nestjs/config';
import { buildPhotoUrl } from './photo-url';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('buildPhotoUrl', () => {
  it('builds a path-style URL against the public endpoint when set (LocalStack)', () => {
    const config_ = config({ S3_PHOTOS_BUCKET: 'photos', S3_PUBLIC_ENDPOINT: 'http://localhost:4566/' });
    expect(buildPhotoUrl('listings/user-1/abc.jpg', config_)).toBe('http://localhost:4566/photos/listings/user-1/abc.jpg');
  });

  it('falls back to S3_ENDPOINT when there is no separate public endpoint (CI, same localhost both sides)', () => {
    const config_ = config({ S3_PHOTOS_BUCKET: 'photos', S3_ENDPOINT: 'http://localhost:4566' });
    expect(buildPhotoUrl('listings/user-1/abc.jpg', config_)).toBe('http://localhost:4566/photos/listings/user-1/abc.jpg');
  });

  it('builds a virtual-hosted-style S3 URL when no public endpoint is set (production)', () => {
    const config_ = config({ S3_PHOTOS_BUCKET: 'photos', AWS_REGION: 'eu-central-1' });
    expect(buildPhotoUrl('listings/user-1/abc.jpg', config_)).toBe('https://photos.s3.eu-central-1.amazonaws.com/listings/user-1/abc.jpg');
  });

  it('passes an already-absolute URL through unchanged (seed data predates the real upload flow)', () => {
    const config_ = config({ S3_PHOTOS_BUCKET: 'photos', AWS_REGION: 'eu-central-1' });
    expect(buildPhotoUrl('https://picsum.photos/seed/1/800/600', config_)).toBe('https://picsum.photos/seed/1/800/600');
  });
});
