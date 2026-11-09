import mysql from 'mysql2/promise';
import { env } from '../src/config/env';
import { runMigrations } from '../src/db/migrate';
import { seedReference } from '../src/db/seed';
import { pool } from '../src/config/db';

async function main() {
  if (!env.DB_NAME.endsWith('_test')) throw new Error('Refusing to reset a database that is not a test database.');
  const conn = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD });
  await conn.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``);
  await conn.end();
  await runMigrations(() => undefined);
  await seedReference();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
