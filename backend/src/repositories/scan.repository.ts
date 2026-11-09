import { Executor, exec, one, pool, query } from '../config/db';
import { ScanReport } from '../services/ats/scorer';

export const scanRepo = {
  async insert(d: {
    userId: number; resumeId: number; versionId: number; jobId: number | null; company: string | null; jobTitle: string; jobDescription: string;
    report: ScanReport; rules: unknown; excluded: string[];
  }, db: Executor): Promise<number> {
    const res = await exec(
      `INSERT INTO resume_scans (user_id, resume_id, version_id, job_id, company, job_title, job_description, overall_score) VALUES (?,?,?,?,?,?,?,?)`,
      [d.userId, d.resumeId, d.versionId, d.jobId, d.company, d.jobTitle, d.jobDescription, d.report.overall], db);
    await this.saveResult(res.insertId, d.report, d.rules, d.excluded, db);
    return res.insertId;
  },
  async saveResult(scanId: number, r: ScanReport, rules: unknown, excluded: string[], db: Executor) {
    const score = (k: string) => r.lines.find((l) => l.key === k)!.score;
    await exec(
      `REPLACE INTO resume_scan_results (scan_id, skills_score, keyword_score, experience_score, title_score, formatting_score, education_score, report, rules_snapshot, excluded_terms)
       VALUES (?,?,?,?,?,?,?,CAST(? AS JSON),CAST(? AS JSON),CAST(? AS JSON))`,
      [scanId, score('skills'), score('keywords'), score('experience'), score('title'), score('formatting'), score('education'), JSON.stringify(r), JSON.stringify(rules), JSON.stringify(excluded)], db);
    await exec('DELETE FROM resume_keywords WHERE scan_id = ?', [scanId], db);
    if (r.keywords.length) {
      const values = r.keywords.map((k) => [scanId, k.term.slice(0, 100), k.category, k.status, k.required ? 1 : 0, k.jobCount, k.resumeCount]);
      await db.query('INSERT INTO resume_keywords (scan_id, term, category, status, is_required, job_count, resume_count) VALUES ?', [values]);
    }
    await exec('UPDATE resume_scans SET overall_score = ? WHERE id = ?', [r.overall, scanId], db);
  },
  list: (userId: number, limit: number, offset: number) => query(
    `SELECT s.id, s.resume_id, s.version_id, s.company, s.job_title, s.overall_score, s.created_at, r.title AS resume_title, v.version_no
     FROM resume_scans s JOIN resumes r ON r.id = s.resume_id JOIN resume_versions v ON v.id = s.version_id
     WHERE s.user_id = ? ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`, [userId, limit, offset]),
  count: async (userId: number) => (await one<{ c: number }>('SELECT COUNT(*) c FROM resume_scans WHERE user_id = ?', [userId]))?.c ?? 0,
  byId: (userId: number, id: number, db: Executor = pool) => one(
    `SELECT s.*, r.title AS resume_title, v.version_no, v.raw_text AS resume_text, v.structured, v.format_signals,
       sr.report, sr.rules_snapshot, sr.excluded_terms
     FROM resume_scans s JOIN resumes r ON r.id = s.resume_id JOIN resume_versions v ON v.id = s.version_id
     JOIN resume_scan_results sr ON sr.scan_id = s.id WHERE s.id = ? AND s.user_id = ?`, [id, userId], db),
  remove: (userId: number, id: number) => exec('DELETE FROM resume_scans WHERE id = ? AND user_id = ?', [id, userId]),
};
