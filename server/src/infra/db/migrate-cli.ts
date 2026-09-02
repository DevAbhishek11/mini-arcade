import { lifecycle } from '../lifecycle.js';
import { logger } from '../logger.js';
import { runMigrations } from './migrate.js';

try {
  const result = await runMigrations();
  logger.info(result, 'migration run finished');
  await lifecycle.shutdown('migrate-cli', 5_000);
  process.exit(0);
} catch (error) {
  logger.error({ err: (error as Error).message }, 'migration run failed');
  process.exit(1);
}
