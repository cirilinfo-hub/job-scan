import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(10, 'Use at least 10 characters.').max(72, 'Use 72 characters or fewer.')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Include at least one letter and one number.');

export const registerSchema = z.object({ email, password, fullName: z.string().trim().min(2, 'Enter your name.').max(120) });
export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password.').max(200) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password });
export const verifySchema = z.object({ token: z.string().min(10).max(200) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });

export const accountSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  theme: z.enum(['light', 'dark', 'system']),
  emailNotifications: z.boolean(),
});

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);
const nullableUrl = z.string().trim().max(255).refine((v) => !v || /^https?:\/\//i.test(v), 'Links must start with http:// or https://').nullable().optional().transform((v) => v || null);

export const profileSchema = z.object({
  headline: nullableText(160), phone: nullableText(40), location: nullableText(120), targetTitle: nullableText(120),
  yearsExperience: z.number().min(0).max(60).nullable().optional(),
  seniority: z.enum(['intern', 'entry', 'mid', 'senior', 'lead', 'executive']).nullable().optional(),
  preferredWorkMode: z.enum(['remote', 'hybrid', 'onsite', 'any']).default('any'),
  preferredEmploymentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'any']).default('any'),
  preferredLocation: nullableText(120), industry: nullableText(80),
  salaryMin: z.number().int().min(0).nullable().optional(),
  linkedinUrl: nullableUrl, websiteUrl: nullableUrl,
  skillIds: z.array(z.number().int().positive()).max(100).optional(),
});
