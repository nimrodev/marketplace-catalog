import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ListingsModule } from './listings/listings.module';
import { ModerationModule } from './moderation/moderation.module';
import { UploadsModule } from './uploads/uploads.module';
import { envValidationSchema } from './config/env.validation';
import { buildDataSourceOptions } from './database/data-source-options';

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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      // The pooled URL — migrations (CLI, see database/data-source.ts) use
      // the unpooled one instead. Same buildDataSourceOptions either way,
      // so the two can never define conflicting schema rules.
      useFactory: (config: ConfigService) => buildDataSourceOptions(config.getOrThrow('DATABASE_URL')),
    }),
    // Registered once here (forRoot is root-level config, not per-feature) —
    // consumers (currently just UploadsModule) apply it locally via
    // @UseGuards, not by re-registering the module.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    HealthModule,
    ListingsModule,
    ModerationModule,
    AuthModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
