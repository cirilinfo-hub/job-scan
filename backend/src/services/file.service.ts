import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { env } from '../config/env';
import { FormatSignals } from '../interfaces/resume';
import { AppError, badRequest } from '../utils/errors';
import { logger } from '../utils/logger';

export const ALLOWED_UPLOADS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type UploadKind = keyof typeof ALLOWED_UPLOADS;

/** The extension and the declared type can be forged, so the file's own signature decides. */
export function detectKind(buf: Buffer, originalName: string): UploadKind {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.pdf' && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (ext === '.docx' && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  throw badRequest('Upload a PDF or DOCX file. The file content must match its extension.');
}

export async function extractText(buf: Buffer, kind: UploadKind): Promise<{ text: string; signals: FormatSignals }> {
  try {
    if (kind === 'pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        const res = await parser.getText();
        const text = res.text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '').trim();
        return { text, signals: { kind, pages: res.total, charCount: text.length } };
      } finally {
        await parser.destroy();
      }
    }
    const { value: text } = await mammoth.extractRawText({ buffer: buf });
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return {
      text: text.trim(),
      signals: { kind, charCount: text.length, images: (html.match(/<img/g) ?? []).length, tables: (html.match(/<table/g) ?? []).length },
    };
  } catch (err) {
    logger.warn({ kind, message: (err as Error).message }, 'Resume text extraction failed');
    throw new AppError(422, 'UNREADABLE_FILE', 'We could not read this file. It may be damaged or password protected.');
  }
}

/** Stored names are random, and no user input reaches the path. */
export async function storeFile(userId: number, buf: Buffer, kind: UploadKind): Promise<string> {
  const rel = path.join(String(userId), `${crypto.randomUUID()}.${kind}`);
  const abs = path.join(env.storageDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
  await fs.writeFile(abs, buf, { mode: 0o600 });
  return rel.replace(/\\/g, '/');
}

export function resolveStored(rel: string): string {
  const abs = path.resolve(env.storageDir, rel);
  if (!abs.startsWith(env.storageDir + path.sep)) throw badRequest('Invalid file reference.');
  return abs;
}

export const readStored = (rel: string) => fs.readFile(resolveStored(rel));
export const removeStored = (rel: string) => fs.rm(resolveStored(rel), { force: true });

export const safeFileName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
