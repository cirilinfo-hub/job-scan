import { Router } from 'express';
import { z } from 'zod';
import { sendFile } from '../controllers/resume.controller';
import { requireAuth } from '../middlewares/auth';
import { aiLimiter, validateBody } from '../middlewares/common';
import { coverLetterService as s, editSchema, generateSchema, regenSchema } from '../services/cover-letter.service';
import { currentUser, idParam, ok, created } from '../utils/http';

const exportQ = z.object({ format: z.enum(['pdf', 'docx']).default('pdf'), versionId: z.coerce.number().int().positive().optional() });

export const coverLetterRoutes = Router();
coverLetterRoutes.use(requireAuth);
coverLetterRoutes.get('/', async (req, res) => ok(res, await s.list(currentUser(req).id)));
coverLetterRoutes.post('/', aiLimiter, validateBody(generateSchema), async (req, res) => created(res, await s.generate(currentUser(req).id, req.body)));
coverLetterRoutes.get('/:id', async (req, res) => ok(res, await s.get(currentUser(req).id, idParam(req))));
coverLetterRoutes.post('/:id/regenerate', aiLimiter, validateBody(regenSchema), async (req, res) => ok(res, await s.regenerate(currentUser(req).id, idParam(req), req.body)));
coverLetterRoutes.post('/:id/versions', validateBody(editSchema), async (req, res) => ok(res, await s.saveEdit(currentUser(req).id, idParam(req), req.body.body)));
coverLetterRoutes.delete('/:id', async (req, res) => { await s.remove(currentUser(req).id, idParam(req)); ok(res, { deleted: true }); });
coverLetterRoutes.get('/:id/export', async (req, res) => {
  const q = exportQ.parse(req.query);
  sendFile(res, await s.exportFile(currentUser(req).id, idParam(req), q.format, q.versionId));
});
