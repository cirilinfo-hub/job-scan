export interface ExperienceItem {
  title: string; company: string; location?: string;
  startDate?: string; endDate?: string; current?: boolean; bullets: string[];
}
export interface EducationItem { degree: string; institution: string; field?: string; year?: string }
export interface ProjectItem { name: string; description: string; url?: string }

export interface StructuredResume {
  personal: { fullName: string; email: string; phone: string; location: string; linkedin: string; website: string };
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications: string[];
  projects: ProjectItem[];
  achievements: string[];
  languages: string[];
  sectionOrder?: string[];
}

export const DEFAULT_SECTION_ORDER = ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'achievements', 'languages'];

export const emptyResume = (): StructuredResume => ({
  personal: { fullName: '', email: '', phone: '', location: '', linkedin: '', website: '' },
  summary: '', experience: [], education: [], skills: [], certifications: [], projects: [], achievements: [], languages: [],
  sectionOrder: [...DEFAULT_SECTION_ORDER],
});

/** Facts about the original file that text alone cannot show. Absent for pasted or built resumes. */
export interface FormatSignals {
  kind: 'pdf' | 'docx';
  pages?: number;
  charCount: number;
  images?: number;
  tables?: number;
}

export interface SkillEntry { id: number; name: string; type: 'hard' | 'soft' | 'tool' | 'certification'; terms: string[] }
