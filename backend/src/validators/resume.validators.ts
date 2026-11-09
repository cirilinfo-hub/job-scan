import { z } from 'zod';

const s = (max: number) => z.string().trim().max(max).default('');
const opt = (max: number) => z.string().trim().max(max).optional();

export const structuredResumeSchema = z.object({
  personal: z.object({ fullName: s(120), email: s(254), phone: s(40), location: s(120), linkedin: s(255), website: s(255) }),
  summary: s(4000),
  experience: z.array(z.object({
    title: s(150), company: s(150), location: opt(150), startDate: opt(30), endDate: opt(30), current: z.boolean().optional(),
    bullets: z.array(z.string().trim().max(1000)).max(30).default([]),
  })).max(30).default([]),
  education: z.array(z.object({ degree: s(150), institution: s(150), field: opt(150), year: opt(20) })).max(15).default([]),
  skills: z.array(z.string().trim().max(60)).max(100).default([]),
  certifications: z.array(z.string().trim().max(200)).max(30).default([]),
  projects: z.array(z.object({ name: s(150), description: s(1500), url: opt(255) })).max(20).default([]),
  achievements: z.array(z.string().trim().max(500)).max(30).default([]),
  languages: z.array(z.string().trim().max(60)).max(20).default([]),
  sectionOrder: z.array(z.enum(['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'achievements', 'languages'])).max(8).optional(),
});

export const templateId = z.enum(['classic', 'modern', 'compact']);
export const updateMetaSchema = z.object({ title: z.string().trim().min(1).max(150), category: z.string().trim().max(60).nullable().optional(), template: templateId.optional() });
export const saveVersionSchema = z.object({ structured: structuredResumeSchema, label: z.string().trim().max(150).nullable().optional() });
export const builderCreateSchema = z.object({ title: z.string().trim().min(1).max(150), category: z.string().trim().max(60).nullable().optional(), template: templateId.default('classic'), structured: structuredResumeSchema });
export const builderRenderSchema = z.object({ template: templateId.default('classic'), format: z.enum(['pdf', 'docx']), structured: structuredResumeSchema });
