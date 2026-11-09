import { EducationItem, ExperienceItem, ProjectItem, StructuredResume, emptyResume } from '../interfaces/resume';

type SectionKey = 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'projects' | 'achievements' | 'languages';

const HEADINGS: Record<SectionKey, RegExp> = {
  summary: /^(professional\s+|career\s+|executive\s+)?(summary|profile|objective|about( me)?)$/i,
  experience: /^(professional\s+|work\s+|relevant\s+|employment\s+)?(experience|history|employment)( history)?$/i,
  education: /^(education|academic (background|qualifications)|qualifications)( (and|&) (training|certifications))?$/i,
  skills: /^((technical|core|key|professional)\s+)?(skills|competencies|technologies|expertise)( (and|&) (tools|technologies|expertise))?$/i,
  certifications: /^(certifications?|licenses?( (and|&) certifications?)?|professional certifications?)$/i,
  projects: /^((key|personal|selected|academic)\s+)?projects$/i,
  achievements: /^(achievements|awards|honou?rs|accomplishments)( (and|&) (awards|honou?rs))?$/i,
  languages: /^languages?$/i,
};

const BULLET = /^\s*[•●▪◦*\-–—‣·]\s+/;
const DATE_TOKEN = '(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{4}|\\d{1,2}[/-]\\d{4}|(?:19|20)\\d{2})';
const DATE_RANGE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|present|current|now|today)`, 'i');

function headingFor(line: string): SectionKey | null {
  const clean = line.replace(/[:\s]+$/, '').replace(/^[#*\s]+/, '').trim();
  if (clean.length > 45) return null;
  for (const key of Object.keys(HEADINGS) as SectionKey[]) if (HEADINGS[key].test(clean)) return key;
  return null;
}

function parsePersonal(lines: string[], text: string, out: StructuredResume): void {
  const p = out.personal;
  p.email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? '';
  const phone = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g)?.find((c) => {
    const digits = c.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15 && !DATE_RANGE.test(c);
  });
  p.phone = phone?.trim() ?? '';
  p.linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[A-Za-z0-9\-_/%]+/i)?.[0] ?? '';
  p.website = text.match(/(?:https?:\/\/)(?!(?:www\.)?linkedin\.com)[^\s,|]+/i)?.[0] ?? '';
  for (const line of lines.slice(0, 5)) {
    const l = line.trim();
    if (l && !/[@\d]|https?:|linkedin/i.test(l) && l.split(/\s+/).length <= 5 && l.length <= 60 && !headingFor(l)) { p.fullName = l; break; }
  }
  for (const line of lines.slice(0, 8)) {
    const parts = line.split(/[|•·]/).map((s) => s.trim());
    const loc = parts.find((s) => /^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+$/.test(s));
    if (loc) { p.location = loc; break; }
  }
}

function parseExperience(lines: string[]): ExperienceItem[] {
  const items: ExperienceItem[] = [];
  let cur: ExperienceItem | null = null;
  let headerLines: string[] = [];

  const applyHeader = (item: ExperienceItem, header: string[]) => {
    const parts = header.join(' | ').replace(DATE_RANGE, '').split(/\s*(?:\||,|\s[-–—]\s|\s+at\s+)\s*/i).map((s) => s.trim()).filter(Boolean);
    item.title = parts[0] ?? '';
    item.company = parts[1] ?? '';
    item.location = parts.slice(2).join(', ') || undefined;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const date = line.match(DATE_RANGE);
    if (date) {
      if (cur) items.push(cur);
      cur = { title: '', company: '', bullets: [], startDate: date[1], endDate: date[2], current: /present|current|now|today/i.test(date[2]) };
      const remainder = line.replace(DATE_RANGE, '').replace(/[|,\s]+$/, '').trim();
      const header = [...headerLines, ...(remainder ? [remainder] : [])];
      // A title on the following line is common: "Acme Corp 2020-2022" then "Senior Engineer".
      const next = lines[idx + 1]?.trim();
      if (header.length < 2 && next && !BULLET.test(next) && next.length < 70 && !DATE_RANGE.test(next)) header.push(next);
      applyHeader(cur, header);
      headerLines = [];
      return;
    }
    if (BULLET.test(raw)) {
      if (cur) cur.bullets.push(line.replace(BULLET, '').trim());
      headerLines = [];
    } else if (cur && cur.bullets.length === 0 && (cur.title === line || cur.company === line)) {
      // Already consumed as a header line.
    } else if (line.length < 70 && !/[.;]$/.test(line)) {
      headerLines.push(line);
      if (headerLines.length > 2) headerLines.shift();
    } else if (cur) {
      // Wrapped text belongs to the previous bullet; otherwise it's a plain-sentence bullet.
      if (cur.bullets.length && !/^[A-Z]/.test(line)) cur.bullets[cur.bullets.length - 1] += ` ${line}`;
      else cur.bullets.push(line);
      headerLines = [];
    }
  });
  if (cur) items.push(cur);
  return items;
}

function parseEducation(lines: string[]): EducationItem[] {
  const out: EducationItem[] = [];
  const DEGREE = /\b(ph\.?d|doctorate|master|bachelor|mba|b\.?\s?tech|m\.?\s?tech|b\.?sc|m\.?sc|b\.?e\b|m\.?e\b|b\.?a\b|m\.?a\b|b\.?s\b|m\.?s\b|associate|diploma)/i;
  const SCHOOL = /\b(university|college|institute|school|academy|polytechnic)\b/i;
  let cur: EducationItem | null = null;
  for (const raw of lines) {
    const line = raw.trim().replace(BULLET, '');
    if (!line) continue;
    const year = line.match(/\b(19|20)\d{2}\b(?!.*\b(19|20)\d{2}\b)/)?.[0];
    const clean = line.replace(DATE_RANGE, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/[|,\s()-]+$/, '').trim();
    const parts = clean.split(/\s*[|,]\s*|\s[-–—]\s/).map((s) => s.trim()).filter(Boolean);
    const degreePart = parts.find((p) => DEGREE.test(p));
    const schoolPart = parts.find((p) => SCHOOL.test(p));
    if (degreePart) {
      if (cur && cur.degree) out.push(cur);
      const m = degreePart.match(/^(.*?)\s+(?:in|of)\s+(.+)$/i);
      cur = { degree: degreePart, field: m ? m[2] : undefined, institution: schoolPart ?? '', year };
    } else if (schoolPart) {
      if (cur && !cur.institution) { cur.institution = schoolPart; cur.year = cur.year ?? year; }
      else { if (cur) out.push(cur); cur = { degree: '', institution: schoolPart, year }; }
    }
  }
  if (cur) out.push(cur);
  return out;
}

const splitList = (lines: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const noLabel = line.replace(BULLET, '').replace(/^[A-Za-z &/]{2,30}:\s*/, '');
    for (const part of noLabel.split(/[,;|•·]/)) {
      const s = part.trim().replace(/\.$/, '');
      if (s && s.length <= 60 && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
    }
  }
  return out;
};

const toItems = (lines: string[]): string[] => lines.map((l) => l.replace(BULLET, '').trim()).filter(Boolean);

function parseProjects(lines: string[]): ProjectItem[] {
  const out: ProjectItem[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(raw) && out.length) {
      const p = out[out.length - 1];
      p.description = `${p.description} ${line.replace(BULLET, '')}`.trim();
    } else {
      const [name, ...rest] = line.replace(BULLET, '').split(/\s*[:–—]\s+|\s-\s/);
      out.push({ name: name.trim(), description: rest.join(' - ').trim() });
    }
  }
  return out;
}

/** Heuristic parser. Output is a draft: the UI always asks the user to review it before saving. */
export function parseResumeText(text: string): StructuredResume {
  const out = emptyResume();
  const lines = text.replace(/\r/g, '').split('\n');
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const header: string[] = [];
  let current: SectionKey | null = null;
  for (const line of lines) {
    const h = headingFor(line.trim());
    if (h) { current = h; sections[h] = sections[h] ?? []; continue; }
    if (current) sections[current]!.push(line);
    else header.push(line);
  }
  parsePersonal(header.filter((l) => l.trim()).length ? header.filter((l) => l.trim()) : lines.filter((l) => l.trim()), text, out);
  out.summary = (sections.summary ?? []).map((s) => s.trim()).filter(Boolean).join(' ');
  out.experience = parseExperience(sections.experience ?? []);
  out.education = parseEducation(sections.education ?? []);
  out.skills = splitList(sections.skills ?? []);
  out.certifications = toItems(sections.certifications ?? []);
  out.projects = parseProjects(sections.projects ?? []);
  out.achievements = toItems(sections.achievements ?? []);
  out.languages = splitList(sections.languages ?? []);
  return out;
}

/** Plain-text form of a structured resume, used for scoring edited or built resumes. */
export function structuredToText(r: StructuredResume): string {
  const p = r.personal;
  const blocks: string[] = [
    [p.fullName, [p.email, p.phone, p.location].filter(Boolean).join(' | '), [p.linkedin, p.website].filter(Boolean).join(' | ')].filter(Boolean).join('\n'),
  ];
  const render: Record<string, () => string> = {
    summary: () => (r.summary ? `SUMMARY\n${r.summary}` : ''),
    experience: () => r.experience.length ? `EXPERIENCE\n${r.experience.map((e) =>
      `${[e.title, e.company, e.location].filter(Boolean).join(' | ')}\n${[e.startDate, e.current ? 'Present' : e.endDate].filter(Boolean).join(' - ')}\n${e.bullets.map((b) => `• ${b}`).join('\n')}`).join('\n\n')}` : '',
    education: () => r.education.length ? `EDUCATION\n${r.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(' | ')).join('\n')}` : '',
    skills: () => (r.skills.length ? `SKILLS\n${r.skills.join(', ')}` : ''),
    projects: () => r.projects.length ? `PROJECTS\n${r.projects.map((x) => `${x.name}: ${x.description}`).join('\n')}` : '',
    certifications: () => (r.certifications.length ? `CERTIFICATIONS\n${r.certifications.join('\n')}` : ''),
    achievements: () => (r.achievements.length ? `ACHIEVEMENTS\n${r.achievements.map((a) => `• ${a}`).join('\n')}` : ''),
    languages: () => (r.languages.length ? `LANGUAGES\n${r.languages.join(', ')}` : ''),
  };
  const order = r.sectionOrder?.length ? r.sectionOrder : Object.keys(render);
  for (const key of order) if (render[key]) blocks.push(render[key]());
  return blocks.filter(Boolean).join('\n\n');
}
