import { FormatSignals, SkillEntry, StructuredResume } from '../../interfaces/resume';
import { ScoringRules, SCORE_DISCLAIMER } from './rules';
import { countAny, countTerm, extractKeywords, findJobSkills, normalize, tokens } from './text';

export interface ScanInput {
  resumeText: string;
  structured: StructuredResume;
  formatSignals?: FormatSignals | null;
  jobTitle: string;
  jobDescription: string;
  catalog: SkillEntry[];
  rules: ScoringRules;
  excludedTerms?: string[];
}

export interface KeywordRow {
  term: string;
  category: 'hard' | 'soft' | 'tool' | 'certification' | 'keyword';
  status: 'matched' | 'missing' | 'recommended';
  required: boolean;
  jobCount: number;
  resumeCount: number;
}

export interface ScoreLine { key: string; label: string; score: number; weight: number; formula: string; detail: string }
export interface Warning { code: string; severity: 'info' | 'warning' | 'critical'; message: string; deduction: number }
export interface Suggestion { area: string; message: string }

export interface ScanReport {
  overall: number;
  lines: ScoreLine[];
  keywords: KeywordRow[];
  warnings: Warning[];
  suggestions: Suggestion[];
  sections: Record<string, boolean>;
  experience: { requiredYears: number | null; evidencedYears: number | null };
  education: { required: string | null; found: string | null };
  achievements: { bullets: number; quantified: number };
  softSkills: { matched: string[]; missing: string[] };
  disclaimer: string;
  method: 'rule-based';
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Largest year count stated as a requirement; ignores company-age sentences that don't mention experience. */
export function requiredYears(job: string): number | null {
  const re = /(\d{1,2})\s*(?:\+|\s*(?:-|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b[^.\n]{0,60}/gi;
  let best: number | null = null;
  for (const m of job.matchAll(re)) {
    const n = Number(m[1]);
    if (n > 0 && n <= 25 && /experience|background|working|professional|hands[- ]on/i.test(m[0])) {
      best = best === null ? n : Math.max(best, n);
    }
  }
  return best;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

export function parseDate(s: string | undefined, now = new Date()): Date | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (/present|current|now|today/.test(t)) return now;
  const named = t.match(/([a-z]{3,9})\.?\s+(\d{4})/);
  if (named && MONTHS[named[1].slice(0, 3)] !== undefined) return new Date(Date.UTC(Number(named[2]), MONTHS[named[1].slice(0, 3)], 1));
  const numeric = t.match(/(\d{1,2})[/-](\d{4})/);
  if (numeric) return new Date(Date.UTC(Number(numeric[2]), Number(numeric[1]) - 1, 1));
  const iso = t.match(/(\d{4})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, 1));
  const year = t.match(/\b(19|20)\d{2}\b/);
  return year ? new Date(Date.UTC(Number(year[0]), 0, 1)) : null;
}

/** Sums dated roles, merging overlaps so concurrent jobs aren't double-counted. */
export function evidencedYears(resume: StructuredResume, text: string, now = new Date()): number | null {
  const ranges = resume.experience
    .map((e) => ({ s: parseDate(e.startDate, now), e: e.current ? now : parseDate(e.endDate, now) }))
    .filter((r): r is { s: Date; e: Date } => !!r.s && !!r.e && r.e >= r.s)
    .sort((a, b) => a.s.getTime() - b.s.getTime());
  if (ranges.length) {
    let total = 0;
    let curStart = ranges[0].s.getTime();
    let curEnd = ranges[0].e.getTime();
    for (const r of ranges.slice(1)) {
      if (r.s.getTime() <= curEnd) curEnd = Math.max(curEnd, r.e.getTime());
      else { total += curEnd - curStart; curStart = r.s.getTime(); curEnd = r.e.getTime(); }
    }
    total += curEnd - curStart;
    return Math.round((total / (365.25 * 864e5)) * 10) / 10;
  }
  const stated = text.match(/(\d{1,2})\+?\s*years?\s+(?:of\s+)?(?:\w+\s+){0,2}experience/i);
  return stated ? Number(stated[1]) : null;
}

const DEGREES: { level: number; label: string; re: RegExp }[] = [
  { level: 4, label: 'Doctorate', re: /\b(ph\.?\s?d|doctorate|doctoral)\b/i },
  { level: 3, label: "Master's", re: /\b(master'?s?|m\.?sc|mba|m\.?tech|m\.?e\.|m\.?s\.)(?![a-z])/i },
  { level: 2, label: "Bachelor's", re: /\b(bachelor'?s?|b\.?sc|b\.?tech|b\.?e\.|b\.?a\.|b\.?s\.|undergraduate degree)(?![a-z])/i },
  { level: 1, label: 'Associate', re: /\b(associate'?s? degree|diploma)\b/i },
];

function degreeLevels(text: string) { return DEGREES.filter((d) => d.re.test(text)); }

function formattingCheck(input: ScanInput, wordCount: number) {
  const { structured: r, formatSignals: f, rules } = input;
  const d = rules.deductions;
  const warnings: Warning[] = [];
  const add = (cond: boolean, code: string, severity: Warning['severity'], message: string, deduction: number) => {
    if (cond) warnings.push({ code, severity, message, deduction });
  };
  add(!r.personal.email, 'missing_email', 'critical', 'No email address was found. Add one at the top of your resume.', d.missingEmail);
  add(!r.personal.phone, 'missing_phone', 'warning', 'No phone number was found.', d.missingPhone);
  add(!r.summary, 'missing_summary', 'info', 'There is no summary section. A short one helps readers see your focus.', d.missingSummary);
  add(!r.experience.length, 'missing_experience', 'critical', 'No work experience section was recognised. Use a standard heading such as "Experience".', d.missingExperience);
  add(!r.education.length, 'missing_education', 'warning', 'No education section was recognised. Use a standard heading such as "Education".', d.missingEducation);
  add(!r.skills.length, 'missing_skills', 'warning', 'No skills section was recognised. Use a standard heading such as "Skills".', d.missingSkills);
  add(wordCount < 150, 'too_short', 'warning', `Your resume has about ${wordCount} words, which is short for most roles.`, d.tooShort);
  add(wordCount > 1200, 'too_long', 'info', `Your resume has about ${wordCount} words. Consider trimming older or less relevant detail.`, d.tooLong);
  if (f) {
    add((f.images ?? 0) + (f.tables ?? 0) > 0, 'images_or_tables', 'warning',
      'The file contains images or tables. Some parsers read these poorly, so keep key information in plain text.', d.imagesOrTables);
    add(f.kind === 'pdf' && f.charCount < 200, 'low_text_pdf', 'critical',
      'Very little text could be read from this PDF. It may be a scanned image, which many systems cannot read.', d.lowTextPdf);
  } else {
    warnings.push({ code: 'no_file_checks', severity: 'info', message: 'File-level checks such as images and tables were skipped because this version has no uploaded file.', deduction: 0 });
  }
  return { score: clamp(100 - warnings.reduce((s, w) => s + w.deduction, 0)), warnings };
}

export function scoreResume(input: ScanInput): ScanReport {
  const { rules } = input;
  const excluded = new Set((input.excludedTerms ?? []).map(normalize));
  const resume = normalize(input.resumeText);
  const words = tokens(input.resumeText).length;
  const jobFound = findJobSkills(input.jobDescription, input.catalog).filter((f) => !excluded.has(normalize(f.skill.name)));

  // Skills: weighted share found. Required skills count more; soft skills count less.
  const keywords: KeywordRow[] = [];
  let possible = 0;
  let earned = 0;
  let hardRequiredMissing = 0;
  const softMatched: string[] = [];
  const softMissing: string[] = [];
  for (const f of jobFound) {
    const resumeCount = countAny(resume, f.skill.terms);
    const isSoft = f.skill.type === 'soft';
    const weight = (f.required ? rules.requiredSkillMultiplier : 1) * (isSoft ? rules.softSkillWeight : 1);
    possible += weight;
    if (resumeCount > 0) earned += weight;
    if (isSoft) (resumeCount > 0 ? softMatched : softMissing).push(f.skill.name);
    if (resumeCount === 0 && f.required && !isSoft) hardRequiredMissing += 1;
    keywords.push({
      term: f.skill.name, category: f.skill.type,
      status: resumeCount > 0 ? 'matched' : f.required ? 'missing' : 'recommended',
      required: f.required, jobCount: f.jobCount, resumeCount,
    });
  }
  const noSkills = possible === 0;
  const skillsScore = noSkills ? rules.neutralExperienceScore : clamp((earned / possible) * 100);

  // Keywords: top non-skill terms.
  const skillTerms = jobFound.flatMap((f) => f.skill.terms);
  const jobKeywords = extractKeywords(`${input.jobTitle}\n${input.jobDescription}`, skillTerms).filter((k) => !excluded.has(k.term));
  let kwFound = 0;
  for (const k of jobKeywords) {
    const resumeCount = countTerm(resume, k.term);
    if (resumeCount > 0) kwFound += 1;
    keywords.push({
      term: k.term, category: 'keyword',
      status: resumeCount > 0 ? 'matched' : k.count >= 2 ? 'missing' : 'recommended',
      required: false, jobCount: k.count, resumeCount,
    });
  }
  const keywordScore = jobKeywords.length ? clamp((kwFound / jobKeywords.length) * 100) : rules.neutralExperienceScore;

  // Experience.
  const needYears = requiredYears(input.jobDescription);
  const haveYears = evidencedYears(input.structured, input.resumeText);
  let experienceScore: number;
  let experienceDetail: string;
  if (needYears === null) {
    experienceScore = rules.neutralExperienceScore;
    experienceDetail = 'The job states no year requirement, so a neutral score is used.';
  } else if (haveYears === null) {
    experienceScore = rules.unverifiedExperienceScore;
    experienceDetail = `The job asks for ${needYears}+ years, but no dated roles could be read from your resume.`;
  } else {
    experienceScore = clamp((haveYears / needYears) * 100);
    experienceDetail = `The job asks for ${needYears}+ years; dated roles on your resume total about ${haveYears}.`;
  }

  // Job title.
  const title = normalize(input.jobTitle);
  const titleTokens = tokens(input.jobTitle).filter((t) => t.length > 1 && !['senior', 'junior', 'sr', 'jr', 'lead', 'ii', 'iii', 'of'].includes(t));
  const resumeTitles = normalize(input.structured.experience.map((e) => e.title).join(' | '));
  const phraseInTitles = !!title && countTerm(resumeTitles, input.jobTitle) > 0;
  const phraseAnywhere = !!title && countTerm(resume, input.jobTitle) > 0;
  const titleOverlap = titleTokens.length ? titleTokens.filter((t) => countTerm(resumeTitles || resume, t) > 0).length / titleTokens.length : 0;
  const titleScore = phraseInTitles ? 100 : phraseAnywhere ? Math.max(85, clamp(titleOverlap * 100)) : clamp(titleOverlap * 80);

  // Education.
  const needDegrees = degreeLevels(input.jobDescription);
  const needDegree = needDegrees.length ? needDegrees.reduce((a, b) => (a.level < b.level ? a : b)) : null;
  const eduText = input.structured.education.map((e) => `${e.degree} ${e.field ?? ''}`).join(' ') || input.resumeText;
  const haveDegrees = degreeLevels(eduText);
  const haveDegree = haveDegrees.length ? haveDegrees.reduce((a, b) => (a.level > b.level ? a : b)) : null;
  let educationScore = 100;
  let educationDetail = 'The job states no degree requirement.';
  if (needDegree) {
    if (!haveDegree) { educationScore = 30; educationDetail = `The job mentions a ${needDegree.label} degree; no degree was recognised on your resume.`; }
    else if (haveDegree.level >= needDegree.level) { educationDetail = `The job mentions a ${needDegree.label} degree; your resume shows ${haveDegree.label}.`; }
    else { educationScore = 60; educationDetail = `The job mentions a ${needDegree.label} degree; your resume shows ${haveDegree.label}.`; }
  }

  const fmt = formattingCheck(input, words);

  const w = rules.weights;
  const totalWeight = w.skills + w.keywords + w.experience + w.title + w.formatting + w.education;
  const lines: ScoreLine[] = [
    { key: 'skills', label: 'Skills', score: skillsScore, weight: w.skills,
      formula: `Share of the job's skills found. Required skills count ${rules.requiredSkillMultiplier}x; soft skills count ${rules.softSkillWeight}x.`,
      detail: noSkills ? 'No catalogued skills were found in the job description, so a neutral score is used.' : `${keywords.filter((k) => k.category !== 'keyword' && k.status === 'matched').length} of ${jobFound.length} skills found.` },
    { key: 'keywords', label: 'Keywords', score: keywordScore, weight: w.keywords,
      formula: 'Share of the most frequent other terms in the job description that appear in your resume.',
      detail: `${kwFound} of ${jobKeywords.length} terms found.` },
    { key: 'experience', label: 'Experience', score: experienceScore, weight: w.experience,
      formula: 'Years shown by dated roles divided by years required, capped at 100.', detail: experienceDetail },
    { key: 'title', label: 'Job title', score: titleScore, weight: w.title,
      formula: 'Exact title in your role titles = 100. Otherwise based on the words shared with the target title.',
      detail: phraseInTitles ? 'The target title appears in your role titles.' : `${Math.round(titleOverlap * 100)}% of the title words appear in your ${resumeTitles ? 'role titles' : 'resume'}.` },
    { key: 'formatting', label: 'Formatting', score: fmt.score, weight: w.formatting,
      formula: 'Starts at 100. Each warning below subtracts its listed points.',
      detail: fmt.warnings.filter((x) => x.deduction > 0).length ? `${fmt.warnings.filter((x) => x.deduction > 0).length} deduction(s) applied.` : 'No deductions.' },
    { key: 'education', label: 'Education', score: educationScore, weight: w.education,
      formula: 'Meets the degree mentioned = 100; one level below = 60; none recognised = 30.', detail: educationDetail },
  ];
  const overall = clamp(lines.reduce((s, l) => s + l.score * l.weight, 0) / totalWeight);

  // Achievements are reported but not scored.
  const bullets = input.structured.experience.flatMap((e) => e.bullets);
  const quantified = bullets.filter((b) => /\d|%|\$|€|£|₹/.test(b)).length;

  const suggestions: Suggestion[] = [];
  if (hardRequiredMissing > 0) {
    const names = keywords.filter((k) => k.status === 'missing' && k.category !== 'keyword' && k.category !== 'soft').slice(0, 6).map((k) => k.term);
    suggestions.push({ area: 'Skills', message: `The job asks for ${names.join(', ')}. If you have real experience with these, say so in your skills or role bullets. Only add what is true.` });
  }
  if (titleScore < 70) suggestions.push({ area: 'Job title', message: `If it fairly describes your work, use "${input.jobTitle}" in your summary or headline.` });
  if (needYears !== null && haveYears !== null && haveYears < needYears) suggestions.push({ area: 'Experience', message: `Emphasise relevant projects and impact, as your dated roles total less than the ${needYears}+ years mentioned.` });
  if (haveYears === null && input.structured.experience.length) suggestions.push({ area: 'Experience', message: 'Add start and end dates to each role so your experience can be read.' });
  if (bullets.length && quantified / bullets.length < 0.3) suggestions.push({ area: 'Achievements', message: `${quantified} of ${bullets.length} bullets include a number. Add real figures for scale or results where you can.` });
  if (softMissing.length) suggestions.push({ area: 'Soft skills', message: `The job mentions ${softMissing.slice(0, 4).join(', ')}. Where it's true, show these through examples rather than listing them.` });
  if (needDegree && educationScore < 100) suggestions.push({ area: 'Education', message: educationDetail });

  const r = input.structured;
  return {
    overall, lines, keywords, warnings: fmt.warnings, suggestions,
    sections: {
      contact: !!(r.personal.email || r.personal.phone), summary: !!r.summary, experience: r.experience.length > 0,
      education: r.education.length > 0, skills: r.skills.length > 0, projects: r.projects.length > 0, certifications: r.certifications.length > 0,
    },
    experience: { requiredYears: needYears, evidencedYears: haveYears },
    education: { required: needDegree?.label ?? null, found: haveDegree?.label ?? null },
    achievements: { bullets: bullets.length, quantified },
    softSkills: { matched: softMatched, missing: softMissing },
    disclaimer: SCORE_DISCLAIMER,
    method: 'rule-based',
  };
}
