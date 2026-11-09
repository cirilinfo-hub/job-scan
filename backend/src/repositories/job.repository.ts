import { RowDataPacket } from 'mysql2';
import { exec, json, one, pool, query } from '../config/db';
import { likeEscape } from '../utils/http';

export interface JobFilters {
  q?: string; title?: string; company?: string; location?: string; workModes?: string[]; employmentTypes?: string[];
  levels?: string[]; maxYears?: number; minSalary?: number; postedWithinDays?: number; minScore?: number; savedOnly?: boolean;
  sort: 'recent' | 'match' | 'salary';
}

const LIST_COLUMNS = `j.id, j.title, j.summary, j.location, j.work_mode, j.employment_type, j.experience_level, j.min_years,
  j.salary_min, j.salary_max, j.salary_currency, j.posted_at, j.is_demo, j.apply_url, j.source_url,
  c.name AS company, c.logo_url AS company_logo, s.name AS source_name, s.homepage AS source_homepage, s.attribution AS source_attribution, cat.name AS category,
  m.score AS match_score, (sj.job_id IS NOT NULL) AS is_saved,
  (SELECT GROUP_CONCAT(sk.name ORDER BY jsk.is_required DESC, sk.name SEPARATOR '|') FROM job_skills jsk JOIN skills sk ON sk.id = jsk.skill_id WHERE jsk.job_id = j.id) AS skill_names`;

const FROM = `FROM jobs j JOIN job_sources s ON s.id = j.source_id
  LEFT JOIN companies c ON c.id = j.company_id
  LEFT JOIN job_categories cat ON cat.id = j.category_id
  LEFT JOIN job_matches m ON m.job_id = j.id AND m.user_id = ?
  LEFT JOIN saved_jobs sj ON sj.job_id = j.id AND sj.user_id = ?`;

const inList = (xs: string[]) => xs.map(() => '?').join(',');

function where(f: JobFilters) {
  const clauses = ['j.is_active = 1'];
  const params: (string | number)[] = [];
  if (f.q) { clauses.push('(MATCH(j.title, j.description) AGAINST (? IN NATURAL LANGUAGE MODE) OR c.name LIKE ?)'); params.push(f.q, likeEscape(f.q)); }
  if (f.title) { clauses.push('j.title LIKE ?'); params.push(likeEscape(f.title)); }
  if (f.company) { clauses.push('c.name LIKE ?'); params.push(likeEscape(f.company)); }
  if (f.location) { clauses.push('j.location LIKE ?'); params.push(likeEscape(f.location)); }
  if (f.workModes?.length) { clauses.push(`j.work_mode IN (${inList(f.workModes)})`); params.push(...f.workModes); }
  if (f.employmentTypes?.length) { clauses.push(`j.employment_type IN (${inList(f.employmentTypes)})`); params.push(...f.employmentTypes); }
  if (f.levels?.length) { clauses.push(`j.experience_level IN (${inList(f.levels)})`); params.push(...f.levels); }
  if (f.maxYears !== undefined) { clauses.push('(j.min_years IS NULL OR j.min_years <= ?)'); params.push(f.maxYears); }
  if (f.minSalary !== undefined) { clauses.push('COALESCE(j.salary_max, j.salary_min) >= ?'); params.push(f.minSalary); }
  if (f.postedWithinDays) { clauses.push('j.posted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)'); params.push(f.postedWithinDays); }
  if (f.minScore !== undefined) { clauses.push('m.score >= ?'); params.push(f.minScore); }
  if (f.savedOnly) clauses.push('sj.job_id IS NOT NULL');
  return { sql: clauses.join(' AND '), params };
}

const ORDER: Record<JobFilters['sort'], string> = {
  recent: 'j.posted_at DESC, j.id DESC',
  match: 'm.score IS NULL, m.score DESC, j.posted_at DESC',
  salary: 'COALESCE(j.salary_max, j.salary_min) IS NULL, COALESCE(j.salary_max, j.salary_min) DESC, j.id DESC',
};

export const jobRepo = {
  async search(userId: number, f: JobFilters, limit: number, offset: number) {
    const w = where(f);
    const items = await query(`SELECT ${LIST_COLUMNS} ${FROM} WHERE ${w.sql} ORDER BY ${ORDER[f.sort]} LIMIT ? OFFSET ?`, [userId, userId, ...w.params, limit, offset]);
    const total = (await one<{ c: number }>(`SELECT COUNT(*) c ${FROM} WHERE ${w.sql}`, [userId, userId, ...w.params]))?.c ?? 0;
    return { items, total };
  },
  byId: (userId: number, id: number) => one(
    `SELECT ${LIST_COLUMNS}, j.description, c.description AS company_description, c.website AS company_website, m.breakdown ${FROM} WHERE j.id = ? AND j.is_active = 1`,
    [userId, userId, id]),
  jobSkills: (jobId: number) => query<{ id: number; name: string; type: string; is_required: number }>(
    `SELECT s.id, s.name, s.type, js.is_required FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id = ? ORDER BY js.is_required DESC, s.name`, [jobId]),
  save: (userId: number, jobId: number) => exec('INSERT IGNORE INTO saved_jobs (user_id, job_id) VALUES (?,?)', [userId, jobId]),
  unsave: (userId: number, jobId: number) => exec('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?', [userId, jobId]),
  exists: async (id: number) => !!(await one('SELECT id FROM jobs WHERE id = ? AND is_active = 1', [id])),
  facets: () => query<{ work_mode: string; c: number }>('SELECT work_mode, COUNT(*) c FROM jobs WHERE is_active = 1 GROUP BY work_mode'),

  // Matching
  jobsForMatching: (limit: number) => query<RowDataPacket & { id: number; title: string; description: string; location: string | null; work_mode: string; employment_type: string; experience_level: string; min_years: number | null }>(
    `SELECT id, title, description, location, work_mode, employment_type, experience_level, min_years FROM jobs WHERE is_active = 1 ORDER BY posted_at DESC LIMIT ?`, [limit]),
  async skillsForJobs(ids: number[]) {
    if (!ids.length) return [];
    return query<{ job_id: number; name: string; type: 'hard' | 'soft' | 'tool' | 'certification'; aliases: unknown; is_required: number }>(
      `SELECT js.job_id, s.name, s.type, s.aliases, js.is_required FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id IN (${inList(ids.map(String))})`, ids);
  },
  async upsertMatches(userId: number, versionId: number | null, rows: { jobId: number; score: number; breakdown: unknown }[]) {
    if (!rows.length) return;
    const values = rows.map((r) => [userId, r.jobId, versionId, r.score, JSON.stringify(r.breakdown)]);
    await pool.query(
      `INSERT INTO job_matches (user_id, job_id, resume_version_id, score, breakdown) VALUES ?
       ON DUPLICATE KEY UPDATE resume_version_id = VALUES(resume_version_id), score = VALUES(score), breakdown = VALUES(breakdown), computed_at = UTC_TIMESTAMP()`, [values]);
  },
  matchMeta: (userId: number) => one<{ version_id: number | null; computed_at: Date | null; c: number }>(
    'SELECT MAX(resume_version_id) version_id, MAX(computed_at) computed_at, COUNT(*) c FROM job_matches WHERE user_id = ?', [userId]),
  matchList: (userId: number, minScore: number, limit: number, offset: number) => query(
    `SELECT ${LIST_COLUMNS}, m.breakdown ${FROM} WHERE j.is_active = 1 AND m.score >= ? ORDER BY m.score DESC, j.posted_at DESC LIMIT ? OFFSET ?`,
    [userId, userId, minScore, limit, offset]),
  matchCount: async (userId: number, minScore: number) => (await one<{ c: number }>(
    `SELECT COUNT(*) c FROM job_matches m JOIN jobs j ON j.id = m.job_id AND j.is_active = 1 WHERE m.user_id = ? AND m.score >= ?`, [userId, minScore]))?.c ?? 0,

  // Ingestion
  async upsertCompany(name: string, logo: string | null, website: string | null): Promise<number> {
    const norm = name.trim().toLowerCase().slice(0, 150);
    const res = await exec(
      `INSERT INTO companies (name, normalized, logo_url, website) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), logo_url = COALESCE(VALUES(logo_url), logo_url), website = COALESCE(VALUES(website), website)`,
      [name.slice(0, 150), norm, logo, website]);
    return res.insertId;
  },
  async upsertCategory(name: string): Promise<number> {
    const res = await exec('INSERT INTO job_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)', [name.slice(0, 80)]);
    return res.insertId;
  },
  source: async (code: string) => one<RowDataPacket & { id: number; code: string; name: string; is_enabled: number; config: unknown }>('SELECT * FROM job_sources WHERE code = ?', [code]),
  async replaceSkills(jobId: number, skills: { id: number; required: boolean }[]) {
    await exec('DELETE FROM job_skills WHERE job_id = ?', [jobId]);
    if (skills.length) await pool.query('INSERT INTO job_skills (job_id, skill_id, is_required) VALUES ?', [skills.map((s) => [jobId, s.id, s.required ? 1 : 0])]);
  },
  parseBreakdown: (v: unknown) => json<Record<string, unknown> | null>(v, null),
};
