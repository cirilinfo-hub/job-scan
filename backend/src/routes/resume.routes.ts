import { Router } from 'express';
import { builderController as b, resumeController as c } from '../controllers/resume.controller';
import { requireAuth } from '../middlewares/auth';
import { uploadLimiter, validateBody } from '../middlewares/common';
import { resumeUpload } from '../middlewares/upload';
import * as v from '../validators/resume.validators';

export const resumeRoutes = Router();
resumeRoutes.use(requireAuth);
resumeRoutes.get('/', c.list);
resumeRoutes.post('/', uploadLimiter, resumeUpload.single('file'), c.upload);
resumeRoutes.get('/:id', c.get);
resumeRoutes.patch('/:id', validateBody(v.updateMetaSchema), c.updateMeta);
resumeRoutes.delete('/:id', c.remove);
resumeRoutes.post('/:id/default', c.setDefault);
resumeRoutes.get('/:id/download', c.download);
resumeRoutes.post('/:id/versions', validateBody(v.saveVersionSchema), c.saveVersion);
resumeRoutes.get('/:id/versions/:versionId', c.getVersion);
resumeRoutes.post('/:id/versions/:versionId/restore', c.restore);

export const builderRoutes = Router();
builderRoutes.use(requireAuth);
builderRoutes.get('/templates', b.templates);
builderRoutes.post('/', validateBody(v.builderCreateSchema), b.create);
builderRoutes.post('/render', validateBody(v.builderRenderSchema), b.render);
