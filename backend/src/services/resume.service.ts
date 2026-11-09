import { tx } from '../config/db';
import { StructuredResume } from '../interfaces/resume';
import { NewVersion, parseVersion, resumeRepo } from '../repositories/resume.repository';
import { usageRepo } from '../repositories/usage.repository';
import { limitReached, notFound } from '../utils/errors';
import { enforceLimit } from './ai.service';
import { documentService } from './document.service';
import { ALLOWED_UPLOADS, detectKind, extractText, readStored, safeFileName, storeFile } from './file.service';
import { parseResumeText, structuredToText } from './resume-parser';

async function requireOwned(userId: number, id: number) {
  const r = await resumeRepo.byId(userId, id);
  if (!r) throw notFound('Resume');
  return r;
}

async function currentVersion(userId: number, id: number) {
  const r = await requireOwned(userId, id);
  const v = r.current_version_id ? await resumeRepo.version(id, r.current_version_id) : null;
  if (!v) throw notFound('Resume version');
  return { resume: r, version: parseVersion(v) };
}

async function checkResumeLimit(userId: number) {
  const limits = await usageRepo.planLimits(userId);
  const max = limits.resumes;
  if (max !== undefined && max >= 0 && (await resumeRepo.countFor(userId)) >= max) {
    throw limitReached(`Your plan allows ${max} resumes. Delete one to add another.`);
  }
}

export const resumeService = {
  requireOwned, currentVersion,

  list: (userId: number) => resumeRepo.list(userId),

  async get(userId: number, id: number) {
    const { resume, version } = await currentVersion(userId, id);
    return { resume, version, versions: await resumeRepo.versions(id) };
  },

  /** Parses an upload without saving, so the user can review the extracted data first. */
  async upload(userId: number, file: Express.Multer.File, title: string | undefined, category: string | null) {
    const kind = detectKind(file.buffer, file.originalname);
    await checkResumeLimit(userId);
    await enforceLimit(userId, 'uploads_per_month', 'resume_upload');
    const { text, signals } = await extractText(file.buffer, kind);
    const structured = parseResumeText(text);
    const filePath = await storeFile(userId, file.buffer, kind);
    const isFirst = (await resumeRepo.countFor(userId)) === 0;
    const name = safeFileName(file.originalname);
    const id = await tx(async (db) => {
      const newId = await resumeRepo.create(userId, title || name.replace(/\.\w+$/, ''), category, 'upload', 'classic', isFirst, db);
      await resumeRepo.addVersion(newId, {
        changeSource: 'upload', label: 'Original upload', rawText: text, structured, filePath, fileName: name,
        fileMime: ALLOWED_UPLOADS[kind], fileSize: file.size, formatSignals: signals,
      }, db);
      return newId;
    });
    await usageRepo.log({ userId, feature: 'resume_upload' });
    return this.get(userId, id);
  },

  async createFromStructured(userId: number, input: { title: string; category?: string | null; template?: string; origin?: string; structured: StructuredResume; changeSource?: string; label?: string }) {
    await checkResumeLimit(userId);
    const isFirst = (await resumeRepo.countFor(userId)) === 0;
    const id = await tx(async (db) => {
      const newId = await resumeRepo.create(userId, input.title, input.category ?? null, input.origin ?? 'builder', input.template ?? 'classic', isFirst, db);
      await resumeRepo.addVersion(newId, { changeSource: input.changeSource ?? 'builder', label: input.label ?? null, rawText: structuredToText(input.structured), structured: input.structured }, db);
      return newId;
    });
    return this.get(userId, id);
  },

  async saveVersion(userId: number, id: number, structured: StructuredResume, label: string | null, changeSource: NewVersion['changeSource'] = 'manual') {
    await requireOwned(userId, id);
    await tx((db) => resumeRepo.addVersion(id, { changeSource, label, rawText: structuredToText(structured), structured }, db));
    return this.get(userId, id);
  },

  async restoreVersion(userId: number, id: number, versionId: number) {
    await requireOwned(userId, id);
    const v = await resumeRepo.version(id, versionId);
    if (!v) throw notFound('Resume version');
    const p = parseVersion(v);
    await tx((db) => resumeRepo.addVersion(id, {
      changeSource: 'manual', label: `Restored from version ${p.version_no}`, rawText: p.raw_text, structured: p.structured,
      formatSignals: p.format_signals, filePath: p.file_path ?? undefined, fileName: p.file_name ?? undefined, fileMime: p.file_mime ?? undefined, fileSize: p.file_size ?? undefined,
    }, db));
    return this.get(userId, id);
  },

  async getVersion(userId: number, id: number, versionId: number) {
    await requireOwned(userId, id);
    const v = await resumeRepo.version(id, versionId);
    if (!v) throw notFound('Resume version');
    return parseVersion(v);
  },

  async updateMeta(userId: number, id: number, b: { title: string; category?: string | null; template?: string }) {
    const r = await requireOwned(userId, id);
    await resumeRepo.update(userId, id, b.title, b.category ?? null, b.template ?? r.template);
    return resumeRepo.byId(userId, id);
  },

  async setDefault(userId: number, id: number) {
    await requireOwned(userId, id);
    await tx((db) => resumeRepo.setDefault(userId, id, db));
  },

  async remove(userId: number, id: number) {
    const r = await requireOwned(userId, id);
    await resumeRepo.softDelete(userId, id);
    if (r.is_default) {
      const next = await resumeRepo.defaultFor(userId);
      if (next) await resumeRepo.setDefault(userId, next.id);
    }
  },

  /** format 'original' returns the uploaded file; pdf and docx render the structured content. */
  async download(userId: number, id: number, format: 'original' | 'pdf' | 'docx', versionId?: number) {
    const { resume, version: cur } = await currentVersion(userId, id);
    const version = versionId ? await this.getVersion(userId, id, versionId) : cur;
    const base = safeFileName(resume.title);
    if (format === 'original') {
      if (!version.file_path) throw notFound('Original file for this version');
      return { buffer: await readStored(version.file_path), mime: version.file_mime ?? 'application/octet-stream', name: version.file_name ?? base };
    }
    if (format === 'pdf') return { buffer: await documentService.resumePdf(version.structured, resume.template), mime: 'application/pdf', name: `${base}.pdf` };
    return { buffer: await documentService.resumeDocx(version.structured, resume.template), mime: ALLOWED_UPLOADS.docx, name: `${base}.docx` };
  },

  /** Renders unsaved builder content for preview-to-file downloads. */
  async renderDraft(structured: StructuredResume, template: string, format: 'pdf' | 'docx') {
    return format === 'pdf'
      ? { buffer: await documentService.resumePdf(structured, template), mime: 'application/pdf', name: 'resume.pdf' }
      : { buffer: await documentService.resumeDocx(structured, template), mime: ALLOWED_UPLOADS.docx, name: 'resume.docx' };
  },
};
