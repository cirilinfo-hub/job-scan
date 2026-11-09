import { SkillEntry } from '../interfaces/resume';
import { countAny, normalize, tokens } from './ats/text';

export const MATCH_DISCLAIMER =
  'Match scores compare your resume and preferences with this listing using published rules. They are not a prediction of getting an interview or being hired.';

export const MATCH_WEIGHTS = { skills: 40, title: 20, experience: 15, seniority: 10, location: 10, employment: 5 };

export interface MatchProfile {
  resumeText: string;
  resumeTitles: string[];
  skills: string[];
  years: number | null;
  targetTitle: string | null;
  seniority: string | null;
  location: string | null;
  workMode: string;
  employmentType: string;
}

export interface MatchJob {
  title: string;
  description: string;
  location: string | null;
  work_mode: string;
  employment_type: string;
  experience_level: string;
  min_years: number | null;
  skills: { name: string; type: SkillEntry['type']; terms: string[]; required: boolean }[];
}

export interface MatchBreakdown {
  score: number;
  components: { key: string; label: string; weight: number; score: number | null; note: string }[];
  skillsMatched: string[];
  skillsMissing: string[];
  experienceGap: string | null;
  reasons: string[];
  improvements: string[];
  unknown: string[];
  method: 'rule-based';
  disclaimer: string;
}

const LEVELS = ['intern', 'entry', 'mid', 'senior', 'lead', 'executive'];
const SKIP = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal', 'ii', 'iii', 'of', 'the', 'and', 'remote']);
const titleWords = (s: string) => tokens(s).filter((t) => t.length > 1 && !SKIP.has(t));

export function scoreJobMatch(profile: MatchProfile, job: MatchJob): MatchBreakdown {
  const resume = normalize(`${profile.resumeText} ${profile.skills.join(' ')}`);
  const comps: MatchBreakdown['components'] = [];
  const unknown: string[] = [];

  // Skills.
  const matched: string[] = [];
  const missing: string[] = [];
  let possible = 0;
  let earned = 0;
  for (const s of job.skills) {
    const weight = (s.required ? 2 : 1) * (s.type === 'soft' ? 0.5 : 1);
    possible += weight;
    if (countAny(resume, s.terms) > 0) { earned += weight; matched.push(s.name); } else if (s.type !== 'soft') missing.push(s.name);
  }
  const skillsScore = possible ? Math.round((earned / possible) * 100) : null;
  if (skillsScore === null) unknown.push('skills listed by the job');
  comps.push({ key: 'skills', label: 'Skills', weight: MATCH_WEIGHTS.skills, score: skillsScore, note: possible ? `${matched.length} of ${job.skills.length} skills found` : 'No recognised skills in this listing' });

  // Title.
  const wanted = titleWords(job.title);
  const mine = new Set([...profile.resumeTitles, profile.targetTitle ?? ''].flatMap(titleWords));
  const titleScore = wanted.length && mine.size ? Math.round((wanted.filter((w) => mine.has(w)).length / wanted.length) * 100) : null;
  if (titleScore === null) unknown.push('your target or past job titles');
  comps.push({ key: 'title', label: 'Job title', weight: MATCH_WEIGHTS.title, score: titleScore, note: titleScore === null ? 'No titles to compare' : `${titleScore}% of title words overlap` });

  // Experience.
  let expScore: number | null = null;
  let experienceGap: string | null = null;
  if (job.min_years !== null && profile.years !== null) {
    expScore = Math.min(100, Math.round((profile.years / Math.max(job.min_years, 1)) * 100));
    if (profile.years < job.min_years) experienceGap = `The listing mentions ${job.min_years}+ years; your resume shows about ${profile.years}.`;
  } else {
    unknown.push(job.min_years === null ? 'years required by the job' : 'your years of experience');
  }
  comps.push({ key: 'experience', label: 'Experience', weight: MATCH_WEIGHTS.experience, score: expScore, note: expScore === null ? 'Not enough information' : `${profile.years} years vs ${job.min_years}+` });

  // Seniority.
  let senScore: number | null = null;
  if (profile.seniority && job.experience_level !== 'unknown') {
    const gap = Math.abs(LEVELS.indexOf(profile.seniority) - LEVELS.indexOf(job.experience_level));
    senScore = gap === 0 ? 100 : gap === 1 ? 60 : 20;
  } else unknown.push(profile.seniority ? 'seniority of the job' : 'your seniority');
  comps.push({ key: 'seniority', label: 'Seniority', weight: MATCH_WEIGHTS.seniority, score: senScore, note: senScore === null ? 'Not enough information' : `Job level: ${job.experience_level}` });

  // Location and work mode.
  let locScore: number | null = null;
  let locNote = 'Set your preferences in your profile';
  const anyMode = !profile.workMode || profile.workMode === 'any';
  if (!anyMode && job.work_mode !== 'unknown') {
    locScore = profile.workMode === job.work_mode ? 100 : 30;
    locNote = `Job is ${job.work_mode}; you prefer ${profile.workMode}`;
  } else if (profile.location && job.location) {
    locScore = normalize(job.location).includes(normalize(profile.location).split(',')[0]) || job.work_mode === 'remote' ? 100 : 40;
    locNote = `Job location: ${job.location}`;
  } else unknown.push('location or work-mode preference');
  comps.push({ key: 'location', label: 'Location', weight: MATCH_WEIGHTS.location, score: locScore, note: locNote });

  // Employment type.
  let empScore: number | null = null;
  if (profile.employmentType && profile.employmentType !== 'any' && job.employment_type !== 'unknown') {
    empScore = profile.employmentType === job.employment_type ? 100 : 30;
  } else unknown.push('employment-type preference');
  comps.push({ key: 'employment', label: 'Employment type', weight: MATCH_WEIGHTS.employment, score: empScore, note: job.employment_type.replace('_', ' ') });

  // Unknown components are excluded, and the remaining weights renormalised.
  const known = comps.filter((c) => c.score !== null);
  const totalWeight = known.reduce((s, c) => s + c.weight, 0);
  const score = totalWeight ? Math.round(known.reduce((s, c) => s + c.score! * c.weight, 0) / totalWeight) : 0;

  const reasons: string[] = [];
  if (matched.length) reasons.push(`You show ${matched.slice(0, 5).join(', ')}${matched.length > 5 ? ` and ${matched.length - 5} more` : ''}.`);
  if ((titleScore ?? 0) >= 60) reasons.push('Your titles are close to this role.');
  if (locScore === 100) reasons.push('It fits your location or work-mode preference.');
  if (empScore === 100) reasons.push('It fits your employment-type preference.');
  if (expScore !== null && expScore >= 100) reasons.push('Your experience meets the years mentioned.');

  const improvements: string[] = [];
  if (missing.length) improvements.push(`If you have them, add ${missing.slice(0, 5).join(', ')} to your resume. Otherwise treat them as skills to build.`);
  if (experienceGap) improvements.push('Highlight relevant projects and outcomes to offset the years gap.');
  if (unknown.some((u) => u.startsWith('your') || u.includes('preference'))) improvements.push('Complete your profile preferences for a more specific comparison.');

  return { score, components: comps, skillsMatched: matched, skillsMissing: missing, experienceGap, reasons, improvements, unknown, method: 'rule-based', disclaimer: MATCH_DISCLAIMER };
}
