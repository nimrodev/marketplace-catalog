import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  // Only the migration CLI needs this (Neon's pooled URL breaks TypeORM's
  // migration runner) — not required for the app to boot, and local
  // Compose Postgres has no pooling to route around in the first place.
  DATABASE_URL_UNPOOLED: Joi.string().uri().optional(),
  AWS_REGION: Joi.string().required(),
  SQS_PRESCREEN_QUEUE_URL: Joi.string().uri().required(),
  SQS_ENDPOINT: Joi.string().uri().optional(),
  S3_PHOTOS_BUCKET: Joi.string().required(),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_PUBLIC_ENDPOINT: Joi.string().uri().optional(),
  // Local dev/CI (LocalStack) only — production uses the EC2 instance role.
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  JWT_SECRET: Joi.string().required(),
});
