import { z } from 'zod';
import { tx } from '../config/db';
import { jobRepo } from '../repositories/job.repository';
import { resumeRepo } from '../repositories/resume.repository';
import { STAGES, Stage, trackerRepo } from '../repositories/tracker.repository';
import { badRequest, notFound } from "../utils/errors";

const url = z.string().trim().max(1000).refine((v) => !v || /^https?:\/\//i.test(v), 'Links must start with http:// or https://').nullable().optional().transform((v) => v || null);
const text = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const date = z.coerce.date().nullable().optional();

export const appBase = {
  company: z.string().trim().min(1, 'Enter the company.').max(150),
  jobTitle: z.string().trim().min(1, 'Enter the job title.').max(200),
  location: text(150), salary: text(80), applicationUrl: url, jobDescription: text(50000),
  resumeVersionId: z.number().int().positive().nullable().optional(), coverLetterId: z.number().int().positive().nullable().optional(),
  appliedAt: date, followUpAt: date,
};
export const createAppSchema = z.object({ ...appBase, status: z.enum(STAGES).default('saved'), jobId: z.number().int().positive().nullable().optional() });
export const updateAppSchema = z.object(appBase);
export const fromJobSchema = z.object({ jobId: z.number().int().positive(), resumeVersionId: z.number().int().positive().nullable().optional() });
export const moveSchema = z.object({ status: z.enum(STAGES), index: z.number().int().min(0) });
export const noteSchema = z.object({ body: z.string().trim().min(1, 'Write a note first.').max(5000) });
export const interviewSchema = z.object({ scheduledAt: z.coerce.date(), kind: z.string().trim().min(1).max(40).default('interview'), location: text(255), notes: text(5000) });

async function checkVersion(userId: number, versionId: number | null | undefined) {
  if (versionId && !(await resumeRepo.versionForUser(userId, versionId))) throw badRequest('That resume version was not found.');
}

const nextPosition = (col: { position: number }[], index: number) => {
  const i = Math.min(index, col.length);
  const before = col[i - 1]?.position;
  const after = col[i]?.position;
  if (before === undefined && after === undefined) return 1024;
  if (before === undefined) return after! / 2;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
};

async function requireApp(userId: number, id: number) {
  const a = await trackerRepo.byId(userId, id);
  if (!a) throw notFound('Application');
  return a;
}

export const trackerService = {
  board: async (userId: number) => ({ stages: STAGES, items: await trackerRepo.list(userId), followUps: await trackerRepo.followUpsDue(userId, 3) }),

  async get(userId: number, id: number) {
    const a = await requireApp(userId, id);
    const [history, notes, interviews] = await Promise.all([trackerRepo.history(id), trackerRepo.notes(id), trackerRepo.interviews(id)]);
    return { ...a, history, notes, interviews };
  },

  async create(userId: number, b: z.infer<typeof createAppSchema>) {
    await checkVersion(userId, b.resumeVersionId);
    const id = await tx(async (db) => {
      const col = await trackerRepo.column(userId, b.status, 0, db);
      const newId = await trackerRepo.create(userId, {
        job_id: b.jobId ?? null, company: b.company, job_title: b.jobTitle, location: b.location ?? null, salary: b.salary ?? null,
        application_url: b.applicationUrl ?? null, job_description: b.jobDescription ?? null, resume_version_id: b.resumeVersionId ?? null,
        cover_letter_id: b.coverLetterId ?? null, status: b.status, position: nextPosition(col, col.length),
        applied_at: b.appliedAt ?? (b.status === 'saved' ? null : new Date()), follow_up_at: b.followUpAt ?? null,
      }, db);
      await trackerRepo.addHistory(newId, null, b.status, db);
      return newId;
    });
    return this.get(userId, id);
  },

  /** Copies listing details so the record survives after the source removes the listing. */
  async createFromJob(userId: number, jobId: number, resumeVersionId: number | null | undefined) {
    const job = await jobRepo.byId(userId, jobId) as Record<string, string | number | null> | null;
    if (!job) throw notFound('Job');
    const salary = job.salary_min || job.salary_max ? [job.salary_min, job.salary_max].filter(Boolean).join(' - ') + (job.salary_currency ? ` ${job.salary_currency}` : '') : null;
    return this.create(userId, {
      jobId, company: String(job.company ?? 'Unknown company'), jobTitle: String(job.title), location: job.location as string | null, salary,
      applicationUrl: job.apply_url as string | null, jobDescription: job.description as string | null, resumeVersionId, status: 'saved',
      coverLetterId: null, appliedAt: null, followUpAt: null,
    });
  },

  async update(userId: number, id: number, b: z.infer<typeof updateAppSchema>) {
    await requireApp(userId, id);
    await checkVersion(userId, b.resumeVersionId);
    await trackerRepo.update(id, {
      company: b.company, job_title: b.jobTitle, location: b.location ?? null, salary: b.salary ?? null, application_url: b.applicationUrl ?? null,
      job_description: b.jobDescription ?? null, resume_version_id: b.resumeVersionId ?? null, cover_letter_id: b.coverLetterId ?? null,
      applied_at: b.appliedAt ?? null, follow_up_at: b.followUpAt ?? null, follow_up_notified_at: null,
    });
    return this.get(userId, id);
  },

  async move(userId: number, id: number, status: Stage, index: number) {
    return tx(async (db) => {
      const a = await trackerRepo.byId(userId, id, db);
      if (!a) throw notFound('Application');
      const col = await trackerRepo.column(userId, status, id, db);
      const position = nextPosition(col, index);
      const changes: Record<string, string | number | Date | null> = { status, position };
      if (status !== 'saved' && status !== 'rejected' && !a.applied_at) changes.applied_at = new Date();
      await trackerRepo.update(id, changes, db);
      if (a.status !== status) await trackerRepo.addHistory(id, a.status, status, db);
      return { id, status, position };
    });
  },

  async remove(userId: number, id: number) { await requireApp(userId, id); await trackerRepo.softDelete(id); },

  async addNote(userId: number, id: number, body: string) { await requireApp(userId, id); await trackerRepo.addNote(id, body); return trackerRepo.notes(id); },
  async removeNote(userId: number, id: number, noteId: number) {
    await requireApp(userId, id);
    const res = await trackerRepo.removeNote(id, noteId);
    if (!res.affectedRows) throw notFound('Note');
  },
  async addInterview(userId: number, id: number, b: z.infer<typeof interviewSchema>) {
    await requireApp(userId, id);
    await trackerRepo.addInterview(id, b.scheduledAt, b.kind, b.location ?? null, b.notes ?? null);
    return trackerRepo.interviews(id);
  },
  async updateInterview(userId: number, id: number, interviewId: number, b: z.infer<typeof interviewSchema>) {
    await requireApp(userId, id);
    const res = await trackerRepo.updateInterview(id, interviewId, b.scheduledAt, b.kind, b.location ?? null, b.notes ?? null);
    if (!res.affectedRows) throw notFound('Interview');
    return trackerRepo.interviews(id);
  },
  async removeInterview(userId: number, id: number, interviewId: number) {
    await requireApp(userId, id);
    const res = await trackerRepo.removeInterview(id, interviewId);
    if (!res.affectedRows) throw notFound('Interview');
  },
};

