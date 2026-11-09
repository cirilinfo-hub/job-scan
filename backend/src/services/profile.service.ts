import { z } from 'zod';
import { tx, one, query } from '../config/db';
import { userRepo } from '../repositories/user.repository';
import { profileSchema } from '../validators/auth.validators';

export const profileService = {
  async get(userId: number) {
    const [p, skills] = await Promise.all([userRepo.profile(userId), userRepo.userSkills(userId)]);
    const r = (p ?? {}) as Record<string, unknown>;
    return {
      headline: r.headline ?? null, phone: r.phone ?? null, location: r.location ?? null, targetTitle: r.target_title ?? null,
      yearsExperience: r.years_experience ?? null, seniority: r.seniority ?? null,
      preferredWorkMode: r.preferred_work_mode ?? 'any', preferredEmploymentType: r.preferred_employment_type ?? 'any',
      preferredLocation: r.preferred_location ?? null, industry: r.industry ?? null, salaryMin: r.salary_min ?? null,
      linkedinUrl: r.linkedin_url ?? null, websiteUrl: r.website_url ?? null, skills,
    };
  },

  async update(userId: number, b: z.infer<typeof profileSchema>) {
    await userRepo.upsertProfile(userId, {
      headline: b.headline ?? null, phone: b.phone ?? null, location: b.location ?? null, target_title: b.targetTitle ?? null,
      years_experience: b.yearsExperience ?? null, seniority: b.seniority ?? null,
      preferred_work_mode: b.preferredWorkMode, preferred_employment_type: b.preferredEmploymentType,
      preferred_location: b.preferredLocation ?? null, industry: b.industry ?? null, salary_min: b.salaryMin ?? null,
      linkedin_url: b.linkedinUrl ?? null, website_url: b.websiteUrl ?? null,
    });
    if (b.skillIds) await tx((db) => userRepo.setUserSkills(userId, b.skillIds!, db));
    return this.get(userId);
  },

  /** Each item is a real check against stored data, so the percentage can be explained to the user. */
  async completion(userId: number) {
    const p = await this.get(userId);
    const u = await userRepo.byId(userId);
    const resume = await one<{ c: number }>('SELECT COUNT(*) c FROM resumes WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    const items = [
      { key: 'email', label: 'Verify your email', done: !!u?.email_verified_at, link: '/profile' },
      { key: 'resume', label: 'Add a resume', done: (resume?.c ?? 0) > 0, link: '/resumes' },
      { key: 'title', label: 'Set a target job title', done: !!p.targetTitle, link: '/profile' },
      { key: 'location', label: 'Add your location', done: !!p.location, link: '/profile' },
      { key: 'experience', label: 'Add years of experience', done: p.yearsExperience !== null, link: '/profile' },
      { key: 'seniority', label: 'Choose a seniority level', done: !!p.seniority, link: '/profile' },
      { key: 'mode', label: 'Set your work-mode preference', done: p.preferredWorkMode !== 'any', link: '/profile' },
      { key: 'skills', label: 'List your skills', done: p.skills.length > 0, link: '/profile' },
    ];
    return { percent: Math.round((items.filter((i) => i.done).length / items.length) * 100), items };
  },

  searchSkills: (q: string) => query<{ id: number; name: string; type: string }>(
    `SELECT id, name, type FROM skills WHERE is_active = 1 AND name LIKE ? ORDER BY name LIMIT 20`, [`${q.replace(/[\\%_]/g, '\\$&')}%`]),
};
