import { buildDataSourceOptions } from './data-source-options';

describe('buildDataSourceOptions', () => {
  it('enables SSL for a Neon-style URL carrying sslmode', () => {
    const options = buildDataSourceOptions(
      'postgresql://user:pass@ep-bold-haze.neon.tech/neondb?sslmode=require',
    );
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('disables SSL for a plain local Compose URL with no sslmode', () => {
    const options = buildDataSourceOptions('postgresql://marketplace:marketplace@postgres:5432/marketplace_dev');
    expect(options.ssl).toBe(false);
  });

  it('never synchronizes the schema — migrations are the only path', () => {
    const options = buildDataSourceOptions('postgresql://user:pass@host/db');
    expect(options.synchronize).toBe(false);
  });

  it('does not auto-run migrations on connect', () => {
    const options = buildDataSourceOptions('postgresql://user:pass@host/db');
    expect(options.migrationsRun).toBe(false);
  });
});
