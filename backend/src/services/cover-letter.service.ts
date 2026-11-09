import { z } from 'zod';
import { exec, one, query, tx } from '../config/db';
import { StructuredResume } from '../interfaces/resume';
import { PROMPTS } from '../integrations/ai/prompts';
import { resumeRepo, parseVersion } from '../repositories/resume.repository';
import { userRepo } from '../repositories/user.repository';
import { badRequest, notFound } from '../utils/errors';
import { aiService } from './ai.service';
import { countAny, findJobSkills, normalize } from './ats/text';
import { catalogService } from './catalog.service';
import { documentService } from './document.service';
import { ALLOWED_UPLOADS, safeFileName } from './file.service';

export const generateSchema = z.object({
  resumeVersionId: z.number().int().positive(),
  company: z.string().trim().min(1, 'Enter the company.').max(150),
  jobTitle: z.string().trim().min(1, 'Enter the job title.').max(200),
  jobDescription: z.string().trim().min(50, 'Paste the job description (at least 50 characters).').max(50000),
  tone: z.enum(['professional', 'confident', 'warm', 'concise']).default('professional'),
  mode: z.enum(['ai', 'template']).default('ai'),
});
export const editSchema = z.object({ body: z.string().trim().min(1).max(10000) });
export const regenSchema = z.object({ tone: z.enum(['professional', 'confident', 'warm', 'concise']).optional(), mode: z.enum(['ai', 'template']).default('ai') });

/** A fill-in draft built only from the resume. It's returned as source "template" and never labelled as AI. */
export async function templateDraft(r: StructuredResume, rawText: string, company: string, jobTitle: string, job: string): Promise<string> {
  const catalog = await catalogService.skills();
  const resume = normalize(rawText);
  const shared = findJobSkills(job, catalog).filter((f) => f.skill.type !== 'soft' && countAny(resume, f.skill.terms) > 0).slice(0, 5).map((f) => f.skill.name);
  const latest = r.experience?.[0];
  const intro = `Dear Hiring Team,\n\nI am writing to apply for the ${jobTitle} role at ${company}.${latest?.title ? ` I currently work as ${/^[aeiou]/i.test(latest.title) ? 'an' : 'a'} ${latest.title}${latest.company ? ` at ${latest.company}` : ''}.` : ''}`;
  const skills = shared.length ? `The role calls for ${shared.join(', ')}, all of which appear in my background.` : '[Describe the two or three requirements you meet best.]';
  const bullet = latest?.bullets?.[0];
  const evidence = bullet ? `For example, in my most recent role: ${bullet.replace(/\.$/, '')}.` : '[Add a specific achievement that relates to this role.]';
  const close = `[Add one sentence on why you want to work at ${company}.]\n\nThank you for considering my application. I would welcome the chance to discuss how I can contribute.\n\nSincerely,\n${r.personal?.fullName || '[Your name]'}`;
  return `${intro}\n\n${skills} ${evidence}\n\n${close}`;
}

async function requireLetter(userId: number, id: number) {
  const l = await one<Record<string, unknown> & { id: number; resume_version_id: number | null; company: string; job_title: string; job_description: string; tone: string }>(
    'SELECT * FROM cover_letters WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [id, userId]);
  if (!l) throw notFound('Cover letter');
  return l;
}

async function addVersion(letterId: number, body: string, source: string) {
  await tx(async (db) => {
    await query('SELECT id FROM cover_letters WHERE id = ? FOR UPDATE', [letterId], db);
    const next = (await one<{ n: number }>('SELECT COALESCE(MAX(version_no),0)+1 n FROM cover_letter_versions WHERE cover_letter_id = ?', [letterId], db))!.n;
    await exec('INSERT INTO cover_letter_versions (cover_letter_id, version_no, body, source) VALUES (?,?,?,?)', [letterId, next, body, source], db);
    await exec('UPDATE cover_letters SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [letterId], db);
  });
}

async function produce(userId: number, input: { versionId: number; company: string; jobTitle: string; job: string; tone: string; mode: 'ai' | 'template' }) {
  const raw = await resumeRepo.versionForUser(userId, input.versionId);
  if (!raw) throw badRequest('That resume version was not found.');
  const v = parseVersion(raw);
  if (input.mode === 'template') return { body: await templateDraft(v.structured, v.raw_text, input.company, input.jobTitle, input.job), source: 'template' };
  const out = await aiService.generate(PROMPTS.coverLetter, { tone: input.tone, jobTitle: input.jobTitle, company: input.company, resume: v.raw_text, job: input.job }, userId);
  return { body: out.body, source: 'ai' };
}

export const coverLetterService = {
  list: (userId: number) => query(
    `SELECT c.id, c.company, c.job_title, c.tone, c.updated_at, (SELECT COUNT(*) FROM cover_letter_versions v WHERE v.cover_letter_id = c.id) AS version_count,
       (SELECT v.source FROM cover_letter_versions v WHERE v.cover_letter_id = c.id ORDER BY v.version_no DESC LIMIT 1) AS latest_source
     FROM cover_letters c WHERE c.user_id = ? AND c.deleted_at IS NULL ORDER BY c.updated_at DESC`, [userId]),

  async get(userId: number, id: number) {
    const letter = await requireLetter(userId, id);
    const versions = await query('SELECT id, version_no, body, source, created_at FROM cover_letter_versions WHERE cover_letter_id = ? ORDER BY version_no DESC', [id]);
    return { ...letter, versions };
  },

  async generate(userId: number, b: z.infer<typeof generateSchema>) {
    const out = await produce(userId, { versionId: b.resumeVersionId, company: b.company, jobTitle: b.jobTitle, job: b.jobDescription, tone: b.tone, mode: b.mode });
    const res = await exec('INSERT INTO cover_letters (user_id, resume_version_id, company, job_title, job_description, tone) VALUES (?,?,?,?,?,?)', [userId, b.resumeVersionId, b.company, b.jobTitle, b.jobDescription, b.tone]);
    await addVersion(res.insertId, out.body, out.source);
    return this.get(userId, res.insertId);
  },

  async regenerate(userId: number, id: number, b: z.infer<typeof regenSchema>) {
    const l = await requireLetter(userId, id);
    if (!l.resume_version_id) throw badRequest('The resume used for this letter no longer exists.');
    const tone = b.tone ?? l.tone;
    const out = await produce(userId, { versionId: l.resume_version_id, company: l.company, jobTitle: l.job_title, job: l.job_description, tone, mode: b.mode });
    await exec('UPDATE cover_letters SET tone = ? WHERE id = ?', [tone, id]);
    await addVersion(id, out.body, out.source);
    return this.get(userId, id);
  },

  async saveEdit(userId: number, id: number, body: string) {
    await requireLetter(userId, id);
    await addVersion(id, body, 'manual');
    return this.get(userId, id);
  },

  async remove(userId: number, id: number) {
    await requireLetter(userId, id);
    await exec('UPDATE cover_letters SET deleted_at = UTC_TIMESTAMP() WHERE id = ?', [id]);
  },

  async exportFile(userId: number, id: number, format: 'pdf' | 'docx', versionId?: number) {
    const l = await requireLetter(userId, id);
    const v = await one<{ body: string }>(
      versionId ? 'SELECT body FROM cover_letter_versions WHERE cover_letter_id = ? AND id = ?' : 'SELECT body FROM cover_letter_versions WHERE cover_letter_id = ? ORDER BY version_no DESC LIMIT 1',
      versionId ? [id, versionId] : [id]);
    if (!v) throw notFound('Cover letter version');
    const sender = (await userRepo.byId(userId))?.full_name ?? '';
    const name = safeFileName(`Cover letter - ${l.company}`);
    return format === 'pdf'
      ? { buffer: await documentService.letterPdf(v.body, sender), mime: 'application/pdf', name: `${name}.pdf` }
      : { buffer: await documentService.letterDocx(v.body, sender), mime: ALLOWED_UPLOADS.docx, name: `${name}.docx` };
  },
};
