import { StructuredResume } from '../interfaces/resume';
import { PROMPTS } from '../integrations/ai/prompts';
import { suggestionRepo, SuggestionRow } from '../repositories/suggestion.repository';
import { badRequest, conflict, notFound } from '../utils/errors';
import { aiService } from './ai.service';
import { ScanReport } from './ats/scorer';
import { countTerm, normalize } from './ats/text';
import { resumeService } from './resume.service';
import { structuredToText } from './resume-parser';
import { scannerService } from './scanner.service';

const WEAK_OPENERS: [RegExp, string][] = [
  [/^responsible for\s+/i, 'Led '], [/^worked on\s+/i, 'Delivered '], [/^helped (to )?/i, 'Supported '],
  [/^duties included\s+/i, 'Handled '], [/^involved in\s+/i, 'Contributed to '],
];

/**
 * Deterministic suggestions that need no AI: weak openers, simple spacing and capitalisation fixes, and
 * missing-term prompts. A missing term is never written into text; each one asks the user to confirm first.
 */
export function ruleSuggestions(r: StructuredResume, report: ScanReport | null) {
  const out: { kind: string; sectionPath: string; original: string | null; suggested: string; rationale: string; needsConfirmation: boolean; source: 'rule' }[] = [];
  r.experience.forEach((e, i) => e.bullets.forEach((b, j) => {
    const path = `experience.${i}.bullets.${j}`;
    for (const [re, rep] of WEAK_OPENERS) {
      if (re.test(b)) {
        out.push({ kind: 'bullet', sectionPath: path, original: b, suggested: rep + b.replace(re, ''), rationale: 'Starts with an action verb instead of a duty phrase. Check that the verb describes what you did.', needsConfirmation: true, source: 'rule' });
        return;
      }
    }
    const fixed = b.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[a-z]/, (c) => c.toUpperCase());
    if (fixed !== b) out.push({ kind: 'grammar', sectionPath: path, original: b, suggested: fixed, rationale: 'Fixes capitalisation and spacing.', needsConfirmation: false, source: 'rule' });
  }));
  if (report) {
    const resumeText = normalize(structuredToText(r));
    for (const k of report.keywords.filter((x) => x.status === 'missing' && x.category !== 'keyword' && x.category !== 'soft').slice(0, 10)) {
      if (countTerm(resumeText, k.term) > 0) continue;
      out.push({ kind: 'skill', sectionPath: 'skills', original: null, suggested: k.term, rationale: `The job mentions ${k.term}. Accept this only if you have real experience with it.`, needsConfirmation: true, source: 'rule' });
    }
  }
  return out;
}

/** Applies one accepted edit to a copy of the resume. The stored suggestion is only ever a proposal. */
export function applySuggestion(r: StructuredResume, s: { section_path: string; original_text: string | null }, text: string): StructuredResume {
  const next: StructuredResume = JSON.parse(JSON.stringify(r));
  const path = s.section_path;
  if (path === 'summary') { next.summary = text; return next; }
  if (path === 'skills') {
    if (!next.skills.some((x) => x.toLowerCase() === text.toLowerCase())) next.skills.push(text);
    return next;
  }
  const m = path.match(/^experience\.(\d+)\.bullets\.(\d+|new)$/);
  if (m && next.experience[Number(m[1])]) {
    const bullets = next.experience[Number(m[1])].bullets;
    const idx = m[2] === 'new' ? -1 : Number(m[2]);
    if (idx >= 0 && bullets[idx] !== undefined && (s.original_text === null || bullets[idx] === s.original_text)) bullets[idx] = text;
    else if (s.original_text !== null && bullets.includes(s.original_text)) bullets[bullets.indexOf(s.original_text)] = text;
    else if (s.original_text === null) bullets.push(text);
    else throw conflict('That text has changed since this suggestion was made. Edit it directly instead.');
    return next;
  }
  throw badRequest("This suggestion can't be applied automatically.");
}

const present = (s: SuggestionRow) => ({
  id: s.id, kind: s.kind, sectionPath: s.section_path, original: s.original_text, suggested: s.suggested_text, rationale: s.rationale,
  source: s.source, needsConfirmation: !!s.needs_confirmation, status: s.status, finalText: s.final_text,
});

export const optimizerService = {
  /** Suggestions for the resume's current version. Rule-based ones always appear; AI ones are requested separately. */
  async load(userId: number, resumeId: number, scanId?: number) {
    const { version } = await resumeService.currentVersion(userId, resumeId);
    const scan = scanId ? await scannerService.get(userId, scanId) : null;
    await suggestionRepo.clearPending(userId, version.id, 'rule');
    for (const s of ruleSuggestions(version.structured, scan?.report ?? null)) await suggestionRepo.add(userId, version.id, scanId ?? null, s);
    const ai = await aiService.status();
    return { version, suggestions: (await suggestionRepo.list(userId, version.id)).map(present), ai: { available: ai.available } };
  },

  async generateAi(userId: number, resumeId: number, scanId?: number) {
    const { version } = await resumeService.currentVersion(userId, resumeId);
    const scan = scanId ? await scannerService.get(userId, scanId) : null;
    const result = await aiService.generate(PROMPTS.resumeOptimize, {
      resume: JSON.stringify(version.structured),
      job: scan?.job_description ?? '',
      jobTitle: scan?.job_title ?? '',
      missing: scan?.report.keywords.filter((k) => k.status === 'missing').map((k) => k.term).join(', ') ?? '',
    }, userId);
    await suggestionRepo.clearPending(userId, version.id, 'ai');
    for (const s of result.suggestions) {
      await suggestionRepo.add(userId, version.id, scanId ?? null, {
        kind: s.kind, sectionPath: s.sectionPath, original: s.original, suggested: s.suggested, rationale: s.rationale,
        // Anything adding a skill or keyword is a claim about the person, whatever the model reported.
        needsConfirmation: s.needsConfirmation || s.kind === 'skill' || s.kind === 'keyword', source: 'ai',
      });
    }
    return (await suggestionRepo.list(userId, version.id)).map(present);
  },

  /**
   * Records a decision and returns the updated draft. Nothing is written to the resume here:
   * changes reach a stored version only when the user saves. Claims need explicit confirmation.
   */
  async decide(userId: number, id: number, b: { status: 'accepted' | 'rejected'; finalText?: string; confirmed: boolean }, draft: StructuredResume) {
    const s = await suggestionRepo.byId(userId, id);
    if (!s) throw notFound('Suggestion');
    if (b.status === 'rejected') {
      await suggestionRepo.decide(id, 'rejected', null);
      return { suggestion: present((await suggestionRepo.byId(userId, id))!), structured: draft };
    }
    if (s.needs_confirmation && !b.confirmed) throw badRequest('Please confirm this is accurate before accepting it.');
    const text = b.finalText ?? s.suggested_text;
    const structured = applySuggestion(draft, s, text);
    await suggestionRepo.decide(id, 'accepted', text);
    return { suggestion: present((await suggestionRepo.byId(userId, id))!), structured };
  },

  async rescore(userId: number, structured: StructuredResume, scanId: number) {
    const scan = await scannerService.get(userId, scanId);
    const report = await scannerService.preview(structuredToText(structured), structured, scan.job_title, scan.job_description, scan.excluded_terms);
    return { before: scan.report.overall, after: report.overall, report };
  },

  async save(userId: number, resumeId: number, structured: StructuredResume, label: string | null, asNew: boolean, title?: string) {
    if (asNew) {
      return resumeService.createFromStructured(userId, { title: title || label || 'Optimized resume', origin: 'optimizer', changeSource: 'optimizer', label: label ?? undefined, structured });
    }
    return resumeService.saveVersion(userId, resumeId, structured, label, 'optimizer');
  },
};
