import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envValidationSchema } from './config/env.validation';
import { buildDataSourceOptions } from './database/data-source-options';
import { PrescreenModule } from './prescreen/prescreen.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
      // Same file precedence as apps/api/src/app.module.ts — .env.local at
      // the repo root (Neon CLI's output) first, then a local .env.
      envFilePath: ['../../.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildDataSourceOptions(config.getOrThrow('DATABASE_URL')),
    }),
    PrescreenModule,
  ],
})
export class AppModule {}
