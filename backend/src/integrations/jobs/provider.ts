import { env } from '../../config/env';

export interface NormalizedJob {
  externalId: string; title: string; company: string; companyLogo?: string | null; companyWebsite?: string | null;
  description: string; location?: string | null; category?: string | null;
  workMode?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employmentType?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'unknown';
  salaryMin?: number | null; salaryMax?: number | null; salaryCurrency?: string | null;
  applyUrl?: string | null; sourceUrl?: string | null; postedAt?: Date | null;
}

/** Adapters may only call documented, authorised APIs. Add a source by implementing this and registering it below. */
export interface JobProvider {
  readonly code: string;
  /** Empty when ready; otherwise what must be configured. */
  missingConfig(): string[];
  fetchJobs(limit: number): Promise<NormalizedJob[]>;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Rolewise job sync' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const mapType = (t: string | undefined | null): NormalizedJob['employmentType'] => {
  const s = (t ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (s.includes('full')) return 'full_time';
  if (s.includes('part')) return 'part_time';
  if (s.includes('contract') || s.includes('freelance') || s.includes('temporary')) return 'contract';
  if (s.includes('intern')) return 'internship';
  return 'unknown';
};

/** Remotive's terms require naming and linking back to Remotive, and listings are delayed by 24 hours. */
class RemotiveProvider implements JobProvider {
  readonly code = 'remotive';
  missingConfig() { return []; }
  async fetchJobs(limit: number) {
    const data = await getJson<{ jobs: { id: number; url: string; title: string; company_name: string; company_logo?: string; category?: string; job_type?: string; publication_date?: string; candidate_required_location?: string; description: string }[] }>(
      `https://remotive.com/api/remote-jobs?limit=${limit}`);
    return data.jobs.map((j): NormalizedJob => ({
      externalId: String(j.id), title: j.title, company: j.company_name, companyLogo: j.company_logo ?? null,
      description: htmlToText(j.description), location: j.candidate_required_location ?? 'Remote', category: j.category ?? null,
      workMode: 'remote', employmentType: mapType(j.job_type), applyUrl: j.url, sourceUrl: j.url,
      postedAt: j.publication_date ? new Date(j.publication_date) : null,
    }));
  }
}

class ArbeitnowProvider implements JobProvider {
  readonly code = 'arbeitnow';
  missingConfig() { return []; }
  async fetchJobs(limit: number) {
    const data = await getJson<{ data: { slug: string; company_name: string; title: string; description: string; remote: boolean; url: string; tags?: string[]; job_types?: string[]; location?: string; created_at?: number }[] }>(
      'https://www.arbeitnow.com/api/job-board-api');
    return data.data.slice(0, limit).map((j): NormalizedJob => ({
      externalId: j.slug, title: j.title, company: j.company_name, description: htmlToText(j.description), location: j.location ?? null,
      category: j.tags?.[0] ?? null, workMode: j.remote ? 'remote' : 'unknown', employmentType: mapType(j.job_types?.[0]),
      applyUrl: j.url, sourceUrl: j.url, postedAt: j.created_at ? new Date(j.created_at * 1000) : null,
    }));
  }
}

class AdzunaProvider implements JobProvider {
  readonly code = 'adzuna';
  missingConfig() { return [...(env.ADZUNA_APP_ID ? [] : ['ADZUNA_APP_ID']), ...(env.ADZUNA_APP_KEY ? [] : ['ADZUNA_APP_KEY'])]; }
  async fetchJobs(limit: number) {
    const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(env.ADZUNA_COUNTRY)}/search/1?app_id=${encodeURIComponent(env.ADZUNA_APP_ID!)}&app_key=${encodeURIComponent(env.ADZUNA_APP_KEY!)}&results_per_page=${Math.min(limit, 50)}`;
    const data = await getJson<{ results: { id: string; title: string; description: string; redirect_url: string; created?: string; salary_min?: number; salary_max?: number; contract_time?: string; contract_type?: string; company?: { display_name?: string }; location?: { display_name?: string }; category?: { label?: string } }[] }>(url);
    return data.results.map((j): NormalizedJob => ({
      externalId: String(j.id), title: htmlToText(j.title), company: j.company?.display_name ?? 'Unknown company', description: htmlToText(j.description),
      location: j.location?.display_name ?? null, category: j.category?.label ?? null, employmentType: mapType(j.contract_time ?? j.contract_type),
      salaryMin: j.salary_min ? Math.round(j.salary_min) : null, salaryMax: j.salary_max ? Math.round(j.salary_max) : null,
      applyUrl: j.redirect_url, sourceUrl: j.redirect_url, postedAt: j.created ? new Date(j.created) : null,
    }));
  }
}

const registry: Record<string, JobProvider> = { remotive: new RemotiveProvider(), arbeitnow: new ArbeitnowProvider(), adzuna: new AdzunaProvider() };
export const getJobProvider = (code: string): JobProvider | null => registry[code] ?? null;
