// e2e tests run outside Nest's ConfigModule (some, like health.e2e-spec.ts,
// boot a full TestingModule which loads env itself; others, like the
// CHECK-constraint tests, talk to the DB directly and need env loaded
// before they run at all) — same file precedence as app.module.ts.
import { config } from 'dotenv';
config({ path: '../../.env.local' });
config({ path: '.env' });
