import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env';
import { badRequest } from '../utils/errors';

/** Held in memory only until validated, then written to private storage with a random name. */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx'].includes(path.extname(file.originalname).toLowerCase());
    if (allowed) cb(null, true);
    else cb(badRequest('Upload a PDF or DOCX file.'));
  },
});
