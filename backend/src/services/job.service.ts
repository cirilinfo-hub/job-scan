import { exec } from '../config/db';
import { getJobProvider, NormalizedJob } from '../integrations/jobs/provider';
import { jobRepo, JobFilters } from '../repositories/job.repository';
import { logger } from '../utils/logger';
import { AppError, notFound } from '../utils/errors';
import { requiredYears } from './ats/scorer';
import { findJobSkills } from './ats/text';
import { catalogService } from './catalog.service';
import { matchingService } from './matching.service';

export function inferLevel(title: string, minYears: number | null): 'intern' | 'entry' | 'mid' | 'senior' | 'lead' | 'executive' | 'unknown' {
  const t = title.toLowerCase();
  if (/\b(intern|internship|trainee)\b/.test(t)) return 'intern';
  if (/\b(chief|cto|ceo|cfo|vp|vice president|head of|director)\b/.test(t)) return 'executive';
  if (/\b(lead|principal|staff|manager)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry|graduate|associate)\b/.test(t)) return 'entry';
  if (minYears !== null) return minYears >= 6 ? 'senior' : minYears >= 2 ? 'mid' : 'entry';
  return 'unknown';
}

export function inferWorkMode(j: NormalizedJob): 'remote' | 'hybrid' | 'onsite' | 'unknown' {
  if (j.workMode && j.workMode !== 'unknown') return j.workMode;
  const text = `${j.title} ${j.location ?? ''} ${j.description.slice(0, 1500)}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return 'hybrid';
  if (/\b(fully remote|remote[- ]first|100% remote|work from home|remote)\b/.test(`${j.title} ${j.location ?? ''}`.toLowerCase())) return 'remote';
  if (/\b(on-?site|in[- ]office)\b/.test(text)) return 'onsite';
  return 'unknown';
}

const summarize = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 280 ? flat : `${flat.slice(0, 277).replace(/\s+\S*$/, '')}...`;
};

/** Third-party data: only web links may reach the page, whatever a source sends. */
const webUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u.slice(0, 1000) : null);

export async function ingestJob(sourceId: number, j: NormalizedJob, opts: { isDemo?: boolean } = {}): Promise<number> {
  const catalog = await catalogService.skills();
  const companyId = await jobRepo.upsertCompany(j.company || 'Unknown company', webUrl(j.companyLogo), webUrl(j.companyWebsite));
  const categoryId = j.category ? await jobRepo.upsertCategory(j.category) : null;
  const minYears = requiredYears(j.description);
  const res = await exec(
    `INSERT INTO jobs (source_id, external_id, company_id, category_id, title, description, summary, location, work_mode, employment_type, experience_level, min_years,
       salary_min, salary_max, salary_currency, apply_url, source_url, is_demo, posted_at, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), company_id = VALUES(company_id), category_id = VALUES(category_id), title = VALUES(title), description = VALUES(description),
       summary = VALUES(summary), location = VALUES(location), work_mode = VALUES(work_mode), employment_type = VALUES(employment_type), experience_level = VALUES(experience_level),
       min_years = VALUES(min_years), salary_min = VALUES(salary_min), salary_max = VALUES(salary_max), salary_currency = VALUES(salary_currency),
       apply_url = VALUES(apply_url), source_url = VALUES(source_url), posted_at = VALUES(posted_at), is_active = 1`,
    [sourceId, j.externalId.slice(0, 190), companyId, categoryId, j.title.slice(0, 200), j.description, summarize(j.description), j.location?.slice(0, 150) ?? null,
      inferWorkMode(j), j.employmentType ?? 'unknown', inferLevel(j.title, minYears), minYears,
      j.salaryMin ?? null, j.salaryMax ?? null, j.salaryCurrency ?? null, webUrl(j.applyUrl), webUrl(j.sourceUrl),
      opts.isDemo ? 1 : 0, j.postedAt ?? new Date()]);
  const skills = findJobSkills(`${j.title}\n${j.description}`, catalog).slice(0, 30).map((f) => ({ id: f.skill.id, required: f.required }));
  await jobRepo.replaceSkills(res.insertId, skills);
  return res.insertId;
}

export const jobService = {
  async search(userId: number, f: JobFilters, page: number, pageSize: number) {
    // Scores are computed lazily, so the page and any score filter or sort are based on current data.
    await matchingService.ensureFresh(userId);
    const { items, total } = await jobRepo.search(userId, f, pageSize, (page - 1) * pageSize);
    return { items: items.map(present), total };
  },

  async get(userId: number, id: number) {
    await matchingService.ensureFresh(userId);
    const job = await jobRepo.byId(userId, id) as Record<string, unknown> | null;
    if (!job) throw notFound('Job');
    return { ...present(job), breakdown: jobRepo.parseBreakdown(job.breakdown), skills: await jobRepo.jobSkills(id) };
  },

  async setSaved(userId: number, id: number, saved: boolean) {
    if (!(await jobRepo.exists(id))) throw notFound('Job');
    if (saved) await jobRepo.save(userId, id);
    else await jobRepo.unsave(userId, id);
  },

  /** Fetches from one authorised source and records the outcome honestly, including failures. */
  async syncSource(code: string, limit = 100) {
    const source = await jobRepo.source(code);
    const provider = getJobProvider(code);
    if (!source || !provider) throw notFound('Job source');
    const missing = provider.missingConfig();
    if (missing.length) throw new AppError(400, 'SOURCE_NOT_CONFIGURED', `Set ${missing.join(', ')} on the server to use this source.`);
    try {
      const jobs = await provider.fetchJobs(limit);
      let count = 0;
      for (const j of jobs) {
        if (!j.title || !j.description) continue;
        await ingestJob(source.id, j);
        count += 1;
      }
      await exec(`UPDATE job_sources SET last_sync_at = UTC_TIMESTAMP(), last_sync_status = 'ok', last_sync_message = NULL, last_sync_count = ? WHERE id = ?`, [count, source.id]);
      catalogService.clear();
      return { code, count };
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      logger.warn({ code, message }, 'Job source sync failed');
      await exec(`UPDATE job_sources SET last_sync_at = UTC_TIMESTAMP(), last_sync_status = 'error', last_sync_message = ? WHERE id = ?`, [message, source.id]);
      throw new AppError(502, 'SOURCE_SYNC_FAILED', `Sync failed: ${message}`);
    }
  },
};

export function present(j: Record<string, unknown>) {
  const { skill_names, breakdown: _b, ...rest } = j;
  return { ...rest, is_saved: !!j.is_saved, is_demo: !!j.is_demo, skills: typeof skill_names === 'string' ? skill_names.split('|') : [] };
}
