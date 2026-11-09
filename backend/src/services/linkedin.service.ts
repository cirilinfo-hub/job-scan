import { z } from 'zod';
import { exec, json, one, query } from '../config/db';
import { PROMPTS } from '../integrations/ai/prompts';
import { badRequest } from '../utils/errors';
import { aiService } from './ai.service';
import { countAny, extractKeywords, findJobSkills, normalize } from './ats/text';
import { catalogService } from './catalog.service';

const text = (max: number) => z.string().trim().max(max).default('');
export const profileBody = z.object({
  headline: text(300), about: text(5000), experience: text(20000), skills: text(5000), certifications: text(5000), education: text(5000), featured: text(5000),
  targetTitle: text(200), targetDescription: text(50000),
});
export type LinkedInInput = z.infer<typeof profileBody>;

export interface RuleCheck { section: string; status: 'good' | 'improve' | 'missing'; message: string; points: number; earned: number }

/** Length guidance here is our own editorial rule of thumb, shown as such. It isn't a LinkedIn measure. */
export async function analyzeProfile(p: LinkedInInput) {
  const catalog = await catalogService.skills();
  const all = normalize([p.headline, p.about, p.experience, p.skills, p.certifications, p.education, p.featured].join(' '));
  const checks: RuleCheck[] = [];
  const add = (section: string, points: number, earned: number, status: RuleCheck['status'], message: string) => checks.push({ section, status, message, points, earned });

  if (!p.headline) add('Headline', 15, 0, 'missing', 'Add a headline. It is one of the first things people see.');
  else if (p.targetTitle && countAny(normalize(p.headline), [p.targetTitle]) === 0) add('Headline', 15, 8, 'improve', `Consider including "${p.targetTitle}" if it fairly describes you.`);
  else add('Headline', 15, 15, 'good', 'Your headline includes your target role or is ready to review.');

  const aboutWords = p.about.split(/\s+/).filter(Boolean).length;
  if (!aboutWords) add('About', 20, 0, 'missing', 'Add an About section that says what you do and for whom.');
  else if (aboutWords < 60) add('About', 20, 10, 'improve', `Your About section has ${aboutWords} words. Aim for 100 or more, with a specific result.`);
  else add('About', 20, 20, 'good', `Your About section has ${aboutWords} words.`);

  const hasMetrics = /\d|%/.test(p.experience);
  if (!p.experience) add('Experience', 25, 0, 'missing', 'Add your roles and what you achieved in each.');
  else if (!hasMetrics) add('Experience', 25, 15, 'improve', 'Add real figures to show scale or results.');
  else add('Experience', 25, 25, 'good', 'Your experience includes figures.');

  const skillCount = p.skills.split(/[,\n]/).filter((s) => s.trim()).length;
  if (!skillCount) add('Skills', 15, 0, 'missing', 'List your skills.');
  else if (skillCount < 5) add('Skills', 15, 8, 'improve', `You listed ${skillCount} skills. Add others you genuinely have.`);
  else add('Skills', 15, 15, 'good', `You listed ${skillCount} skills.`);

  add('Certifications', 5, p.certifications ? 5 : 2, p.certifications ? 'good' : 'improve', p.certifications ? 'Certifications are listed.' : 'Add any certifications you hold. Skip this if you have none.');
  add('Education', 10, p.education ? 10 : 0, p.education ? 'good' : 'missing', p.education ? 'Education is listed.' : 'Add your education.');
  add('Featured', 10, p.featured ? 10 : 3, p.featured ? 'good' : 'improve', p.featured ? 'You have featured items.' : 'Feature a project, article or portfolio piece, if you have one.');

  let matched: string[] = [];
  let missing: string[] = [];
  if (p.targetDescription) {
    const skills = findJobSkills(p.targetDescription, catalog);
    matched = skills.filter((f) => countAny(all, f.skill.terms) > 0).map((f) => f.skill.name);
    missing = skills.filter((f) => countAny(all, f.skill.terms) === 0).map((f) => f.skill.name);
    const skillNames = skills.flatMap((f) => f.skill.terms);
    const other = extractKeywords(p.targetDescription, skillNames, 12).filter((k) => countAny(all, [k.term]) === 0).map((k) => k.term);
    missing = [...missing, ...other].slice(0, 20);
  }
  const score = checks.reduce((s, c) => s + c.earned, 0);
  return { score, checks, keywords: { matched, missing }, method: 'rule-based' as const, note: 'This is our own completeness checklist. It is not a LinkedIn score or ranking.' };
}

async function current(userId: number) {
  return one<Record<string, unknown> & { id: number }>('SELECT * FROM linkedin_profiles WHERE user_id = ?', [userId]);
}

export const linkedinService = {
  async get(userId: number) {
    const profile = await current(userId);
    const latest = profile ? await one<{ id: number; score: number; rule_report: unknown; ai_suggestions: unknown; created_at: Date }>('SELECT * FROM linkedin_analyses WHERE profile_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [profile.id]) : null;
    return {
      profile,
      analysis: latest ? { id: latest.id, score: latest.score, report: json(latest.rule_report, null), aiSuggestions: json(latest.ai_suggestions, null), createdAt: latest.created_at } : null,
      history: profile ? await query('SELECT id, score, created_at FROM linkedin_analyses WHERE profile_id = ? ORDER BY created_at DESC LIMIT 10', [profile.id]) : [],
    };
  },

  async save(userId: number, p: LinkedInInput) {
    await exec(
      `INSERT INTO linkedin_profiles (user_id, headline, about, experience, skills, certifications, education, featured, target_title, target_description) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE headline=VALUES(headline), about=VALUES(about), experience=VALUES(experience), skills=VALUES(skills), certifications=VALUES(certifications),
       education=VALUES(education), featured=VALUES(featured), target_title=VALUES(target_title), target_description=VALUES(target_description)`,
      [userId, p.headline, p.about, p.experience, p.skills, p.certifications, p.education, p.featured, p.targetTitle, p.targetDescription]);
    return (await current(userId))!;
  },

  async analyze(userId: number, p: LinkedInInput) {
    const profile = await this.save(userId, p);
    const report = await analyzeProfile(p);
    await exec('INSERT INTO linkedin_analyses (profile_id, score, rule_report) VALUES (?,?,CAST(? AS JSON))', [profile.id, report.score, JSON.stringify(report)]);
    return this.get(userId);
  },

  async aiSuggest(userId: number) {
    const profile = await current(userId);
    if (!profile) throw badRequest('Save your profile details first.');
    const out = await aiService.generate(PROMPTS.linkedin, {
      targetTitle: String(profile.target_title ?? ''), job: String(profile.target_description ?? ''),
      profile: JSON.stringify({ headline: profile.headline, about: profile.about, experience: profile.experience, skills: profile.skills, certifications: profile.certifications, education: profile.education, featured: profile.featured }),
    }, userId);
    await exec('UPDATE linkedin_analyses SET ai_suggestions = CAST(? AS JSON) WHERE profile_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [JSON.stringify(out), profile.id]);
    return this.get(userId);
  },
};
