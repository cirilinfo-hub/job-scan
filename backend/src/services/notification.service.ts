import { env } from '../config/env';
import { exec, one, query } from '../config/db';
import { sendMail } from '../integrations/email/mailer';
import { logger } from '../utils/logger';
import { profileService } from './profile.service';

interface NewNotification { userId: number; type: string; title: string; body?: string; link?: string; dedupeKey?: string }

async function create(n: NewNotification): Promise<boolean> {
  const res = await exec('INSERT IGNORE INTO notifications (user_id, type, title, body, link, dedupe_key) VALUES (?,?,?,?,?,?)',
    [n.userId, n.type, n.title, n.body ?? null, n.link ?? null, n.dedupeKey ?? null]);
  if (!res.affectedRows) return false;
  const u = await one<{ email: string; email_notifications: number }>('SELECT email, email_notifications FROM users WHERE id = ? AND deleted_at IS NULL', [n.userId]);
  if (u?.email_notifications) {
    await sendMail({ to: u.email, subject: n.title, text: `${n.body ?? ''}\n\n${n.link ? `${env.APP_URL}${n.link}` : env.APP_URL}` });
  }
  return true;
}

const lastRun = new Map<number, number>();

export const notificationService = {
  create,

  list(userId: number, unreadOnly: boolean, limit: number, offset: number) {
    return query(`SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [userId, limit, offset]);
  },
  count: async (userId: number, unreadOnly: boolean) => (await one<{ c: number }>(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}`, [userId]))?.c ?? 0,
  markRead: (userId: number, id: number) => exec('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND read_at IS NULL', [id, userId]),
  markAll: (userId: number) => exec('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [userId]),
  remove: (userId: number, id: number) => exec('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId]),

  /** Idempotent: dedupe keys mean that repeated runs can't create a duplicate reminder. */
  async generateFor(userId: number): Promise<void> {
    const due = await query<{ id: number; company: string; job_title: string }>(
      `SELECT id, company, job_title FROM job_applications WHERE user_id = ? AND deleted_at IS NULL AND status NOT IN ('offer','rejected')
       AND follow_up_at IS NOT NULL AND follow_up_at <= UTC_TIMESTAMP() AND follow_up_notified_at IS NULL`, [userId]);
    for (const a of due) {
      await create({ userId, type: 'follow_up', title: `Follow up with ${a.company}`, body: `Your follow-up date for ${a.job_title} has arrived.`, link: '/tracker', dedupeKey: `follow:${a.id}:${new Date().toISOString().slice(0, 10)}` });
      await exec('UPDATE job_applications SET follow_up_notified_at = UTC_TIMESTAMP() WHERE id = ?', [a.id]);
    }

    const soon = await query<{ id: number; scheduled_at: Date; kind: string; company: string; job_title: string }>(
      `SELECT i.id, i.scheduled_at, i.kind, a.company, a.job_title FROM interviews i JOIN job_applications a ON a.id = i.application_id
       WHERE a.user_id = ? AND a.deleted_at IS NULL AND i.reminded_at IS NULL AND i.scheduled_at BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR)`, [userId]);
    for (const i of soon) {
      await create({ userId, type: 'interview', title: `Upcoming ${i.kind}: ${i.company}`, body: `${i.job_title}, ${i.scheduled_at.toUTCString()}.`, link: '/tracker', dedupeKey: `interview:${i.id}:${i.scheduled_at.getTime()}` });
      await exec('UPDATE interviews SET reminded_at = UTC_TIMESTAMP() WHERE id = ?', [i.id]);
    }

    const today = new Date().toISOString().slice(0, 10);
    const week = `${new Date().getUTCFullYear()}-${Math.floor(new Date().getTime() / 6048e5)}`;
    const strong = await one<{ c: number; best: number | null }>(
      `SELECT COUNT(*) c, MAX(m.score) best FROM job_matches m JOIN jobs j ON j.id = m.job_id AND j.is_active = 1
       LEFT JOIN saved_jobs s ON s.job_id = m.job_id AND s.user_id = m.user_id
       WHERE m.user_id = ? AND m.score >= 70 AND s.job_id IS NULL AND j.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)`, [userId]);
    if (strong?.c) await create({ userId, type: 'job_recommendation', title: `${strong.c} new jobs compare well with your resume`, body: `The closest comparison scores ${strong.best}%. Scores compare your resume with the listing and don't predict hiring.`, link: '/matches', dedupeKey: `jobs:${today}` });

    const resume = await one<{ resumes: number; lastScan: Date | null }>(
      `SELECT (SELECT COUNT(*) FROM resumes WHERE user_id = ? AND deleted_at IS NULL) resumes, (SELECT MAX(created_at) FROM resume_scans WHERE user_id = ?) lastScan`, [userId, userId]);
    if (resume?.resumes && (!resume.lastScan || Date.now() - resume.lastScan.getTime() > 14 * 864e5)) {
      await create({ userId, type: 'resume_reminder', title: 'Check your resume against a current job', body: 'A scan shows which terms from a job are missing from your resume.', link: '/scanner', dedupeKey: `scan:${week}` });
    }

    const completion = await profileService.completion(userId);
    if (completion.percent < 60) {
      const next = completion.items.find((i) => !i.done);
      await create({ userId, type: 'profile_reminder', title: `Your profile is ${completion.percent}% complete`, body: next ? `Next step: ${next.label.toLowerCase()}.` : undefined, link: next?.link ?? '/profile', dedupeKey: `profile:${week}` });
    }
  },

  /** Runs on user activity, at most every five minutes, so reminders still appear on hosts that idle background work. */
  async generateThrottled(userId: number): Promise<void> {
    const last = lastRun.get(userId) ?? 0;
    if (Date.now() - last < 300_000) return;
    lastRun.set(userId, Date.now());
    await this.generateFor(userId).catch((err) => logger.warn({ err: (err as Error).message, userId }, 'Notification generation failed'));
  },
};
