export interface Page<T> { items: T[]; meta: PageMeta }
export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number; [k: string]: unknown }

export interface User {
  id: number; email: string; fullName: string; emailVerified: boolean; roles: string[];
  theme: 'light' | 'dark' | 'system'; emailNotifications: boolean; createdAt: string;
}

export interface ExperienceItem { title: string; company: string; location?: string; startDate?: string; endDate?: string; current?: boolean; bullets: string[] }
export interface EducationItem { degree: string; institution: string; field?: string; year?: string }
export interface ProjectItem { name: string; description: string; url?: string }
export interface StructuredResume {
  personal: { fullName: string; email: string; phone: string; location: string; linkedin: string; website: string };
  summary: string; experience: ExperienceItem[]; education: EducationItem[]; skills: string[]; certifications: string[];
  projects: ProjectItem[]; achievements: string[]; languages: string[]; sectionOrder?: string[];
}

export interface ResumeSummary {
  id: number; title: string; category: string | null; origin: string; is_default: number; template: string;
  version_count: number; last_score: number | null; file_name: string | null; updated_at: string; current_version_id: number | null;
}
export interface ResumeVersion {
  id: number; resume_id: number; version_no: number; label: string | null; change_source: string; raw_text: string; structured: StructuredResume;
  file_name: string | null; file_path: string | null; format_signals: { kind: string; pages?: number; charCount: number; images?: number; tables?: number } | null; created_at: string;
}
export interface VersionListItem { id: number; version_no: number; label: string | null; change_source: string; file_name: string | null; has_file: number; created_at: string }
export interface ResumeDetail { resume: ResumeSummary; version: ResumeVersion; versions: VersionListItem[] }

export interface KeywordRow { term: string; category: 'hard' | 'soft' | 'tool' | 'certification' | 'keyword'; status: 'matched' | 'missing' | 'recommended'; required: boolean; jobCount: number; resumeCount: number }
export interface ScoreLine { key: string; label: string; score: number; weight: number; formula: string; detail: string }
export interface ScanWarning { code: string; severity: 'info' | 'warning' | 'critical'; message: string; deduction: number }
export interface ScanReport {
  overall: number; lines: ScoreLine[]; keywords: KeywordRow[]; warnings: ScanWarning[]; suggestions: { area: string; message: string }[];
  sections: Record<string, boolean>; experience: { requiredYears: number | null; evidencedYears: number | null }; education: { required: string | null; found: string | null };
  achievements: { bullets: number; quantified: number }; softSkills: { matched: string[]; missing: string[] }; disclaimer: string; method: string;
}
export interface ScanListItem { id: number; resume_id: number; company: string | null; job_title: string; overall_score: number; created_at: string; resume_title: string; version_no: number }
export interface ScanDetail extends ScanListItem { version_id: number; job_id: number | null; job_description: string; resume_text: string; structured: StructuredResume; report: ScanReport; excluded_terms: string[] }

export interface Suggestion { id: number; kind: string; sectionPath: string; original: string | null; suggested: string; rationale: string | null; source: 'ai' | 'rule'; needsConfirmation: boolean; status: 'pending' | 'accepted' | 'rejected'; finalText: string | null }

export interface MatchBreakdown {
  score: number; components: { key: string; label: string; weight: number; score: number | null; note: string }[]; skillsMatched: string[]; skillsMissing: string[];
  experienceGap: string | null; reasons: string[]; improvements: string[]; unknown: string[]; disclaimer: string;
}
export interface Job {
  id: number; title: string; summary: string | null; location: string | null; work_mode: string; employment_type: string; experience_level: string; min_years: number | null;
  salary_min: number | null; salary_max: number | null; salary_currency: string | null; posted_at: string | null; is_demo: boolean; apply_url: string | null; source_url: string | null;
  company: string | null; company_logo: string | null; source_name: string; source_homepage: string | null; source_attribution: string | null; category: string | null; match_score: number | null; is_saved: boolean; skills: string[];
}
export interface JobDetail extends Omit<Job, 'skills'> { description: string; company_description: string | null; company_website: string | null; breakdown: MatchBreakdown | null; skills: { id: number; name: string; type: string; is_required: number }[] }
export interface JobMatch extends Job { breakdown: MatchBreakdown | null }

export type Stage = 'saved' | 'applied' | 'assessment' | 'interview' | 'offer' | 'rejected';
export interface Application {
  id: number; job_id: number | null; resume_version_id: number | null; cover_letter_id: number | null; company: string; job_title: string; location: string | null; salary: string | null;
  application_url: string | null; status: Stage; position: number; applied_at: string | null; follow_up_at: string | null; created_at: string; updated_at: string;
  resume_title: string | null; version_no: number | null; next_interview: string | null; note_count: number; job_description?: string | null;
}
export interface InterviewItem { id: number; scheduled_at: string; kind: string; location: string | null; notes: string | null }
export interface ApplicationDetail extends Application { history: { id: number; from_status: string | null; to_status: string; changed_at: string }[]; notes: { id: number; body: string; created_at: string }[]; interviews: InterviewItem[] }
export interface FollowUp { id: number; company: string; job_title: string; status: string; follow_up_at: string }

export interface CoverLetterVersion { id: number; version_no: number; body: string; source: 'ai' | 'template' | 'manual'; created_at: string }
export interface CoverLetter { id: number; company: string; job_title: string; job_description: string; tone: string; resume_version_id: number | null; updated_at: string; versions: CoverLetterVersion[] }
export interface CoverLetterItem { id: number; company: string; job_title: string; tone: string; updated_at: string; version_count: number; latest_source: string }

export interface AppNotification { id: number; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface ProfileData {
  headline: string | null; phone: string | null; location: string | null; targetTitle: string | null; yearsExperience: number | null; seniority: string | null;
  preferredWorkMode: string; preferredEmploymentType: string; preferredLocation: string | null; industry: string | null; salaryMin: number | null; linkedinUrl: string | null; websiteUrl: string | null;
  skills: { id: number; name: string; type: string }[];
}
export interface Completion { percent: number; items: { key: string; label: string; done: boolean; link: string }[] }
export interface Dashboard {
  range: { from: string; to: string };
  stats: { jobsDiscovered: number; jobsInRange: number; jobsSaved: number; applicationsSubmitted: number; interviewsScheduled: number; offersReceived: number; latestAtsScore: number | null; averageAtsScore: number | null; profileCompletion: number };
  latestScan: { id: number; overall_score: number; job_title: string; company: string | null } | null;
  completion: Completion; weeklyActivity: { week: string; count: number }[]; pipeline: { status: Stage; c: number }[]; recentScans: ScanListItem[]; recommendedJobs: Job[];
  upcomingInterviews: { id: number; scheduled_at: string; kind: string; location: string | null; application_id: number; company: string; job_title: string }[];
  followUps: FollowUp[]; timeline: { kind: string; title: string; detail: string; at: string; link: string }[];
}
