import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from './env';

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_POOL_SIZE,
  waitForConnections: true,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: false,
  decimalNumbers: true,
});

// Store and read every DATETIME as UTC regardless of the server's timezone.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export type Executor = Pool | PoolConnection;
type Param = string | number | boolean | Date | null | Buffer;

export async function query<T = RowDataPacket>(sql: string, params: Param[] = [], db: Executor = pool): Promise<T[]> {
  // `query` rather than `execute`: LIMIT/OFFSET placeholders and IN lists work reliably, and values stay escaped.
  const [rows] = await db.query(sql, params);
  return rows as T[];
}

export async function one<T = RowDataPacket>(sql: string, params: Param[] = [], db: Executor = pool): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

export async function exec(sql: string, params: Param[] = [], db: Executor = pool): Promise<ResultSetHeader> {
  const [res] = await db.query(sql, params);
  return res as ResultSetHeader;
}

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** mysql2 usually parses JSON columns, but tolerate strings from other drivers/configs. */
export function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}
