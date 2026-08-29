import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrescreenConsumerService } from './prescreen/prescreen-consumer.service';

const logger = new Logger('bootstrap');

async function bootstrap() {
  // No HTTP surface — an application context gives DI (ConfigModule,
  // TypeOrmModule) without an unused Express listener.
  const app = await NestFactory.createApplicationContext(AppModule);
  const consumer = app.get(PrescreenConsumerService);

  const runPromise = consumer.run();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log({ event: 'prescreen.shutdown_started', signal });
    consumer.stop();
    await runPromise;
    await consumer.waitForIdle();
    await app.close();
    logger.log({ event: 'prescreen.shutdown_complete' });
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await runPromise;
}

bootstrap();
