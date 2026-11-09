import { describe, expect, it } from 'vitest';
import { emptyResume, SkillEntry, StructuredResume } from '../src/interfaces/resume';
import { DEFAULT_SCORING_RULES } from '../src/services/ats/rules';
import { evidencedYears, parseDate, requiredYears, scoreResume } from '../src/services/ats/scorer';
import { countTerm, extractKeywords, findJobSkills, normalize } from '../src/services/ats/text';
import { scoreJobMatch } from '../src/services/match-engine';
import { applySuggestion, ruleSuggestions } from '../src/services/optimizer.service';
import { parseResumeText, structuredToText } from '../src/services/resume-parser';

const skill = (id: number, name: string, type: SkillEntry['type'] = 'hard', aliases: string[] = []): SkillEntry => ({ id, name, type, terms: [name, ...aliases].map(normalize) });
const catalog = [skill(1, 'TypeScript'), skill(2, 'Angular'), skill(3, 'Node.js', 'hard', ['nodejs', 'node']), skill(4, 'MySQL', 'tool'), skill(5, 'Kubernetes', 'tool'), skill(6, 'Communication', 'soft'), skill(7, 'C++'), skill(8, '.NET')];

const SAMPLE = `Jane Doe
jane@example.com | +1 555 123 4567 | Chicago, IL

SUMMARY
Software engineer building web products.

EXPERIENCE
Senior Software Engineer | Acme Corp | Jan 2019 - Present
• Built TypeScript and Angular apps used by 20,000 customers
• Reduced API latency by 35%

Software Engineer | Beta Inc | Jun 2015 - Dec 2018
• Maintained Node.js services

EDUCATION
Bachelor of Science in Computer Science, State University, 2015

SKILLS
TypeScript, Angular, Node.js, MySQL

LANGUAGES
English, Spanish`;

const JOB = `Senior Software Engineer
Requirements:
5+ years of professional experience
TypeScript, Angular and Node.js required
MySQL is required
Strong communication
Nice to have:
Kubernetes
Bachelor's degree in computer science`;

const scan = (over: Partial<Parameters<typeof scoreResume>[0]> = {}) => {
  const structured = parseResumeText(SAMPLE);
  return scoreResume({ resumeText: SAMPLE, structured, jobTitle: 'Senior Software Engineer', jobDescription: JOB, catalog, rules: DEFAULT_SCORING_RULES, ...over });
};

describe('term matching', () => {
  it('handles symbols that plain word boundaries miss', () => {
    expect(countTerm('i write c++ daily', 'C++')).toBe(1);
    expect(countTerm('we use .net and c', 'c++')).toBe(0);
    expect(countTerm('asp and .net core', '.NET')).toBe(1);
    expect(countTerm('node.js services', 'node')).toBe(0);
    expect(countTerm('node.js services', 'node.js')).toBe(1);
  });
  it('does not match inside longer words', () => {
    expect(countTerm('javascript', 'java')).toBe(0);
    expect(countTerm('going places', 'go')).toBe(0);
  });
  it('separates required from nice-to-have skills', () => {
    const found = findJobSkills(JOB, catalog);
    expect(found.find((f) => f.skill.name === 'TypeScript')?.required).toBe(true);
    expect(found.find((f) => f.skill.name === 'Kubernetes')?.required).toBe(false);
  });
  it('excludes skills and stopwords from keywords', () => {
    const k = extractKeywords('Payments platform. Payments platform with TypeScript for the team.', ['typescript']).map((x) => x.term);
    expect(k).toContain('payments platform');
    expect(k).not.toContain('typescript');
    expect(k).not.toContain('team');
  });
});

describe('experience parsing', () => {
  it('reads required years only near an experience claim', () => {
    expect(requiredYears('5+ years of experience in sales')).toBe(5);
    expect(requiredYears('3-5 years experience')).toBe(3);
    expect(requiredYears('Our company is 40 years old and growing')).toBeNull();
    expect(requiredYears('no requirement here')).toBeNull();
  });
  it('parses common date formats', () => {
    expect(parseDate('Jan 2019')?.getUTCFullYear()).toBe(2019);
    expect(parseDate('03/2020')?.getUTCMonth()).toBe(2);
    expect(parseDate('2018')?.getUTCFullYear()).toBe(2018);
    expect(parseDate('nonsense')).toBeNull();
  });
  it('merges overlapping roles', () => {
    const r: StructuredResume = { ...emptyResume(), experience: [
      { title: 'A', company: 'X', startDate: 'Jan 2020', endDate: 'Jan 2022', bullets: [] },
      { title: 'B', company: 'Y', startDate: 'Jan 2021', endDate: 'Jan 2023', bullets: [] },
    ] };
    expect(evidencedYears(r, '')).toBeCloseTo(3, 0);
  });
});

describe('resume parser', () => {
  const r = parseResumeText(SAMPLE);
  it('extracts contact details and sections', () => {
    expect(r.personal.fullName).toBe('Jane Doe');
    expect(r.personal.email).toBe('jane@example.com');
    expect(r.personal.phone).toContain('555');
    expect(r.personal.location).toBe('Chicago, IL');
    expect(r.summary).toContain('Software engineer');
    expect(r.skills).toEqual(['TypeScript', 'Angular', 'Node.js', 'MySQL']);
    expect(r.languages).toEqual(['English', 'Spanish']);
  });
  it('extracts roles with dates and bullets', () => {
    expect(r.experience).toHaveLength(2);
    expect(r.experience[0].title).toBe('Senior Software Engineer');
    expect(r.experience[0].company).toBe('Acme Corp');
    expect(r.experience[0].current).toBe(true);
    expect(r.experience[0].bullets).toHaveLength(2);
    expect(r.experience[1].bullets[0]).toContain('Node.js');
  });
  it('extracts education', () => {
    expect(r.education[0].degree).toContain('Bachelor');
    expect(r.education[0].institution).toContain('University');
    expect(r.education[0].year).toBe('2015');
  });
  it('survives empty input', () => {
    expect(parseResumeText('').experience).toEqual([]);
  });
  it('round-trips through text', () => {
    const again = parseResumeText(structuredToText(r));
    expect(again.skills).toEqual(r.skills);
    expect(again.experience.length).toBe(r.experience.length);
  });
});

describe('ATS scoring', () => {
  it('scores a strong match highly and explains each part', () => {
    const report = scan();
    expect(report.overall).toBeGreaterThan(70);
    expect(report.lines.map((l) => l.key)).toEqual(['skills', 'keywords', 'experience', 'title', 'formatting', 'education']);
    report.lines.forEach((l) => { expect(l.formula).toBeTruthy(); expect(l.detail).toBeTruthy(); });
    expect(report.lines.find((l) => l.key === 'title')?.score).toBe(100);
    expect(report.keywords.find((k) => k.term === 'Kubernetes')?.status).toBe('recommended');
    expect(report.keywords.find((k) => k.term === 'TypeScript')?.status).toBe('matched');
  });
  it('never claims to be an employer ATS or a hiring prediction', () => {
    const report = scan();
    expect(report.method).toBe('rule-based');
    expect(report.disclaimer).toMatch(/not the score of any employer/);
    expect(report.disclaimer).toMatch(/does not predict/);
  });
  it('scores an unrelated resume lower', () => {
    const text = 'Sam Lee\nsam@example.com\n\nEXPERIENCE\nChef | Bistro | 2015 - 2020\n• Cooked meals';
    expect(scan({ resumeText: text, structured: parseResumeText(text) }).overall).toBeLessThan(scan().overall - 25);
  });
  it('uses configured weights', () => {
    const rules = { ...DEFAULT_SCORING_RULES, weights: { skills: 0, keywords: 0, experience: 0, title: 0, formatting: 100, education: 0 } };
    const report = scan({ rules });
    expect(report.overall).toBe(report.lines.find((l) => l.key === 'formatting')!.score);
  });
  it('raises the score when a missing term is excluded', () => {
    const text = SAMPLE.replace(/MySQL/g, 'Excel');
    const s = parseResumeText(text);
    const before = scan({ resumeText: text, structured: s });
    const after = scan({ resumeText: text, structured: s, excludedTerms: ['MySQL'] });
    expect(after.lines[0].score).toBeGreaterThan(before.lines[0].score);
    expect(after.keywords.find((k) => k.term === 'MySQL')).toBeUndefined();
  });
  it('flags missing sections and scanned PDFs', () => {
    const report = scan({ resumeText: 'x', structured: emptyResume(), formatSignals: { kind: 'pdf', charCount: 1, pages: 1 } });
    const codes = report.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['missing_email', 'missing_experience', 'low_text_pdf']));
    expect(report.lines.find((l) => l.key === 'formatting')!.score).toBe(0);
  });
  it('uses a neutral experience score when the job has no requirement', () => {
    const report = scan({ jobDescription: 'We need TypeScript and Angular people to build things for our customers.' });
    expect(report.lines.find((l) => l.key === 'experience')?.score).toBe(DEFAULT_SCORING_RULES.neutralExperienceScore);
  });
});

describe('job matching', () => {
  const profile = { resumeText: SAMPLE, resumeTitles: ['Senior Software Engineer'], skills: ['TypeScript'], years: 9, targetTitle: null, seniority: 'senior', location: 'Chicago, IL', workMode: 'remote', employmentType: 'full_time' };
  const job = { title: 'Senior Software Engineer', description: '', location: 'Remote', work_mode: 'remote', employment_type: 'full_time', experience_level: 'senior', min_years: 5,
    skills: [{ name: 'TypeScript', type: 'hard' as const, terms: ['typescript'], required: true }, { name: 'Kubernetes', type: 'tool' as const, terms: ['kubernetes'], required: true }] };
  it('explains matched and missing skills', () => {
    const m = scoreJobMatch(profile, job);
    expect(m.skillsMatched).toEqual(['TypeScript']);
    expect(m.skillsMissing).toEqual(['Kubernetes']);
    expect(m.reasons.length).toBeGreaterThan(0);
    expect(m.disclaimer).toMatch(/not a prediction/);
  });
  it('reports experience gaps', () => {
    expect(scoreJobMatch({ ...profile, years: 2 }, job).experienceGap).toMatch(/5\+ years/);
  });
  it('drops unknown factors rather than guessing', () => {
    const m = scoreJobMatch({ ...profile, seniority: null, workMode: 'any', location: null, employmentType: 'any', years: null }, { ...job, skills: [{ name: 'TypeScript', type: 'hard', terms: ['typescript'], required: true }] });
    expect(m.unknown.length).toBeGreaterThan(0);
    expect(m.score).toBe(100);
  });
  it('scores a fit above a poor fit', () => {
    const poor = scoreJobMatch({ ...profile, resumeText: 'cook', skills: [], resumeTitles: ['Chef'], years: 1, seniority: 'entry', workMode: 'onsite', employmentType: 'part_time' }, job);
    expect(scoreJobMatch(profile, job).score).toBeGreaterThan(poor.score);
  });
});

describe('optimizer rules', () => {
  const base: StructuredResume = { ...emptyResume(), experience: [{ title: 'Dev', company: 'X', bullets: ['Responsible for the billing system', 'shipped  features'] }] };
  it('proposes changes and requires confirmation for claims', () => {
    const s = ruleSuggestions(base, null);
    expect(s[0]).toMatchObject({ kind: 'bullet', suggested: 'Led the billing system', needsConfirmation: true });
    expect(s[1]).toMatchObject({ kind: 'grammar', suggested: 'Shipped features', needsConfirmation: false });
  });
  it('asks to confirm missing skills instead of inserting them', () => {
    const report = scan({ resumeText: 'x', structured: emptyResume() });
    const skills = ruleSuggestions(emptyResume(), report).filter((s) => s.kind === 'skill');
    expect(skills.length).toBeGreaterThan(0);
    skills.forEach((s) => expect(s.needsConfirmation).toBe(true));
  });
  it('applies an accepted edit to a copy only', () => {
    const out = applySuggestion(base, { section_path: 'experience.0.bullets.0', original_text: base.experience[0].bullets[0] }, 'New text');
    expect(out.experience[0].bullets[0]).toBe('New text');
    expect(base.experience[0].bullets[0]).toBe('Responsible for the billing system');
  });
  it('rejects a stale suggestion', () => {
    expect(() => applySuggestion(base, { section_path: 'experience.0.bullets.0', original_text: 'Something else' }, 'x')).toThrow(/changed/);
  });
  it('does not duplicate an existing skill', () => {
    const r = { ...emptyResume(), skills: ['Go'] };
    expect(applySuggestion(r, { section_path: 'skills', original_text: null }, 'go').skills).toEqual(['Go']);
  });
});
