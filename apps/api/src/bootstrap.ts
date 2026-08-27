import { INestApplication, ValidationPipe } from '@nestjs/common';

// Shared by main.ts and the e2e suite so the pipe/prefix config used in
// production is exactly what the tests exercise — no risk of the two drifting.
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Health checks stay unprefixed so infra checks (Docker HEALTHCHECK,
  // load balancer target group) can hit them without knowing the API prefix.
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
}
