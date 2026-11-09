import { one, query } from '../config/db';
import { jobRepo } from '../repositories/job.repository';
import { trackerRepo } from '../repositories/tracker.repository';
import { scanRepo } from '../repositories/scan.repository';
import { matchingService } from './matching.service';
import { present } from './job.service';
import { profileService } from './profile.service';

export interface Range { from: Date; to: Date }

const count = async (sql: string, params: (number | Date | string)[]) => (await one<{ c: number }>(sql, params))?.c ?? 0;

export const dashboardService = {
  async overview(userId: number, range: Range) {
    await matchingService.ensureFresh(userId);
    const p = [userId, range.from, range.to] as (number | Date)[];
    const [jobsDiscovered, jobsInRange, saved, applied, interviews, offers, latestScan, avgScan, completion, recentScans, upcoming, followUps, recommended] = await Promise.all([
      count('SELECT COUNT(*) c FROM jobs WHERE is_active = 1', []),
      count('SELECT COUNT(*) c FROM jobs WHERE is_active = 1 AND created_at BETWEEN ? AND ?', [range.from, range.to]),
      count('SELECT COUNT(*) c FROM saved_jobs WHERE user_id = ? AND created_at BETWEEN ? AND ?', p),
      count(`SELECT COUNT(DISTINCT h.application_id) c FROM application_status_history h JOIN job_applications a ON a.id = h.application_id
             WHERE a.user_id = ? AND a.deleted_at IS NULL AND h.to_status = 'applied' AND h.changed_at BETWEEN ? AND ?`, p),
      count(`SELECT COUNT(*) c FROM interviews i JOIN job_applications a ON a.id = i.application_id WHERE a.user_id = ? AND a.deleted_at IS NULL AND i.scheduled_at BETWEEN ? AND ?`, p),
      count(`SELECT COUNT(DISTINCT h.application_id) c FROM application_status_history h JOIN job_applications a ON a.id = h.application_id
             WHERE a.user_id = ? AND a.deleted_at IS NULL AND h.to_status = 'offer' AND h.changed_at BETWEEN ? AND ?`, p),
      one<{ overall_score: number; job_title: string; company: string | null; created_at: Date; id: number }>('SELECT id, overall_score, job_title, company, created_at FROM resume_scans WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [userId]),
      one<{ a: number | null }>('SELECT ROUND(AVG(overall_score)) a FROM resume_scans WHERE user_id = ? AND created_at BETWEEN ? AND ?', p),
      profileService.completion(userId),
      scanRepo.list(userId, 5, 0),
      query(`SELECT i.id, i.scheduled_at, i.kind, i.location, a.id AS application_id, a.company, a.job_title FROM interviews i JOIN job_applications a ON a.id = i.application_id
             WHERE a.user_id = ? AND a.deleted_at IS NULL AND i.scheduled_at >= UTC_TIMESTAMP() ORDER BY i.scheduled_at LIMIT 5`, [userId]),
      trackerRepo.followUpsDue(userId, 7),
      jobRepo.matchList(userId, 0, 4, 0),
    ]);

    return {
      stats: {
        jobsDiscovered, jobsInRange, jobsSaved: saved, applicationsSubmitted: applied, interviewsScheduled: interviews, offersReceived: offers,
        latestAtsScore: latestScan?.overall_score ?? null, averageAtsScore: avgScan?.a ?? null,
        profileCompletion: completion.percent,
      },
      latestScan,
      completion,
      weeklyActivity: await this.weekly(userId, range),
      pipeline: await query<{ status: string; c: number }>(`SELECT status, COUNT(*) c FROM job_applications WHERE user_id = ? AND deleted_at IS NULL GROUP BY status`, [userId]),
      recentScans,
      recommendedJobs: (recommended as Record<string, unknown>[]).map(present),
      upcomingInterviews: upcoming,
      followUps,
      timeline: await this.timeline(userId, range),
    };
  },

  /** Applications per ISO week, with empty weeks filled in so the chart's axis stays continuous. */
  async weekly(userId: number, range: Range) {
    const rows = await query<{ wk: string; c: number }>(
      `SELECT DATE_FORMAT(DATE_SUB(DATE(h.changed_at), INTERVAL WEEKDAY(h.changed_at) DAY), '%Y-%m-%d') wk, COUNT(DISTINCT h.application_id) c
       FROM application_status_history h JOIN job_applications a ON a.id = h.application_id
       WHERE a.user_id = ? AND a.deleted_at IS NULL AND h.to_status = 'applied' AND h.changed_at BETWEEN ? AND ? GROUP BY wk`, [userId, range.from, range.to]);
    const map = new Map(rows.map((r) => [r.wk, r.c]));
    const out: { week: string; count: number }[] = [];
    const d = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    while (d <= range.to && out.length < 60) {
      const key = d.toISOString().slice(0, 10);
      out.push({ week: key, count: map.get(key) ?? 0 });
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  },

  timeline(userId: number, range: Range) {
    const p = [userId, range.from, range.to];
    return query(
      `(SELECT 'scan' AS kind, CONCAT('Scanned against ', s.job_title) AS title, CONCAT(s.overall_score, '% estimated match') AS detail, s.created_at AS at, CONCAT('/scanner/', s.id) AS link
          FROM resume_scans s WHERE s.user_id = ? AND s.created_at BETWEEN ? AND ?)
       UNION ALL
       (SELECT 'application', CONCAT(a.company, ': ', a.job_title), CONCAT('Moved to ', h.to_status), h.changed_at, '/tracker'
          FROM application_status_history h JOIN job_applications a ON a.id = h.application_id WHERE a.user_id = ? AND a.deleted_at IS NULL AND h.changed_at BETWEEN ? AND ?)
       UNION ALL
       (SELECT 'resume', r.title, CONCAT('Version ', v.version_no, ' saved'), v.created_at, CONCAT('/resumes/', r.id)
          FROM resume_versions v JOIN resumes r ON r.id = v.resume_id WHERE r.user_id = ? AND r.deleted_at IS NULL AND v.created_at BETWEEN ? AND ?)
       UNION ALL
       (SELECT 'letter', CONCAT('Cover letter for ', c.company), c.job_title, c.created_at, CONCAT('/cover-letters/', c.id)
          FROM cover_letters c WHERE c.user_id = ? AND c.deleted_at IS NULL AND c.created_at BETWEEN ? AND ?)
       ORDER BY at DESC LIMIT 15`, [...p, ...p, ...p, ...p]);
  },
};
