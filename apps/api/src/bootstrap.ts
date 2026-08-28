import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

// Shared by main.ts and the e2e suite so the pipe/prefix config used in
// production is exactly what the tests exercise — no risk of the two drifting.
export function configureApp(app: INestApplication): void {
  // Needed to read the httpOnly auth cookie off incoming requests (MAR-12).
  app.use(cookieParser());
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
