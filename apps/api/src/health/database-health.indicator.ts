import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly config: ConfigService) {}

  async isHealthy(): Promise<boolean> {
    const client = new Client({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: 2000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
