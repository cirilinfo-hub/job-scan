import { Request, Response } from 'express';
import { z } from 'zod';
import { resumeService } from '../services/resume.service';
import { TEMPLATES } from '../services/document.service';
import { emptyResume } from '../interfaces/resume';
import { currentUser, idParam, ok, created } from '../utils/http';
import { badRequest } from '../utils/errors';

const formatSchema = z.object({ format: z.enum(['original', 'pdf', 'docx']).default('pdf'), versionId: z.coerce.number().int().positive().optional() });

export function sendFile(res: Response, f: { buffer: Buffer; mime: string; name: string }) {
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(f.buffer);
}

export const resumeController = {
  list: async (req: Request, res: Response) => ok(res, await resumeService.list(currentUser(req).id)),
  get: async (req: Request, res: Response) => ok(res, await resumeService.get(currentUser(req).id, idParam(req))),
  upload: async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Choose a file to upload.');
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 150) : undefined;
    const category = typeof req.body?.category === 'string' && req.body.category.trim() ? req.body.category.trim().slice(0, 60) : null;
    created(res, await resumeService.upload(currentUser(req).id, req.file, title, category));
  },
  updateMeta: async (req: Request, res: Response) => ok(res, await resumeService.updateMeta(currentUser(req).id, idParam(req), req.body)),
  saveVersion: async (req: Request, res: Response) => ok(res, await resumeService.saveVersion(currentUser(req).id, idParam(req), req.body.structured, req.body.label ?? null)),
  getVersion: async (req: Request, res: Response) => ok(res, await resumeService.getVersion(currentUser(req).id, idParam(req), idParam(req, 'versionId'))),
  restore: async (req: Request, res: Response) => ok(res, await resumeService.restoreVersion(currentUser(req).id, idParam(req), idParam(req, 'versionId'))),
  setDefault: async (req: Request, res: Response) => { await resumeService.setDefault(currentUser(req).id, idParam(req)); ok(res, { isDefault: true }); },
  remove: async (req: Request, res: Response) => { await resumeService.remove(currentUser(req).id, idParam(req)); ok(res, { deleted: true }); },
  download: async (req: Request, res: Response) => {
    const q = formatSchema.parse(req.query);
    sendFile(res, await resumeService.download(currentUser(req).id, idParam(req), q.format, q.versionId));
  },
};

export const builderController = {
  templates: async (_req: Request, res: Response) => ok(res, { templates: TEMPLATES.map(({ id, name, description }) => ({ id, name, description })), blank: emptyResume() }),
  create: async (req: Request, res: Response) => created(res, await resumeService.createFromStructured(currentUser(req).id, req.body)),
  render: async (req: Request, res: Response) => sendFile(res, await resumeService.renderDraft(req.body.structured, req.body.template, req.body.format)),
};
