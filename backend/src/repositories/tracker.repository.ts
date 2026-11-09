import { RowDataPacket } from 'mysql2';
import { Executor, exec, one, pool, query } from '../config/db';

export const STAGES = ['saved', 'applied', 'assessment', 'interview', 'offer', 'rejected'] as const;
export type Stage = (typeof STAGES)[number];

export interface AppRow extends RowDataPacket {
  id: number; user_id: number; job_id: number | null; resume_version_id: number | null; cover_letter_id: number | null; company: string; job_title: string;
  location: string | null; salary: string | null; application_url: string | null; job_description: string | null; status: Stage; position: number;
  applied_at: Date | null; follow_up_at: Date | null; created_at: Date; updated_at: Date;
}

const LIST = `SELECT a.id, a.job_id, a.resume_version_id, a.cover_letter_id, a.company, a.job_title, a.location, a.salary, a.application_url, a.status, a.position,
  a.applied_at, a.follow_up_at, a.created_at, a.updated_at, r.title AS resume_title, v.version_no,
  (SELECT MIN(i.scheduled_at) FROM interviews i WHERE i.application_id = a.id AND i.scheduled_at >= UTC_TIMESTAMP()) AS next_interview,
  (SELECT COUNT(*) FROM application_notes n WHERE n.application_id = a.id) AS note_count
  FROM job_applications a LEFT JOIN resume_versions v ON v.id = a.resume_version_id LEFT JOIN resumes r ON r.id = v.resume_id`;

export const trackerRepo = {
  list: (userId: number) => query(`${LIST} WHERE a.user_id = ? AND a.deleted_at IS NULL ORDER BY a.status, a.position, a.id`, [userId]),
  byId: (userId: number, id: number, db: Executor = pool) => one<AppRow>('SELECT * FROM job_applications WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId], db),
  async create(userId: number, d: Record<string, string | number | Date | null>, db: Executor): Promise<number> {
    const keys = Object.keys(d);
    const res = await exec(`INSERT INTO job_applications (user_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`, [userId, ...keys.map((k) => d[k])], db);
    return res.insertId;
  },
  async update(id: number, d: Record<string, string | number | Date | null>, db: Executor = pool) {
    const keys = Object.keys(d);
    if (keys.length) await exec(`UPDATE job_applications SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => d[k]), id], db);
  },
  softDelete: (id: number) => exec('UPDATE job_applications SET deleted_at = UTC_TIMESTAMP() WHERE id = ?', [id]),
  /** Ordered ids and positions of one column, locked so concurrent moves can't produce the same position. */
  column: (userId: number, status: string, excludeId: number, db: Executor) => query<{ id: number; position: number }>(
    'SELECT id, position FROM job_applications WHERE user_id = ? AND status = ? AND deleted_at IS NULL AND id <> ? ORDER BY position, id FOR UPDATE', [userId, status, excludeId], db),
  setPosition: (id: number, position: number, db: Executor) => exec('UPDATE job_applications SET position = ? WHERE id = ?', [position, id], db),
  addHistory: (appId: number, from: string | null, to: string, db: Executor) => exec('INSERT INTO application_status_history (application_id, from_status, to_status) VALUES (?,?,?)', [appId, from, to], db),
  history: (appId: number) => query('SELECT id, from_status, to_status, changed_at FROM application_status_history WHERE application_id = ? ORDER BY changed_at DESC, id DESC', [appId]),
  notes: (appId: number) => query('SELECT id, body, created_at FROM application_notes WHERE application_id = ? ORDER BY created_at DESC, id DESC', [appId]),
  addNote: (appId: number, body: string) => exec('INSERT INTO application_notes (application_id, body) VALUES (?,?)', [appId, body]),
  removeNote: (appId: number, noteId: number) => exec('DELETE FROM application_notes WHERE id = ? AND application_id = ?', [noteId, appId]),
  interviews: (appId: number) => query('SELECT id, scheduled_at, kind, location, notes FROM interviews WHERE application_id = ? ORDER BY scheduled_at', [appId]),
  addInterview: (appId: number, at: Date, kind: string, location: string | null, notes: string | null) => exec('INSERT INTO interviews (application_id, scheduled_at, kind, location, notes) VALUES (?,?,?,?,?)', [appId, at, kind, location, notes]),
  updateInterview: (appId: number, id: number, at: Date, kind: string, location: string | null, notes: string | null) => exec('UPDATE interviews SET scheduled_at = ?, kind = ?, location = ?, notes = ?, reminded_at = NULL WHERE id = ? AND application_id = ?', [at, kind, location, notes, id, appId]),
  removeInterview: (appId: number, id: number) => exec('DELETE FROM interviews WHERE id = ? AND application_id = ?', [id, appId]),
  followUpsDue: (userId: number, days: number) => query(
    `SELECT id, company, job_title, status, follow_up_at FROM job_applications
     WHERE user_id = ? AND deleted_at IS NULL AND status NOT IN ('offer','rejected') AND follow_up_at IS NOT NULL AND follow_up_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) ORDER BY follow_up_at`, [userId, days]),
};
