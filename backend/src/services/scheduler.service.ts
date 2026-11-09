import fs from 'node:fs/promises';
import { env } from '../config/env';
import { exec, pool, query } from '../config/db';
import { logger } from '../utils/logger';
import { resolveStored } from './file.service';
import { jobService } from './job.service';
import { notificationService } from './notification.service';

const MIN = 60_000;

/** A MySQL advisory lock stops two app instances from running the same job at once. */
async function withLock(name: string, fn: () => Promise<void>): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [`rolewise:${name}`]);
    if ((rows as { got: number }[])[0]?.got !== 1) return;
    try { await fn(); } finally { await conn.query('SELECT RELEASE_LOCK(?)', [`rolewise:${name}`]); }
  } catch (err) {
    logger.error({ err, name }, 'Scheduled task failed');
  } finally {
    conn.release();
  }
}

export async function runReminders(): Promise<void> {
  const users = await query<{ id: number }>(`SELECT id FROM users WHERE deleted_at IS NULL AND status = 'active' AND last_active_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`);
  for (const u of users) await notificationService.generateFor(u.id).catch((e) => logger.warn({ e: (e as Error).message, user: u.id }, 'Reminder generation failed'));
}

export async function runJobSync(): Promise<void> {
  const sources = await query<{ code: string }>('SELECT code FROM job_sources WHERE is_enabled = 1');
  for (const s of sources) await jobService.syncSource(s.code).catch(() => undefined); // The failure is recorded on the source row.
}

/** Removes data past its retention window, including stored resume files, and expired credentials. */
export async function runRetention(): Promise<void> {
  const d = env.RETENTION_DAYS_DELETED;
  const files = await query<{ file_path: string }>(
    `SELECT v.file_path FROM resume_versions v JOIN resumes r ON r.id = v.resume_id WHERE v.file_path IS NOT NULL AND r.deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`, [d]);
  for (const f of files) await fs.rm(resolveStored(f.file_path), { force: true }).catch(() => undefined);
  await exec('DELETE FROM resumes WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [d]);
  await exec('DELETE FROM job_applications WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [d]);
  await exec('DELETE FROM cover_letters WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [d]);
  const goneUsers = await query<{ id: number }>('SELECT id FROM users WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [d]);
  for (const u of goneUsers) {
    await fs.rm(resolveStored(`${u.id}/.`).replace(/[\\/]\.$/, ''), { recursive: true, force: true }).catch(() => undefined);
    await exec('DELETE FROM users WHERE id = ?', [u.id]);
  }
  await exec('DELETE FROM user_sessions WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)');
  await exec('DELETE FROM auth_tokens WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)');
  const logs = env.RETENTION_DAYS_LOGS;
  await exec('DELETE FROM usage_logs WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [logs]);
  await exec('DELETE FROM audit_logs WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [logs]);
  await exec('DELETE FROM notifications WHERE read_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [logs]);
}

export function startScheduler(): () => void {
  const timers = [
    setInterval(() => void withLock('reminders', runReminders), 15 * MIN),
    setInterval(() => void withLock('jobsync', runJobSync), 6 * 60 * MIN),
    setInterval(() => void withLock('retention', runRetention), 24 * 60 * MIN),
  ];
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}

