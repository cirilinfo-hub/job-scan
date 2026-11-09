import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TEST_DB = process.env.TEST_DB_NAME ?? 'rolewise_test';

/** Rebuilds a dedicated test database. It refuses any database whose name doesn't end in _test. */
export default async function setup() {
  if (!TEST_DB.endsWith('_test')) throw new Error('TEST_DB_NAME must end in _test');
  const script = path.resolve(__dirname, 'prepare-db.ts');
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--env-file=.env', script], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', env: { ...process.env, DB_NAME: TEST_DB, NODE_ENV: 'test' } });
  if (r.status !== 0) throw new Error('Could not prepare the test database');
}
