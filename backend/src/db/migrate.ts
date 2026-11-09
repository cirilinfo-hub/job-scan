import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

/** Applies unapplied numbered .sql files in order. Each file is recorded only after it fully succeeds. */
export async function runMigrations(log: (m: string) => void = console.log): Promise<string[]> {
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
    multipleStatements: true, charset: 'utf8mb4',
  });
  const applied: string[] = [];
  try {
    // Hosted plans usually create the database for you and forbid CREATE DATABASE; tolerate that.
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
      .catch((e) => log(`Skipped CREATE DATABASE (${e.code}); expecting it to exist.`));
    await conn.query(`USE \`${env.DB_NAME}\``);
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const done = new Set((rows as { name: string }[]).map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      log(`Applying ${file}`);
      await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      applied.push(file);
    }
    log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.');
    return applied;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runMigrations().catch((e) => { console.error(e); process.exit(1); });
}
