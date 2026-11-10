import fs from 'node:fs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { exec, one, pool } from '../src/config/db';
import { env } from '../src/config/env';
import { AiProvider, setAiProviderForTests } from '../src/integrations/ai/provider';
import { emptyResume } from '../src/interfaces/resume';
import { DEFAULT_SCORING_RULES } from '../src/services/ats/rules';
import { hashPassword } from '../src/services/auth.service';
import { catalogService } from '../src/services/catalog.service';
import { documentService } from '../src/services/document.service';
import { ingestJob } from '../src/services/job.service';
import { runReminders } from '../src/services/scheduler.service';
import { settingsService } from '../src/services/settings.service';

const app = createApp();
const API = '/api/v1';
const PASSWORD = 'Str0ng-password-1';
let seq = 0;

async function register(name = 'Test User') {
  const email = `user${Date.now()}${++seq}@example.com`;
  const res = await request(app).post(`${API}/auth/register`).send({ email, password: PASSWORD, fullName: name });
  expect(res.status).toBe(201);
  return { email, id: res.body.data.user.id as number, token: res.body.data.accessToken as string, cookie: res.headers['set-cookie'] as unknown as string[] };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const RESUME_DATA = {
  ...emptyResume(),
  personal: { fullName: 'Ana Silva', email: 'ana@example.com', phone: '+1 555 000 1111', location: 'Chicago, IL', linkedin: '', website: '' },
  summary: 'Software engineer focused on web products.',
  experience: [{ title: 'Software Engineer', company: 'Acme', startDate: 'Jan 2018', endDate: '', current: true, bullets: ['Responsible for the TypeScript billing app', 'Reduced latency by 30%'] }],
  education: [{ degree: 'Bachelor of Science', institution: 'State University', year: '2017' }],
  skills: ['TypeScript', 'Angular'],
};
const JOB = 'Software Engineer\nRequirements:\n5+ years of professional experience with TypeScript and Angular.\nKubernetes is required.\nGood communication.';

const upload = async (token: string, buffer: Buffer, filename: string) =>
  request(app).post(`${API}/resumes`).set(auth(token)).attach('file', buffer, filename).field('title', 'My resume').field('category', 'Engineering');

async function createResume(token: string) {
  const res = await request(app).post(`${API}/resume-builder`).set(auth(token)).send({ title: 'Built resume', template: 'modern', structured: RESUME_DATA });
  expect(res.status).toBe(201);
  return res.body.data as { resume: { id: number }; version: { id: number } };
}

beforeAll(async () => { catalogService.clear(); settingsService.clearCache(); });
afterEach(() => setAiProviderForTests(null));
afterAll(async () => {
  await pool.end();
  fs.rmSync(env.storageDir, { recursive: true, force: true });
});

describe('platform', () => {
  it('reports health and uses the error envelope', async () => {
    const health = await request(app).get('/api/health');
    expect(health.body.database).toBe('ok');
    const missing = await request(app).get(`${API}/nope`);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
  it('sets security headers and publishes OpenAPI', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const spec = await request(app).get(`${API}/openapi.json`);
    expect(spec.body.paths['/resume-scanner']).toBeDefined();
  });
  it('requires auth on every module', async () => {
    for (const p of ['/users/me', '/dashboard', '/resumes', '/resume-scanner', '/jobs', '/job-matching', '/job-tracker', '/cover-letters', '/linkedin', '/interviews/sessions', '/notifications', '/admin/overview']) {
      expect((await request(app).get(API + p)).status, p).toBe(401);
    }
  });
});

describe('authentication', () => {
  it('registers without leaking the hash and sets a secure-flagged cookie', async () => {
    const res = await request(app).post(`${API}/auth/register`).send({ email: `new${Date.now()}@example.com`, password: PASSWORD, fullName: 'New Person' });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('password');
    expect(res.body.data.user.roles).toEqual(['job_seeker']);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });
  it('validates input and rejects duplicates', async () => {
    const bad = await request(app).post(`${API}/auth/register`).send({ email: 'nope', password: 'short', fullName: 'x' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['email', 'password', 'fullName']));
    const { email } = await register();
    expect((await request(app).post(`${API}/auth/register`).send({ email, password: PASSWORD, fullName: 'Dup User' })).status).toBe(409);
  });
  it('logs in, and gives the same error for a wrong password and an unknown email', async () => {
    const { email } = await register();
    expect((await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD })).status).toBe(200);
    const wrong = await request(app).post(`${API}/auth/login`).send({ email, password: 'wrong-password-1' });
    const unknown = await request(app).post(`${API}/auth/login`).send({ email: 'ghost@example.com', password: 'wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
  it('locks an account after repeated failures', async () => {
    const { email } = await register();
    for (let i = 0; i < 5; i++) await request(app).post(`${API}/auth/login`).send({ email, password: 'wrong-password-1' });
    const res = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
    expect(res.status).toBe(423);
  });
  it('rejects tampered tokens', async () => {
    const { token } = await register();
    expect((await request(app).get(`${API}/users/me`).set(auth(`${token}x`))).status).toBe(401);
  });
  it('rotates refresh tokens, requires the CSRF header, and detects replay', async () => {
    const { cookie } = await register();
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie)).status).toBe(403);
    const first = await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).set('X-Requested-With', 'rolewise');
    expect(first.status).toBe(200);
    const next = first.headers['set-cookie'] as unknown as string[];
    expect(next[0]).not.toEqual(cookie[0]);
    // Age the rotation past the two-tab grace window, then replay the old token.
    await exec('UPDATE user_sessions SET rotated_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE rotated_at IS NOT NULL');
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', cookie).set('X-Requested-With', 'rolewise')).status).toBe(401);
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', next).set('X-Requested-With', 'rolewise')).status).toBe(401);
  });
  it('resets a password with a single-use token and revokes sessions', async () => {
    const u = await register();
    const crypto = await import('node:crypto');
    const token = 'known-reset-token-value';
    await exec(`INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'reset_password', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`, [u.id, crypto.createHash('sha256').update(token).digest('hex')]);
    const next = 'Another-strong-pass-2';
    expect((await request(app).post(`${API}/auth/reset-password`).send({ token, password: next })).status).toBe(200);
    expect((await request(app).post(`${API}/auth/reset-password`).send({ token, password: next })).status).toBe(400);
    expect((await request(app).post(`${API}/auth/login`).send({ email: u.email, password: next })).status).toBe(200);
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', u.cookie).set('X-Requested-With', 'rolewise')).status).toBe(401);
  });
  it('verifies email with a token', async () => {
    const u = await register();
    const crypto = await import('node:crypto');
    const token = `verify-token-${u.id}`;
    await exec(`INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'verify_email', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`, [u.id, crypto.createHash('sha256').update(token).digest('hex')]);
    await request(app).post(`${API}/auth/verify-email`).send({ token }).expect(200);
    expect((await request(app).get(`${API}/users/me`).set(auth(u.token))).body.data.emailVerified).toBe(true);
  });
  it('does not reveal whether an email exists on forgot password', async () => {
    const { email } = await register();
    const a = await request(app).post(`${API}/auth/forgot-password`).send({ email });
    const b = await request(app).post(`${API}/auth/forgot-password`).send({ email: 'ghost@example.com' });
    expect(a.body).toEqual(b.body);
  });
  it('blocks a suspended user immediately', async () => {
    const u = await register();
    await exec(`UPDATE users SET status = 'suspended' WHERE id = ?`, [u.id]);
    expect((await request(app).get(`${API}/users/me`).set(auth(u.token))).status).toBe(401);
  });
});

describe('resume manager', () => {
  it('uploads a real PDF, extracts text and parses it', async () => {
    const { token } = await register();
    const pdf = await documentService.resumePdf(RESUME_DATA, 'classic');
    const res = await upload(token, pdf, 'cv.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data.version.raw_text).toContain('Ana Silva');
    expect(res.body.data.version.structured.personal.email).toBe('ana@example.com');
    expect(res.body.data.version.format_signals.kind).toBe('pdf');
    expect(res.body.data.resume.is_default).toBe(1);
    expect(res.body.data.version.file_path).not.toContain('cv.pdf');
  });
  it('uploads a real DOCX', async () => {
    const { token } = await register();
    const res = await upload(token, await documentService.resumeDocx(RESUME_DATA, 'modern'), 'cv.docx');
    expect(res.status).toBe(201);
    expect(res.body.data.version.raw_text).toContain('Ana Silva');
    expect(res.body.data.version.structured.skills.join(' ')).toContain('TypeScript');
  });
  it('rejects disguised, unsupported, oversized and corrupt files', async () => {
    const { token } = await register();
    expect((await upload(token, Buffer.from('<script>alert(1)</script>'), 'cv.pdf')).status).toBe(400);
    expect((await upload(token, Buffer.from('hello'), 'cv.exe')).status).toBe(400);
    expect((await upload(token, Buffer.alloc(env.maxUploadBytes + 1, 1), 'cv.pdf')).status).toBe(413);
    expect((await upload(token, Buffer.from('%PDF-1.4 not really a pdf'), 'cv.pdf')).status).toBe(422);
  });
  it('keeps versions, restores them, and downloads each format', async () => {
    const { token } = await register();
    const { resume } = await createResume(token);
    const saved = await request(app).post(`${API}/resumes/${resume.id}/versions`).set(auth(token)).send({ structured: { ...RESUME_DATA, summary: 'Edited summary' }, label: 'Edit' });
    expect(saved.body.data.version.version_no).toBe(2);
    expect(saved.body.data.version.raw_text).toContain('Edited summary');
    const v1 = saved.body.data.versions.find((v: { version_no: number }) => v.version_no === 1);
    const restored = await request(app).post(`${API}/resumes/${resume.id}/versions/${v1.id}/restore`).set(auth(token));
    expect(restored.body.data.version.version_no).toBe(3);
    expect(restored.body.data.version.structured.summary).toBe(RESUME_DATA.summary);
    const pdf = await request(app).get(`${API}/resumes/${resume.id}/download?format=pdf`).set(auth(token));
    expect(pdf.headers['content-type']).toContain('pdf');
    expect(pdf.headers['cache-control']).toContain('no-store');
    const docx = await request(app).get(`${API}/resumes/${resume.id}/download?format=docx`).set(auth(token)).buffer(true);
    expect(docx.status).toBe(200);
    expect((await request(app).get(`${API}/resumes/${resume.id}/download?format=original`).set(auth(token))).status).toBe(404);
  });
  it('downloads an original upload for the owner only', async () => {
    const a = await register();
    const b = await register();
    const pdf = await documentService.resumePdf(RESUME_DATA, 'classic');
    const id = (await upload(a.token, pdf, 'cv.pdf')).body.data.resume.id;
    const res = await request(app).get(`${API}/resumes/${id}/download?format=original`).set(auth(a.token)).buffer(true);
    expect(res.status).toBe(200);
    expect((await request(app).get(`${API}/resumes/${id}/download?format=original`).set(auth(b.token))).status).toBe(404);
  });
  it('moves the default when the default resume is deleted', async () => {
    const { token } = await register();
    const first = await createResume(token);
    const second = await createResume(token);
    await request(app).delete(`${API}/resumes/${first.resume.id}`).set(auth(token)).expect(200);
    const list = await request(app).get(`${API}/resumes`).set(auth(token));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(second.resume.id);
    expect(list.body.data[0].is_default).toBe(1);
  });
  it("blocks access to another user's data across modules", async () => {
    const a = await register();
    const b = await register();
    const { resume } = await createResume(a.token);
    const scan = await request(app).post(`${API}/resume-scanner`).set(auth(a.token)).send({ resumeId: resume.id, jobTitle: 'Engineer', jobDescription: JOB });
    const appRes = await request(app).post(`${API}/job-tracker`).set(auth(a.token)).send({ company: 'Acme', jobTitle: 'Engineer' });
    for (const p of [`/resumes/${resume.id}`, `/resume-scanner/${scan.body.data.id}`, `/job-tracker/${appRes.body.data.id}`]) {
      expect((await request(app).get(API + p).set(auth(b.token))).status, p).toBe(404);
      expect((await request(app).delete(API + p).set(auth(b.token))).status, p).toBe(404);
    }
    expect((await request(app).post(`${API}/resume-scanner`).set(auth(b.token)).send({ resumeId: resume.id, jobTitle: 'Engineer', jobDescription: JOB })).status).toBe(404);
  });
});

describe('ATS scanner', () => {
  it('runs a scan, stores keywords and allows exclusions', async () => {
    const { token } = await register();
    const { resume } = await createResume(token);
    const res = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send({ resumeId: resume.id, company: 'Acme', jobTitle: 'Software Engineer', jobDescription: JOB });
    expect(res.status).toBe(201);
    const report = res.body.data.report;
    expect(report.method).toBe('rule-based');
    expect(report.lines).toHaveLength(6);
    expect(report.disclaimer).toMatch(/not the score of any employer/);
    expect(report.keywords.find((k: { term: string }) => k.term === 'Kubernetes').status).toBe('missing');
    expect(res.body.data.rules).toEqual(DEFAULT_SCORING_RULES);
    const rows = await one<{ c: number }>('SELECT COUNT(*) c FROM resume_keywords WHERE scan_id = ?', [res.body.data.id]);
    expect(rows?.c).toBeGreaterThan(0);
    const excl = await request(app).put(`${API}/resume-scanner/${res.body.data.id}/excluded-terms`).set(auth(token)).send({ excluded: ['Kubernetes'] });
    expect(excl.body.data.report.overall).toBeGreaterThan(report.overall);
    expect(excl.body.data.excluded_terms).toEqual(['Kubernetes']);
  });
  it('validates input', async () => {
    const { token } = await register();
    const { resume } = await createResume(token);
    const res = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send({ resumeId: resume.id, jobTitle: 'X', jobDescription: 'short' });
    expect(res.status).toBe(422);
  });
  it('enforces plan limits', async () => {
    const { token, id } = await register();
    const { resume } = await createResume(token);
    await exec(`INSERT INTO subscription_plans (code, name, limits) VALUES ('tiny', 'Tiny', '{"scans_per_month":1,"resumes":5}') ON DUPLICATE KEY UPDATE limits = VALUES(limits)`);
    await exec(`INSERT INTO subscriptions (user_id, plan_id) SELECT ?, id FROM subscription_plans WHERE code = 'tiny'`, [id]);
    const body = { resumeId: resume.id, jobTitle: 'Engineer', jobDescription: JOB };
    expect((await request(app).post(`${API}/resume-scanner`).set(auth(token)).send(body)).status).toBe(201);
    const blocked = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send(body);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('LIMIT_REACHED');
  });
});

describe('AI integrity', () => {
  it('returns AI_UNAVAILABLE rather than placeholder content when no provider is set', async () => {
    const { token } = await register();
    const { resume, version } = await createResume(token);
    const scan = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send({ resumeId: resume.id, jobTitle: 'Engineer', jobDescription: JOB });
    const calls = [
      request(app).post(`${API}/resume-optimizer/resumes/${resume.id}/ai-suggestions`).set(auth(token)),
      request(app).post(`${API}/cover-letters`).set(auth(token)).send({ resumeVersionId: version.id, company: 'Acme', jobTitle: 'Engineer', jobDescription: JOB }),
      request(app).post(`${API}/resume-scanner/${scan.body.data.id}/ai-keywords`).set(auth(token)),
      request(app).post(`${API}/interviews/questions/generate`).set(auth(token)).send({ jobTitle: 'Engineer' }),
    ];
    for (const c of calls) {
      const res = await c;
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    }
  });
  it('keeps core features working without AI', async () => {
    const { token } = await register();
    const { resume, version } = await createResume(token);
    const load = await request(app).get(`${API}/resume-optimizer/resumes/${resume.id}`).set(auth(token));
    expect(load.body.data.ai.available).toBe(false);
    expect(load.body.data.suggestions.every((s: { source: string }) => s.source === 'rule')).toBe(true);
    const letter = await request(app).post(`${API}/cover-letters`).set(auth(token)).send({ resumeVersionId: version.id, company: 'Acme', jobTitle: 'Engineer', jobDescription: JOB, mode: 'template' });
    expect(letter.status).toBe(201);
    expect(letter.body.data.versions[0].source).toBe('template');
  });
  it('validates provider output, logs usage, and retries once on bad JSON', async () => {
    const { token, id } = await register();
    const { version } = await createResume(token);
    let calls = 0;
    const fake: AiProvider = { name: 'test-double', isConfigured: () => true, complete: async () => {
      calls += 1;
      return { text: calls === 1 ? 'not json' : JSON.stringify({ body: 'A letter long enough to pass the schema validation rule for letters.' }), model: 'test-model', inputTokens: 10, outputTokens: 5 };
    } };
    setAiProviderForTests(fake);
    const res = await request(app).post(`${API}/cover-letters`).set(auth(token)).send({ resumeVersionId: version.id, company: 'Acme', jobTitle: 'Engineer', jobDescription: JOB });
    expect(res.status).toBe(201);
    expect(calls).toBe(2);
    expect(res.body.data.versions[0].source).toBe('ai');
    const usage = await one<{ c: number; t: number }>(`SELECT COUNT(*) c, SUM(input_tokens) t FROM usage_logs WHERE user_id = ? AND is_ai = 1`, [id]);
    expect(usage?.c).toBe(2);
    expect(Number(usage?.t)).toBe(20);
  });
  it('reports an error when the provider keeps returning invalid output', async () => {
    const { token, id } = await register();
    const { version } = await createResume(token);
    setAiProviderForTests({ name: 'test-double', isConfigured: () => true, complete: async () => ({ text: '{"wrong":true}', model: 'm', inputTokens: 1, outputTokens: 1 }) });
    const res = await request(app).post(`${API}/cover-letters`).set(auth(token)).send({ resumeVersionId: version.id, company: 'Acme', jobTitle: 'Engineer', jobDescription: JOB });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AI_BAD_OUTPUT');
    expect((await one<{ c: number }>('SELECT COUNT(*) c FROM cover_letters WHERE user_id = ?', [id]))?.c).toBe(0);
  });
  it('never inserts AI content without acceptance, and requires confirmation for claims', async () => {
    const { token } = await register();
    const { resume } = await createResume(token);
    setAiProviderForTests({ name: 'test-double', isConfigured: () => true, complete: async () => ({
      text: JSON.stringify({ suggestions: [
        { kind: 'skill', sectionPath: 'skills', original: null, suggested: 'Kubernetes', rationale: 'Job mentions it', needsConfirmation: false },
        { kind: 'summary', sectionPath: 'summary', original: RESUME_DATA.summary, suggested: 'A better summary.', rationale: 'Clearer', needsConfirmation: false },
      ] }), model: 'm', inputTokens: 1, outputTokens: 1 }) });
    const gen = await request(app).post(`${API}/resume-optimizer/resumes/${resume.id}/ai-suggestions`).set(auth(token));
    expect(gen.status).toBe(200);
    const skill = gen.body.data.find((s: { suggested: string }) => s.suggested === 'Kubernetes');
    const summary = gen.body.data.find((s: { suggested: string }) => s.suggested === 'A better summary.');
    expect(skill.needsConfirmation).toBe(true);
    expect((await request(app).get(`${API}/resumes/${resume.id}`).set(auth(token))).body.data.version.structured.skills).not.toContain('Kubernetes');
    const noConfirm = await request(app).post(`${API}/resume-optimizer/suggestions/${skill.id}/decision`).set(auth(token)).send({ status: 'accepted', structured: RESUME_DATA });
    expect(noConfirm.status).toBe(400);
    const ok = await request(app).post(`${API}/resume-optimizer/suggestions/${skill.id}/decision`).set(auth(token)).send({ status: 'accepted', confirmed: true, structured: RESUME_DATA });
    expect(ok.body.data.structured.skills).toContain('Kubernetes');
    // Accepting changes only the draft. The stored resume changes when the user saves.
    expect((await request(app).get(`${API}/resumes/${resume.id}`).set(auth(token))).body.data.version.structured.skills).not.toContain('Kubernetes');
    const edited = await request(app).post(`${API}/resume-optimizer/suggestions/${summary.id}/decision`).set(auth(token)).send({ status: 'accepted', finalText: 'My own wording.', structured: ok.body.data.structured });
    expect(edited.body.data.structured.summary).toBe('My own wording.');
    const saved = await request(app).post(`${API}/resume-optimizer/resumes/${resume.id}/save`).set(auth(token)).send({ structured: edited.body.data.structured, label: 'Optimized' });
    expect(saved.body.data.version.change_source).toBe('optimizer');
    expect(saved.body.data.version.structured.skills).toContain('Kubernetes');
  });
  it('recalculates scores for a draft without saving', async () => {
    const { token } = await register();
    const { resume } = await createResume(token);
    const scan = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send({ resumeId: resume.id, jobTitle: 'Software Engineer', jobDescription: JOB });
    const res = await request(app).post(`${API}/resume-optimizer/rescore`).set(auth(token)).send({ scanId: scan.body.data.id, structured: { ...RESUME_DATA, skills: [...RESUME_DATA.skills, 'Kubernetes'] } });
    expect(res.body.data.after).toBeGreaterThan(res.body.data.before);
    expect((await request(app).get(`${API}/resume-scanner`).set(auth(token))).body.data).toHaveLength(1);
  });
});

describe('jobs and matching', () => {
  let jobId: number;
  beforeAll(async () => {
    await exec(`INSERT INTO job_sources (code, name, attribution) VALUES ('testsrc', 'Test source', 'Test') ON DUPLICATE KEY UPDATE id = id`);
    const s = await one<{ id: number }>(`SELECT id FROM job_sources WHERE code = 'testsrc'`);
    jobId = await ingestJob(s!.id, { externalId: 'a1', title: 'Senior TypeScript Engineer', company: 'Globex', description: 'Requirements: 3+ years of experience with TypeScript and Angular. Kubernetes required. Fully distributed team building logistics software.', location: 'Remote', workMode: 'remote', employmentType: 'full_time', salaryMin: 100000, salaryMax: 120000, applyUrl: 'https://example.com/a1' });
    await ingestJob(s!.id, { externalId: 'a2', title: 'Pastry Chef', company: 'Bakery', description: 'Bake things every morning for hungry customers in our shop.', location: 'Paris', workMode: 'onsite', employmentType: 'part_time' });
  });
  it('drops unsafe links from job sources', async () => {
    const s = await one<{ id: number }>(`SELECT id FROM job_sources WHERE code = 'testsrc'`);
    const id = await ingestJob(s!.id, { externalId: 'bad', title: 'Link Test', company: 'Evil', description: 'A job with a bad link in its data feed for testing.', applyUrl: 'javascript:alert(1)', companyLogo: 'javascript:alert(2)' });
    const row = await one<{ apply_url: string | null }>('SELECT apply_url FROM jobs WHERE id = ?', [id]);
    expect(row?.apply_url).toBeNull();
    await exec('DELETE FROM jobs WHERE id = ?', [id]);
  });
  it('re-ingests the same listing without duplicating', async () => {
    const s = await one<{ id: number }>(`SELECT id FROM job_sources WHERE code = 'testsrc'`);
    const again = await ingestJob(s!.id, { externalId: 'a1', title: 'Senior TypeScript Engineer', company: 'Globex', description: 'Requirements: 3+ years of experience with TypeScript and Angular. Kubernetes required.', location: 'Remote', workMode: 'remote', employmentType: 'full_time', salaryMin: 100000, salaryMax: 120000, applyUrl: 'https://example.com/a1' });
    expect(again).toBe(jobId);
  });
  it('searches and filters', async () => {
    const { token } = await register();
    const get = (qs: string) => request(app).get(`${API}/jobs?${qs}`).set(auth(token));
    expect((await get('workMode=remote')).body.data.every((j: { work_mode: string }) => j.work_mode === 'remote')).toBe(true);
    expect((await get('company=Bakery')).body.data[0].title).toBe('Pastry Chef');
    expect((await get('title=Chef')).body.meta.total).toBe(1);
    expect((await get('minSalary=110000')).body.data.map((j: { id: number }) => j.id)).toEqual([jobId]);
    expect((await get("q=' OR 1=1 --")).status).toBe(200);
    expect((await get('workMode=remote&sort=DROP')).status).toBe(422);
    const first = (await get('workMode=remote')).body.data[0];
    expect(first.skills.length).toBeGreaterThan(0);
  });
  it('saves and unsaves a job', async () => {
    const { token } = await register();
    await request(app).post(`${API}/jobs/${jobId}/save`).set(auth(token)).expect(200);
    expect((await request(app).get(`${API}/jobs?saved=true`).set(auth(token))).body.meta.total).toBe(1);
    await request(app).delete(`${API}/jobs/${jobId}/save`).set(auth(token)).expect(200);
    expect((await request(app).get(`${API}/jobs?saved=true`).set(auth(token))).body.meta.total).toBe(0);
  });
  it('ranks relevant jobs first and explains them', async () => {
    const { token } = await register();
    await createResume(token);
    const res = await request(app).get(`${API}/job-matching`).set(auth(token));
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(items[0].id).toBe(jobId);
    expect(items[0].breakdown.skillsMatched).toEqual(expect.arrayContaining(['TypeScript', 'Angular']));
    expect(items[0].breakdown.skillsMissing).toContain('Kubernetes');
    expect(res.body.data.disclaimer).toMatch(/not a prediction/);
    const high = await request(app).get(`${API}/job-matching?minScore=99`).set(auth(token));
    expect(high.body.meta.total).toBeLessThan(items.length);
  });
  it('shows no match data without a resume', async () => {
    const { token } = await register();
    const res = await request(app).get(`${API}/job-matching`).set(auth(token));
    expect(res.body.data.hasProfile).toBe(false);
    expect(res.body.data.items).toEqual([]);
  });
  it('adds a listing to the tracker with its description', async () => {
    const { token } = await register();
    const res = await request(app).post(`${API}/job-tracker/from-job`).set(auth(token)).send({ jobId });
    expect(res.status).toBe(201);
    expect(res.body.data.company).toBe('Globex');
    expect(res.body.data.job_description).toContain('TypeScript');
    expect(res.body.data.application_url).toBe('https://example.com/a1');
  });
});

describe('job tracker', () => {
  const add = async (token: string, company: string) => (await request(app).post(`${API}/job-tracker`).set(auth(token)).send({ company, jobTitle: 'Engineer' })).body.data;
  const column = async (token: string, status: string) => (await request(app).get(`${API}/job-tracker`).set(auth(token))).body.data.items.filter((i: { status: string }) => i.status === status).map((i: { company: string }) => i.company);

  it('moves cards between stages and records history', async () => {
    const { token } = await register();
    const a = await add(token, 'A');
    expect(a.applied_at).toBeNull();
    const moved = await request(app).post(`${API}/job-tracker/${a.id}/move`).set(auth(token)).send({ status: 'applied', index: 0 });
    expect(moved.status).toBe(200);
    const detail = (await request(app).get(`${API}/job-tracker/${a.id}`).set(auth(token))).body.data;
    expect(detail.status).toBe('applied');
    expect(detail.applied_at).not.toBeNull();
    expect(detail.history.map((h: { to_status: string }) => h.to_status)).toEqual(['applied', 'saved']);
  });
  it('reorders within a column', async () => {
    const { token } = await register();
    const a = await add(token, 'A');
    await add(token, 'B');
    const c = await add(token, 'C');
    expect(await column(token, 'saved')).toEqual(['A', 'B', 'C']);
    await request(app).post(`${API}/job-tracker/${c.id}/move`).set(auth(token)).send({ status: 'saved', index: 0 });
    expect(await column(token, 'saved')).toEqual(['C', 'A', 'B']);
    await request(app).post(`${API}/job-tracker/${a.id}/move`).set(auth(token)).send({ status: 'saved', index: 2 });
    expect(await column(token, 'saved')).toEqual(['C', 'B', 'A']);
  });
  it('counts an application that skips the Applied stage', async () => {
    const { token } = await register();
    const a = await add(token, 'A');
    await request(app).post(`${API}/job-tracker/${a.id}/move`).set(auth(token)).send({ status: 'interview', index: 0 });
    const dash = await request(app).get(`${API}/dashboard`).set(auth(token));
    expect(dash.body.data.stats.applicationsSubmitted).toBe(1);
    const b = await add(token, 'B');
    await request(app).post(`${API}/job-tracker/${b.id}/move`).set(auth(token)).send({ status: 'rejected', index: 0 });
    expect((await request(app).get(`${API}/dashboard`).set(auth(token))).body.data.stats.applicationsSubmitted).toBe(1);
  });
  it('rejects an invalid stage', async () => {
    const { token } = await register();
    const a = await add(token, 'A');
    expect((await request(app).post(`${API}/job-tracker/${a.id}/move`).set(auth(token)).send({ status: 'hired', index: 0 })).status).toBe(422);
  });
  it('manages notes and interviews', async () => {
    const { token } = await register();
    const a = await add(token, 'A');
    const notes = await request(app).post(`${API}/job-tracker/${a.id}/notes`).set(auth(token)).send({ body: 'Called recruiter' });
    expect(notes.body.data[0].body).toBe('Called recruiter');
    await request(app).delete(`${API}/job-tracker/${a.id}/notes/${notes.body.data[0].id}`).set(auth(token)).expect(200);
    const at = new Date(Date.now() + 2 * 36e5).toISOString();
    const iv = await request(app).post(`${API}/job-tracker/${a.id}/interviews`).set(auth(token)).send({ scheduledAt: at, kind: 'phone', location: 'Zoom' });
    expect(iv.body.data[0].kind).toBe('phone');
    const dash = await request(app).get(`${API}/dashboard`).set(auth(token));
    expect(dash.body.data.upcomingInterviews[0].company).toBe('A');
    expect(dash.body.data.stats.interviewsScheduled).toBe(1);
  });
  it("refuses another user's resume version", async () => {
    const a = await register();
    const b = await register();
    const { version } = await createResume(a.token);
    expect((await request(app).post(`${API}/job-tracker`).set(auth(b.token)).send({ company: 'X', jobTitle: 'Y', resumeVersionId: version.id })).status).toBe(400);
  });
  it('rejects unsafe application links', async () => {
    const { token } = await register();
    expect((await request(app).post(`${API}/job-tracker`).set(auth(token)).send({ company: 'X', jobTitle: 'Y', applicationUrl: 'javascript:alert(1)' })).status).toBe(422);
  });
});

describe('notifications', () => {
  it('creates reminders once and lets users clear them', async () => {
    const { token, id } = await register();
    const a = (await request(app).post(`${API}/job-tracker`).set(auth(token)).send({ company: 'Acme', jobTitle: 'Engineer', followUpAt: new Date(Date.now() - 36e5).toISOString() })).body.data;
    await request(app).post(`${API}/job-tracker/${a.id}/interviews`).set(auth(token)).send({ scheduledAt: new Date(Date.now() + 36e5).toISOString(), kind: 'phone' });
    await exec('UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?', [id]);
    await runReminders();
    await runReminders();
    const res = await request(app).get(`${API}/notifications`).set(auth(token));
    const types = res.body.data.map((n: { type: string }) => n.type);
    expect(types.filter((t: string) => t === 'follow_up')).toHaveLength(1);
    expect(types.filter((t: string) => t === 'interview')).toHaveLength(1);
    expect(types).toContain('profile_reminder');
    expect(res.body.meta.unreadCount).toBe(res.body.data.length);
    await request(app).post(`${API}/notifications/${res.body.data[0].id}/read`).set(auth(token)).expect(200);
    expect((await request(app).get(`${API}/notifications/unread-count`).set(auth(token))).body.data.count).toBe(res.body.data.length - 1);
    await request(app).post(`${API}/notifications/read-all`).set(auth(token)).expect(200);
    expect((await request(app).get(`${API}/notifications/unread-count`).set(auth(token))).body.data.count).toBe(0);
  });
});

describe('dashboard', () => {
  it('returns computed values and honours date filters', async () => {
    const { token } = await register();
    const a = (await request(app).post(`${API}/job-tracker`).set(auth(token)).send({ company: 'Acme', jobTitle: 'Engineer' })).body.data;
    await request(app).post(`${API}/job-tracker/${a.id}/move`).set(auth(token)).send({ status: 'applied', index: 0 });
    const now = await request(app).get(`${API}/dashboard?days=30`).set(auth(token));
    expect(now.status).toBe(200);
    expect(now.body.data.stats.applicationsSubmitted).toBe(1);
    expect(now.body.data.stats.latestAtsScore).toBeNull();
    expect(now.body.data.weeklyActivity.reduce((s: number, w: { count: number }) => s + w.count, 0)).toBe(1);
    const past = await request(app).get(`${API}/dashboard?from=2020-01-01&to=2020-02-01`).set(auth(token));
    expect(past.body.data.stats.applicationsSubmitted).toBe(0);
    expect((await request(app).get(`${API}/dashboard?from=2021-01-01&to=2020-01-01`).set(auth(token))).status).toBe(400);
  });
});

describe('linkedin and interviews', () => {
  it('analyzes manually supplied profile data', async () => {
    const { token } = await register();
    const res = await request(app).post(`${API}/linkedin/analyze`).set(auth(token)).send({ headline: 'Engineer', about: 'Short', skills: 'TypeScript', targetTitle: 'Platform Engineer', targetDescription: 'We need TypeScript and Kubernetes for a platform.' });
    expect(res.status).toBe(200);
    expect(res.body.data.analysis.report.method).toBe('rule-based');
    expect(res.body.data.analysis.report.note).toMatch(/not a LinkedIn score/);
    expect(res.body.data.analysis.report.keywords.matched).toContain('TypeScript');
    expect(res.body.data.analysis.report.keywords.missing).toContain('Kubernetes');
  });
  it('runs a mock session with rule feedback', async () => {
    const { token } = await register();
    const qs = await request(app).get(`${API}/interviews/questions?category=behavioral`).set(auth(token));
    expect(qs.body.data.length).toBeGreaterThan(0);
    const session = await request(app).post(`${API}/interviews/sessions`).set(auth(token)).send({ title: 'Practice', questionIds: [qs.body.data[0].id] });
    expect(session.status).toBe(201);
    const answerId = session.body.data.answers[0].id;
    const saved = await request(app).put(`${API}/interviews/sessions/${session.body.data.id}/answers/${answerId}`).set(auth(token)).send({ answer: 'When our release slipped, I needed to recover it. I reviewed the plan and as a result we shipped 2 weeks early.' });
    const fb = saved.body.data.answers[0].rule_feedback;
    expect(fb.method).toBe('rule-based');
    expect(fb.star.result).toBe(true);
    const done = await request(app).post(`${API}/interviews/sessions/${session.body.data.id}/complete`).set(auth(token));
    expect(done.body.data.status).toBe('completed');
  });
});

describe('administration', () => {
  let admin: string;
  let superAdmin: string;
  const makeAdmin = async (role: string) => {
    const email = `${role}${Date.now()}${++seq}@example.com`;
    const res = await exec('INSERT INTO users (email, password_hash, full_name) VALUES (?,?,?)', [email, await hashPassword(PASSWORD), role]);
    await exec('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [res.insertId, role]);
    const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
    return { token: login.body.data.accessToken as string, id: res.insertId };
  };
  beforeAll(async () => { admin = (await makeAdmin('admin')).token; superAdmin = (await makeAdmin('super_admin')).token; });

  it('denies job seekers', async () => {
    const { token } = await register();
    for (const p of ['/admin/overview', '/admin/users', '/admin/logs', '/admin/ai']) expect((await request(app).get(API + p).set(auth(token))).status, p).toBe(403);
  });
  it('separates admin and super admin powers', async () => {
    const target = await register();
    const blocked = await request(app).patch(`${API}/admin/users/${target.id}`).set(auth(admin)).send({ roles: ['admin'] });
    expect(blocked.status).toBe(403);
    expect((await request(app).put(`${API}/admin/features`).set(auth(admin)).send({ ai: false })).status).toBe(403);
    expect((await request(app).patch(`${API}/admin/users/${target.id}`).set(auth(superAdmin)).send({ roles: ['admin'] })).status).toBe(200);
    const anotherAdmin = await request(app).patch(`${API}/admin/users/${target.id}`).set(auth(admin)).send({ status: 'suspended' });
    expect(anotherAdmin.status).toBe(403);
  });
  it('stops a super admin from locking themselves out', async () => {
    const s = await makeAdmin('super_admin');
    expect((await request(app).patch(`${API}/admin/users/${s.id}`).set(auth(s.token)).send({ status: 'suspended' })).status).toBe(400);
    expect((await request(app).patch(`${API}/admin/users/${s.id}`).set(auth(s.token)).send({ roles: ['job_seeker'] })).status).toBe(400);
  });
  it('suspends a user, ends their sessions, and writes the audit log', async () => {
    const target = await register();
    await request(app).patch(`${API}/admin/users/${target.id}`).set(auth(admin)).send({ status: 'suspended' }).expect(200);
    expect((await request(app).get(`${API}/users/me`).set(auth(target.token))).status).toBe(401);
    expect((await request(app).post(`${API}/auth/refresh`).set('Cookie', target.cookie).set('X-Requested-With', 'rolewise')).status).toBe(401);
    const logs = await request(app).get(`${API}/admin/logs?action=user.update`).set(auth(admin));
    expect(logs.body.data[0].target).toBe(`user:${target.id}`);
  });
  it('searches and sorts users safely', async () => {
    const res = await request(app).get(`${API}/admin/users?sort=email&dir=asc&q=example`).set(auth(admin));
    expect(res.status).toBe(200);
    expect((await request(app).get(`${API}/admin/users?sort=password_hash`).set(auth(admin))).status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });
  it('returns metrics', async () => {
    const res = await request(app).get(`${API}/admin/overview?days=30`).set(auth(admin));
    expect(res.body.data.totalUsers).toBeGreaterThan(0);
    expect(res.body.data.ai.calls).toBeGreaterThanOrEqual(0);
  });
  it('honestly reports AI as unconfigured and never exposes keys', async () => {
    const res = await request(app).get(`${API}/admin/ai`).set(auth(admin));
    expect(res.body.data.configured).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/api.?key":/i);
    const test = await request(app).post(`${API}/admin/ai/test`).set(auth(superAdmin));
    expect(test.body.data.ok).toBe(false);
  });
  it('reports a job source that needs credentials rather than pretending to sync', async () => {
    const sources = (await request(app).get(`${API}/admin/job-sources`).set(auth(admin))).body.data;
    const adzuna = sources.find((s: { code: string }) => s.code === 'adzuna');
    expect(adzuna.missingConfig).toContain('ADZUNA_APP_ID');
    const sync = await request(app).post(`${API}/admin/job-sources/${adzuna.id}/sync`).set(auth(admin));
    expect(sync.status).toBe(400);
    expect(sync.body.error.code).toBe('SOURCE_NOT_CONFIGURED');
  });
  it('applies scoring rule changes to new scans only', async () => {
    const { token } = await register();
    const { resume } = await createResume(token);
    const body = { resumeId: resume.id, jobTitle: 'Engineer', jobDescription: JOB };
    const before = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send(body);
    const rules = { ...DEFAULT_SCORING_RULES, weights: { skills: 100, keywords: 0, experience: 0, title: 0, formatting: 0, education: 0 } };
    await request(app).put(`${API}/admin/scoring-rules`).set(auth(superAdmin)).send(rules).expect(200);
    const after = await request(app).post(`${API}/resume-scanner`).set(auth(token)).send(body);
    expect(after.body.data.rules.weights.skills).toBe(100);
    expect((await request(app).get(`${API}/resume-scanner/${before.body.data.id}`).set(auth(token))).body.data.rules.weights.skills).toBe(35);
    await request(app).put(`${API}/admin/scoring-rules`).set(auth(superAdmin)).send(DEFAULT_SCORING_RULES).expect(200);
    expect((await request(app).put(`${API}/admin/scoring-rules`).set(auth(superAdmin)).send({ weights: {} })).status).toBe(422);
  });
  it('enforces feature switches on the server and publishes them', async () => {
    const { token } = await register();
    await request(app).put(`${API}/admin/features`).set(auth(superAdmin)).send({ ai: true, registration: false, job_search: false, linkedin: false, interview_prep: false, cover_letters: false, resume_builder: false }).expect(200);
    for (const p of ['/jobs', '/job-matching', '/linkedin', '/interviews/guide', '/cover-letters', '/resume-builder/templates']) {
      const res = await request(app).get(API + p).set(auth(token));
      expect(res.status, p).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_DISABLED');
    }
    expect((await request(app).post(`${API}/auth/register`).send({ email: `closed${Date.now()}@example.com`, password: PASSWORD, fullName: 'No Entry' })).status).toBe(403);
    expect((await request(app).get(`${API}/config`)).body.data.features.job_search).toBe(false);
    await request(app).put(`${API}/admin/features`).set(auth(superAdmin)).send({ ai: true, registration: true, job_search: true, linkedin: true, interview_prep: true, cover_letters: true, resume_builder: true }).expect(200);
  });
  it('publishes the announcement and support email without sign-in', async () => {
    await request(app).put(`${API}/admin/settings`).set(auth(superAdmin)).send({ supportEmail: 'help@example.com', announcement: 'Maintenance on Friday' }).expect(200);
    const res = await request(app).get(`${API}/config`);
    expect(res.body.data).toMatchObject({ supportEmail: 'help@example.com', announcement: 'Maintenance on Friday' });
    await request(app).put(`${API}/admin/settings`).set(auth(superAdmin)).send({ supportEmail: '', announcement: '' }).expect(200);
  });
  it('turning the AI feature off stops AI even when a provider exists', async () => {
    const { token } = await register();
    const { version } = await createResume(token);
    setAiProviderForTests({ name: 'test-double', isConfigured: () => true, complete: async () => ({ text: '{"body":"this should not be returned to anybody at all ok"}', model: 'm', inputTokens: 1, outputTokens: 1 }) });
    await request(app).put(`${API}/admin/features`).set(auth(superAdmin)).send({ ai: false }).expect(200);
    const res = await request(app).post(`${API}/cover-letters`).set(auth(token)).send({ resumeVersionId: version.id, company: 'A', jobTitle: 'B', jobDescription: JOB });
    expect(res.status).toBe(503);
    await request(app).put(`${API}/admin/features`).set(auth(superAdmin)).send({ ai: true }).expect(200);
  });
});
