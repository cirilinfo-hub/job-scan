import { SkillEntry } from '../../interfaces/resume';

const STOPWORDS = new Set(`a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either etc few for from further had has have having he her here hers him his how i if in into is it its itself just like made make many may me might more most must my no nor not now of off on once only or other our ours out over own per same she should so some such than that the their theirs them then there these they this those through to too under until up us very via was we were what when where which while who whom why will with within without would yet you your yours
nice degree degrees bachelor bachelor's bachelors master master's masters phd preferably equivalent minimum proven ability able work working works worked job role roles position candidate candidates team teams company companies opportunity opportunities including include includes required requirements requirement preferred responsibilities responsibility qualifications qualification experience experienced years year strong excellent good great new using use used based looking seek seeking join ensure support help well across plus must-have nice-have knowledge understanding skills skill day days time part full apply application applicants employee employees people business environment benefits salary pay offer offers we're you'll you're will need needs want wants get every high best one two three first world across ideal related relevant various key responsible provide providing develop developing build building create creating manage managing lead leading drive drives driving`.split(/\s+/));

/**
 * Everyday words that are also skill names. Only the capitalised form means the skill ("Go", "Excel");
 * "go", "excel at", "Go to market" and "R&D" do not. Non-skill uses are tagged with a zero-width
 * marker before lowercasing, so matching can tell them apart and the rest of the pipeline stays simple.
 */
const NOT_SKILL = '​';
const AMBIGUOUS = /\b(go|r|excel|express|spark|swift|rust)\b(?!\.[a-z])/g;
const AMBIGUOUS_PHRASES = /\bGo(?=(?: |-)(?:to|through|beyond|above|live|deep|further)\b)|\bR(?=&D\b)|^(?:Excel|Express|Spark|Go)(?= (?:at|your|our|the|interest)\b)/gm;

export const normalize = (s: string): string =>
  s.replace(AMBIGUOUS, `$1${NOT_SKILL}`).replace(AMBIGUOUS_PHRASES, (m) => `${m}${NOT_SKILL}`)
    .toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Boundaries that respect terms such as "c++", "c#", ".net" and "node.js", where \b fails. */
export function termRegex(term: string): RegExp {
  const t = escapeRe(normalize(term).replaceAll(NOT_SKILL, '')).replace(/\\?\s+/g, '[\\s-]+');
  // A leading "." stops "js" matching inside "node.js"; the marker rejects non-skill uses of everyday words.
  return new RegExp(`(?<![a-z0-9+#.])${t}(?![a-z0-9+#${NOT_SKILL}]|\\.[a-z0-9])`, 'g');
}

export function countTerm(normalizedText: string, term: string): number {
  return normalizedText.match(termRegex(term))?.length ?? 0;
}

export const tokens = (s: string): string[] => normalize(s).replaceAll(NOT_SKILL, '').match(/[a-z][a-z0-9+#.'-]*[a-z0-9+#]|[a-z]/g) ?? [];

export function countAny(normalizedText: string, terms: string[]): number {
  return terms.reduce((sum, t) => sum + countTerm(normalizedText, t), 0);
}

export interface FoundSkill { skill: SkillEntry; jobCount: number; required: boolean }

const PREFERRED_MARK = /\b(preferred|nice[- ]to[- ]have|bonus|a plus|desirable|advantage|optional|good to have)\b/;
const REQUIRED_MARK = /\b(required|must|minimum|essential|mandatory|need to have|you have|you will have)\b/;

/**
 * Finds catalog skills in a job description. A skill counts as required unless every line
 * mentioning it reads as optional, or falls under a "nice to have" heading.
 */
export function findJobSkills(jobText: string, catalog: SkillEntry[]): FoundSkill[] {
  const lines = jobText.split(/\r?\n|(?<=[.;])\s+/).map(normalize).filter(Boolean);
  const annotated: { line: string; preferred: boolean }[] = [];
  let inPreferred = false;
  for (const line of lines) {
    if (line.length < 60 && line.endsWith(':') || (line.length < 40 && /qualifications|requirements|nice to have|bonus|about you/.test(line))) {
      inPreferred = PREFERRED_MARK.test(line);
    }
    annotated.push({ line, preferred: inPreferred ? !REQUIRED_MARK.test(line) : PREFERRED_MARK.test(line) });
  }
  const found: FoundSkill[] = [];
  for (const skill of catalog) {
    let jobCount = 0;
    let anyRequired = false;
    for (const { line, preferred } of annotated) {
      const c = countAny(line, skill.terms);
      if (c > 0) { jobCount += c; if (!preferred) anyRequired = true; }
    }
    if (jobCount > 0) found.push({ skill, jobCount, required: anyRequired });
  }
  return found.sort((a, b) => b.jobCount - a.jobCount);
}

export interface Keyword { term: string; count: number }

/** Most frequent meaningful single words and two-word phrases, excluding known skill terms. */
export function extractKeywords(text: string, excludeTerms: string[], max = 25): Keyword[] {
  const excluded = new Set(excludeTerms.map(normalize));
  // "apis" is noise when "rest apis" is already covered as a skill.
  for (const t of [...excluded]) for (const w of t.split(/\s+/)) if (w.length > 2 && t.includes(' ')) excluded.add(w);
  const counts = new Map<string, number>();
  for (const sentence of text.split(/[\r\n.;:!?()•]+/)) {
    const words = tokens(sentence);
    words.forEach((w, i) => {
      if (w.length > 2 && !STOPWORDS.has(w) && !excluded.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
      const next = words[i + 1];
      if (next && !STOPWORDS.has(w) && !STOPWORDS.has(next) && w.length > 2 && next.length > 2) {
        const phrase = `${w} ${next}`;
        if (!excluded.has(phrase)) counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    });
  }
  const phrases = [...counts.entries()].filter(([t, c]) => (t.includes(' ') ? c >= 2 : true));
  // A word that only occurs inside a kept phrase adds nothing further.
  const kept = phrases.filter(([t, c]) => t.includes(' ') || !phrases.some(([p, pc]) => p.includes(' ') && p.split(' ').includes(t) && pc >= c));
  return kept
    .map(([term, count]) => ({ term, count, rank: count * (term.includes(' ') ? 1.5 : 1) }))
    .sort((a, b) => b.rank - a.rank || a.term.localeCompare(b.term))
    .slice(0, max)
    .map(({ term, count }) => ({ term, count }));
}
