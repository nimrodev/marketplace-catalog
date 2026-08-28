import { ConfigService } from '@nestjs/config';

// e2e specs construct ListingsRepository directly against a real DataSource,
// bypassing Nest's DI container entirely — so there's no app to pull a real
// ConfigService from. This reads the same env vars the real one would.
export function fakeConfigService(): ConfigService {
  return {
    get: (key: string) => process.env[key],
    getOrThrow: (key: string) => {
      const value = process.env[key];
      if (value === undefined) throw new Error(`missing env var ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}
