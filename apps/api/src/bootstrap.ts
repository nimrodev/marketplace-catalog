import { BadRequestException, INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { ApiErrorResponse } from '@marketplace/shared';
import cookieParser from 'cookie-parser';

// class-validator nests errors for object/array properties in `.children`;
// none of this API's DTOs are nested, but walking it anyway is what makes
// this correct rather than "correct until someone adds a nested field".
export function toFieldErrors(errors: ValidationError[], prefix = ''): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const error of errors) {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints && Object.keys(error.constraints).length > 0) {
      result[field] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(result, toFieldErrors(error.children, field));
    }
  }
  return result;
}

// Shared by main.ts and the e2e suite so the pipe/prefix config used in
// production is exactly what the tests exercise — no risk of the two drifting.
export function configureApp(app: INestApplication): void {
  // Caddy terminates the client connection and forwards over plain HTTP
  // inside the Docker network — without this, req.secure is always false
  // behind the proxy, even once Caddy is actually serving HTTPS (MAR-44).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // Needed to read the httpOnly auth cookie off incoming requests (MAR-12).
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const body: ApiErrorResponse = {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          fieldErrors: toFieldErrors(errors),
        };
        return new BadRequestException(body);
      },
    }),
  );
  // Health checks stay unprefixed so infra checks (Docker HEALTHCHECK,
  // load balancer target group) can hit them without knowing the API prefix.
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
}
