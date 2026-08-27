import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { HealthModule } from './health/health.module';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
      // .env.local lives at the repo root (Neon CLI writes it there, shared
      // across apps); production gets real env vars injected, so a missing
      // file here is not an error.
      envFilePath: ['../../.env.local', '.env'],
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
