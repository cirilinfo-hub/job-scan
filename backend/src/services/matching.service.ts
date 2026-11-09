import { json, one } from '../config/db';
import { StructuredResume } from '../interfaces/resume';
import { PROMPTS } from '../integrations/ai/prompts';
import { jobRepo } from '../repositories/job.repository';
import { parseVersion, resumeRepo } from '../repositories/resume.repository';
import { userRepo } from '../repositories/user.repository';
import { notFound } from '../utils/errors';
import { aiService } from './ai.service';
import { evidencedYears } from './ats/scorer';
import { normalize } from './ats/text';
import { MatchProfile, scoreJobMatch, MATCH_DISCLAIMER, MATCH_WEIGHTS } from './match-engine';
import { present } from './job.service';

const MAX_JOBS = 1000;
const STALE_MS = 6 * 36e5;

async function buildProfile(userId: number): Promise<{ profile: MatchProfile; versionId: number | null } | null> {
  const resume = await resumeRepo.defaultFor(userId);
  const raw = resume?.current_version_id ? await resumeRepo.version(resume.id, resume.current_version_id) : null;
  const skills = await userRepo.userSkills(userId);
  const p = (await userRepo.profile(userId)) as Record<string, unknown> | null;
  if (!raw && !skills.length) return null;
  const version = raw ? parseVersion(raw) : null;
  const structured = version?.structured as StructuredResume | undefined;
  const stated = p?.years_experience as number | null | undefined;
  return {
    versionId: version?.id ?? null,
    profile: {
      resumeText: version?.raw_text ?? '',
      resumeTitles: structured?.experience?.map((e) => e.title).filter(Boolean) ?? [],
      skills: [...skills.map((s) => s.name), ...(structured?.skills ?? [])],
      years: stated ?? (structured ? evidencedYears(structured, version!.raw_text) : null),
      targetTitle: (p?.target_title as string) ?? null,
      seniority: (p?.seniority as string) ?? null,
      location: (p?.preferred_location as string) ?? (p?.location as string) ?? null,
      workMode: (p?.preferred_work_mode as string) ?? 'any',
      employmentType: (p?.preferred_employment_type as string) ?? 'any',
    },
  };
}

export const matchingService = {
  /** Recalculates when the resume changed, the data is old, or new jobs arrived. */
  async ensureFresh(userId: number, force = false): Promise<void> {
    const built = await buildProfile(userId);
    if (!built) return;
    const meta = await jobRepo.matchMeta(userId);
    const active = (await one<{ c: number }>('SELECT COUNT(*) c FROM (SELECT id FROM jobs WHERE is_active = 1 LIMIT ?) t', [MAX_JOBS]))?.c ?? 0;
    const fresh = meta?.computed_at && Date.now() - meta.computed_at.getTime() < STALE_MS && meta.version_id === built.versionId && meta.c >= active;
    if (fresh && !force) return;
    const jobs = await jobRepo.jobsForMatching(MAX_JOBS);
    const skillRows = await jobRepo.skillsForJobs(jobs.map((j) => j.id));
    const byJob = new Map<number, typeof skillRows>();
    for (const s of skillRows) byJob.set(s.job_id, [...(byJob.get(s.job_id) ?? []), s]);
    const rows = jobs.map((j) => {
      const breakdown = scoreJobMatch(built.profile, {
        ...j,
        skills: (byJob.get(j.id) ?? []).map((s) => ({
          name: s.name, type: s.type, required: !!s.is_required,
          terms: [...new Set([s.name, ...json<string[]>(s.aliases, [])].map(normalize))],
        })),
      });
      return { jobId: j.id, score: breakdown.score, breakdown };
    });
    for (let i = 0; i < rows.length; i += 200) await jobRepo.upsertMatches(userId, built.versionId, rows.slice(i, i + 200));
  },

  async best(userId: number, minScore: number, page: number, pageSize: number) {
    await this.ensureFresh(userId);
    const built = await buildProfile(userId);
    const [items, total] = await Promise.all([
      jobRepo.matchList(userId, minScore, pageSize, (page - 1) * pageSize),
      jobRepo.matchCount(userId, minScore),
    ]);
    return {
      items: (items as Record<string, unknown>[]).map((j) => ({ ...present(j), breakdown: jobRepo.parseBreakdown(j.breakdown) })),
      total, hasProfile: !!built, weights: MATCH_WEIGHTS, disclaimer: MATCH_DISCLAIMER,
    };
  },

  async aiExplain(userId: number, jobId: number) {
    const job = await jobRepo.byId(userId, jobId) as Record<string, unknown> | null;
    if (!job) throw notFound('Job');
    const resume = await resumeRepo.defaultFor(userId);
    const raw = resume?.current_version_id ? await resumeRepo.version(resume.id, resume.current_version_id) : null;
    if (!raw) throw notFound('Resume');
    return aiService.generate(PROMPTS.jobFit, { resume: raw.raw_text, job: `${job.title}\n${job.description}` }, userId);
  },
};
