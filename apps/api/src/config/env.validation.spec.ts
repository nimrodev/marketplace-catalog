import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validEnv = {
    NODE_ENV: 'production',
    PORT: '3000',
    DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    AWS_REGION: 'eu-central-1',
    SQS_PRESCREEN_QUEUE_URL: 'https://sqs.eu-central-1.amazonaws.com/123456789012/queue',
    S3_PHOTOS_BUCKET: 'marketplace-catalog-photos',
    JWT_SECRET: 'test-secret',
  };

  it('accepts a fully-specified, valid environment', () => {
    const { error } = envValidationSchema.validate(validEnv);
    expect(error).toBeUndefined();
  });

  it('fails fast with a readable error when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = validEnv;
    const { error } = envValidationSchema.validate(rest, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/DATABASE_URL/);
  });

  it('fails fast when AWS_REGION is missing', () => {
    const { AWS_REGION, ...rest } = validEnv;
    const { error } = envValidationSchema.validate(rest, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/AWS_REGION/);
  });

  it('fails fast when SQS_PRESCREEN_QUEUE_URL is missing', () => {
    const { SQS_PRESCREEN_QUEUE_URL, ...rest } = validEnv;
    const { error } = envValidationSchema.validate(rest, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/SQS_PRESCREEN_QUEUE_URL/);
  });

  it('fails fast when JWT_SECRET is missing', () => {
    const { JWT_SECRET, ...rest } = validEnv;
    const { error } = envValidationSchema.validate(rest, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/JWT_SECRET/);
  });

  it('fails fast when S3_PHOTOS_BUCKET is missing', () => {
    const { S3_PHOTOS_BUCKET, ...rest } = validEnv;
    const { error } = envValidationSchema.validate(rest, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/S3_PHOTOS_BUCKET/);
  });

  it('rejects malformed config (DATABASE_URL not a URI)', () => {
    const { error } = envValidationSchema.validate({ ...validEnv, DATABASE_URL: 'not-a-url' });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/DATABASE_URL/);
  });

  it('defaults NODE_ENV and PORT when omitted', () => {
    const { NODE_ENV, PORT, ...rest } = validEnv;
    const { error, value } = envValidationSchema.validate(rest);
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.PORT).toBe(3000);
  });
});
