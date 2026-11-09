import { RowDataPacket } from 'mysql2';
import { Executor, exec, json, one, pool, query } from '../config/db';
import { FormatSignals, StructuredResume } from '../interfaces/resume';

export interface ResumeRow extends RowDataPacket {
  id: number; user_id: number; title: string; category: string | null; origin: string; is_default: number;
  template: string; current_version_id: number | null; created_at: Date; updated_at: Date;
}
export interface VersionRow extends RowDataPacket {
  id: number; resume_id: number; version_no: number; label: string | null; change_source: string; raw_text: string;
  structured: unknown; file_path: string | null; file_name: string | null; file_mime: string | null;
  file_size: number | null; format_signals: unknown; created_at: Date;
}
export interface NewVersion {
  label?: string | null; changeSource: string; rawText: string; structured: StructuredResume;
  filePath?: string; fileName?: string; fileMime?: string; fileSize?: number; formatSignals?: FormatSignals | null;
}

export const parseVersion = (v: VersionRow) => ({
  ...v,
  structured: json<StructuredResume>(v.structured, {} as StructuredResume),
  format_signals: json<FormatSignals | null>(v.format_signals, null),
});

const SECTION_KEYS: [string, keyof StructuredResume][] = [
  ['personal', 'personal'], ['summary', 'summary'], ['experience', 'experience'], ['education', 'education'], ['skills', 'skills'],
  ['certifications', 'certifications'], ['projects', 'projects'], ['achievements', 'achievements'], ['languages', 'languages'],
];

export const resumeRepo = {
  list: (userId: number) => query<ResumeRow & { version_count: number; last_score: number | null; file_name: string | null }>(
    `SELECT r.*, (SELECT COUNT(*) FROM resume_versions v WHERE v.resume_id = r.id) AS version_count,
       (SELECT s.overall_score FROM resume_scans s WHERE s.resume_id = r.id ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS last_score,
       (SELECT v.file_name FROM resume_versions v WHERE v.id = r.current_version_id) AS file_name
     FROM resumes r WHERE r.user_id = ? AND r.deleted_at IS NULL ORDER BY r.is_default DESC, r.updated_at DESC`, [userId]),
  byId: (userId: number, id: number) => one<ResumeRow>('SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId]),
  defaultFor: (userId: number) => one<ResumeRow>('SELECT * FROM resumes WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, updated_at DESC LIMIT 1', [userId]),
  countFor: async (userId: number) => (await one<{ c: number }>('SELECT COUNT(*) c FROM resumes WHERE user_id = ? AND deleted_at IS NULL', [userId]))?.c ?? 0,

  async create(userId: number, title: string, category: string | null, origin: string, template: string, isDefault: boolean, db: Executor): Promise<number> {
    const res = await exec('INSERT INTO resumes (user_id, title, category, origin, template, is_default) VALUES (?,?,?,?,?,?)', [userId, title, category, origin, template, isDefault ? 1 : 0], db);
    return res.insertId;
  },

  /** Version numbers are assigned under a row lock on the parent, so concurrent saves can't collide. */
  async addVersion(resumeId: number, v: NewVersion, db: Executor): Promise<number> {
    await query('SELECT id FROM resumes WHERE id = ? FOR UPDATE', [resumeId], db);
    const next = (await one<{ n: number }>('SELECT COALESCE(MAX(version_no), 0) + 1 n FROM resume_versions WHERE resume_id = ?', [resumeId], db))!.n;
    const res = await exec(
      `INSERT INTO resume_versions (resume_id, version_no, label, change_source, raw_text, structured, file_path, file_name, file_mime, file_size, format_signals)
       VALUES (?,?,?,?,?,CAST(? AS JSON),?,?,?,?,CAST(? AS JSON))`,
      [resumeId, next, v.label ?? null, v.changeSource, v.rawText, JSON.stringify(v.structured), v.filePath ?? null, v.fileName ?? null, v.fileMime ?? null, v.fileSize ?? null, v.formatSignals ? JSON.stringify(v.formatSignals) : null], db);
    const versionId = res.insertId;
    let position = 0;
    for (const [type, key] of SECTION_KEYS) {
      await exec('INSERT INTO resume_sections (version_id, section_type, position, content) VALUES (?,?,?,CAST(? AS JSON))', [versionId, type, position++, JSON.stringify(v.structured[key] ?? null)], db);
    }
    await exec('UPDATE resumes SET current_version_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [versionId, resumeId], db);
    return versionId;
  },

  version: (resumeId: number, versionId: number) => one<VersionRow>('SELECT * FROM resume_versions WHERE id = ? AND resume_id = ?', [versionId, resumeId]),
  versionForUser: (userId: number, versionId: number) => one<VersionRow>(
    `SELECT v.* FROM resume_versions v JOIN resumes r ON r.id = v.resume_id WHERE v.id = ? AND r.user_id = ? AND r.deleted_at IS NULL`, [versionId, userId]),
  versions: (resumeId: number) => query<VersionRow>(
    `SELECT id, resume_id, version_no, label, change_source, file_name, file_size, created_at, (file_path IS NOT NULL) AS has_file FROM resume_versions WHERE resume_id = ? ORDER BY version_no DESC`, [resumeId]),
  update: (userId: number, id: number, title: string, category: string | null, template: string) =>
    exec('UPDATE resumes SET title = ?, category = ?, template = ? WHERE id = ? AND user_id = ?', [title, category, template, id, userId]),
  async setDefault(userId: number, id: number, db: Executor = pool) {
    await exec('UPDATE resumes SET is_default = 0 WHERE user_id = ? AND is_default = 1', [userId], db);
    await exec('UPDATE resumes SET is_default = 1 WHERE id = ? AND user_id = ?', [id, userId], db);
  },
  softDelete: (userId: number, id: number) => exec('UPDATE resumes SET deleted_at = UTC_TIMESTAMP(), is_default = 0 WHERE id = ? AND user_id = ?', [id, userId]),
};
