import { z } from 'zod';

export const scoringRulesSchema = z.object({
  weights: z.object({
    skills: z.number().min(0), keywords: z.number().min(0), experience: z.number().min(0),
    title: z.number().min(0), formatting: z.number().min(0), education: z.number().min(0),
  }).refine((w) => Object.values(w).reduce((a, b) => a + b, 0) > 0, 'At least one weight must be above zero'),
  requiredSkillMultiplier: z.number().min(1).max(5),
  softSkillWeight: z.number().min(0).max(1),
  neutralExperienceScore: z.number().min(0).max(100),
  unverifiedExperienceScore: z.number().min(0).max(100),
  deductions: z.object({
    missingEmail: z.number().min(0), missingPhone: z.number().min(0), missingSummary: z.number().min(0),
    missingExperience: z.number().min(0), missingEducation: z.number().min(0), missingSkills: z.number().min(0),
    tooShort: z.number().min(0), tooLong: z.number().min(0), imagesOrTables: z.number().min(0), lowTextPdf: z.number().min(0),
  }),
});

export type ScoringRules = z.infer<typeof scoringRulesSchema>;

export const DEFAULT_SCORING_RULES: ScoringRules = {
  weights: { skills: 35, keywords: 20, experience: 15, title: 15, formatting: 10, education: 5 },
  requiredSkillMultiplier: 2,
  softSkillWeight: 0.5,
  neutralExperienceScore: 70,
  unverifiedExperienceScore: 40,
  deductions: {
    missingEmail: 20, missingPhone: 5, missingSummary: 5, missingExperience: 25, missingEducation: 10,
    missingSkills: 15, tooShort: 15, tooLong: 10, imagesOrTables: 10, lowTextPdf: 40,
  },
};

export const SCORE_DISCLAIMER =
  'This is an estimate from Rolewise\'s published rules, comparing your resume text with this job description. ' +
  'It is not the score of any employer\'s applicant tracking system, and it does not predict whether you will get an interview or be hired.';
