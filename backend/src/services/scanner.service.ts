import { json, tx } from '../config/db';
import { FormatSignals, StructuredResume } from '../interfaces/resume';
import { PROMPTS } from '../integrations/ai/prompts';
import { parseVersion, resumeRepo } from '../repositories/resume.repository';
import { scanRepo } from '../repositories/scan.repository';
import { usageRepo } from '../repositories/usage.repository';
import { notFound } from '../utils/errors';
import { aiService, enforceLimit } from './ai.service';
import { DEFAULT_SCORING_RULES, ScoringRules } from './ats/rules';
import { ScanReport, scoreResume } from './ats/scorer';
import { catalogService } from './catalog.service';
import { resumeService } from './resume.service';
import { settingsService } from './settings.service';

export interface ScanRequest { resumeId: number; versionId?: number; company?: string | null; jobTitle: string; jobDescription: string; jobId?: number | null }

export interface ScanDetail {
  id: number; user_id: number; resume_id: number; version_id: number; job_id: number | null; company: string | null;
  job_title: string; job_description: string; overall_score: number; created_at: Date; resume_title: string; version_no: number;
  resume_text: string; structured: StructuredResume; format_signals: FormatSignals | null; report: ScanReport; rules: ScoringRules; excluded_terms: string[];
}

export const rulesNow = () => settingsService.get<ScoringRules>('scoring_rules', DEFAULT_SCORING_RULES);

export const scannerService = {
  /** Used by the optimizer to preview a score for unsaved text, with no record kept. */
  async preview(resumeText: string, structured: StructuredResume, jobTitle: string, jobDescription: string, excluded: string[] = []) {
    return scoreResume({ resumeText, structured, jobTitle, jobDescription, catalog: await catalogService.skills(), rules: await rulesNow(), excludedTerms: excluded });
  },

  async run(userId: number, req: ScanRequest): Promise<ScanDetail> {
    await enforceLimit(userId, 'scans_per_month', 'resume_scan');
    const resume = await resumeService.requireOwned(userId, req.resumeId);
    const versionId = req.versionId ?? resume.current_version_id;
    const raw = versionId ? await resumeRepo.version(req.resumeId, versionId) : null;
    if (!raw) throw notFound('Resume version');
    const version = parseVersion(raw);
    const rules = await rulesNow();
    const report = scoreResume({
      resumeText: version.raw_text, structured: version.structured, formatSignals: version.format_signals,
      jobTitle: req.jobTitle, jobDescription: req.jobDescription, catalog: await catalogService.skills(), rules,
    });
    const id = await tx((db) => scanRepo.insert({
      userId, resumeId: req.resumeId, versionId: version.id, jobId: req.jobId ?? null, company: req.company ?? null,
      jobTitle: req.jobTitle, jobDescription: req.jobDescription, report, rules, excluded: [],
    }, db));
    await usageRepo.log({ userId, feature: 'resume_scan' });
    return this.get(userId, id);
  },

  async get(userId: number, id: number): Promise<ScanDetail> {
    const row = await scanRepo.byId(userId, id);
    if (!row) throw notFound('Scan');
    const { structured, format_signals, report, rules_snapshot, excluded_terms, ...rest } = row as unknown as Record<string, unknown>;
    return {
      ...rest,
      structured: json<StructuredResume>(structured, {} as StructuredResume),
      format_signals: json<FormatSignals | null>(format_signals, null),
      report: json<ScanReport>(report, {} as ScanReport),
      rules: json<ScoringRules>(rules_snapshot, DEFAULT_SCORING_RULES),
      excluded_terms: json<string[]>(excluded_terms, []),
    } as unknown as ScanDetail;
  },

  /** The user can exclude a term that doesn't apply. The score recalculates with the rules stored on this scan. */
  async setExcluded(userId: number, id: number, excluded: string[]) {
    const scan = await this.get(userId, id);
    const report = scoreResume({
      resumeText: scan.resume_text, structured: scan.structured, formatSignals: scan.format_signals,
      jobTitle: scan.job_title, jobDescription: scan.job_description,
      catalog: await catalogService.skills(), rules: scan.rules, excludedTerms: excluded,
    });
    await tx((db) => scanRepo.saveResult(id, report, scan.rules, excluded, db));
    return this.get(userId, id);
  },

  /** Rescans a job against the resume's newest version, as a new history entry. */
  async rescan(userId: number, id: number) {
    const s = await this.get(userId, id);
    return this.run(userId, { resumeId: s.resume_id, company: s.company, jobTitle: s.job_title, jobDescription: s.job_description, jobId: s.job_id });
  },

  async list(userId: number, page: number, pageSize: number) {
    const [items, total] = await Promise.all([scanRepo.list(userId, pageSize, (page - 1) * pageSize), scanRepo.count(userId)]);
    return { items, total };
  },

  async remove(userId: number, id: number) {
    const res = await scanRepo.remove(userId, id);
    if (!res.affectedRows) throw notFound('Scan');
  },

  /** Optional AI extra. The rule-based report above does not depend on it. */
  async aiKeywords(userId: number, id: number) {
    const s = await this.get(userId, id);
    return aiService.generate(PROMPTS.keywordExtract, { job: s.job_description, found: s.report.keywords.map((k) => k.term).join(', ') }, userId);
  },
};
