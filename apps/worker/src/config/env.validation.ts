import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DATABASE_URL: Joi.string().uri().required(),
  AWS_REGION: Joi.string().required(),
  SQS_PRESCREEN_QUEUE_URL: Joi.string().uri().required(),
  SQS_ENDPOINT: Joi.string().uri().optional(),
  S3_PHOTOS_BUCKET: Joi.string().required(),
  S3_ENDPOINT: Joi.string().uri().optional(),
  // Local dev/CI (LocalStack) only — production uses the EC2 instance role.
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  // Optional by design — the worker must still persist the deterministic
  // result when this is unset, same reasoning as the API's AI features.
  ANTHROPIC_API_KEY: Joi.string().optional(),
});
