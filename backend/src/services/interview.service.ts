import { z } from 'zod';
import { exec, json, one, query, tx } from '../config/db';
import { PROMPTS } from '../integrations/ai/prompts';
import { resumeRepo } from '../repositories/resume.repository';
import { badRequest, notFound } from '../utils/errors';
import { aiService } from './ai.service';

const category = z.enum(['behavioral', 'technical', 'hr', 'scenario', 'job_specific']);
export const questionsQuery = z.object({ category: category.optional(), roleFamily: z.string().trim().max(60).optional() });
export const generateSchema = z.object({
  jobTitle: z.string().trim().min(2).max(200), company: z.string().trim().max(150).optional(),
  jobDescription: z.string().trim().max(50000).default(''), count: z.number().int().min(3).max(15).default(8),
});
export const sessionSchema = z.object({
  title: z.string().trim().min(1).max(200), jobTitle: z.string().trim().max(200).optional(), company: z.string().trim().max(150).optional(),
  questionIds: z.array(z.number().int().positive()).min(1).max(20),
});
export const answerSchema = z.object({ answer: z.string().trim().min(1, 'Write your answer first.').max(10000) });

export const STAR_GUIDE = [
  { key: 'situation', label: 'Situation', hint: 'Set the scene in a sentence or two.' },
  { key: 'task', label: 'Task', hint: 'What was your responsibility or goal?' },
  { key: 'action', label: 'Action', hint: 'What did you personally do? Say "I", not "we".' },
  { key: 'result', label: 'Result', hint: 'What changed? Use real figures where you can.' },
];

const MARKERS: Record<string, RegExp> = {
  situation: /\b(when|while|at my|in my|last year|our team|the company|there was|we had|during)\b/i,
  task: /\b(needed to|my goal|my role|responsible|asked to|had to|task|objective|challenge)\b/i,
  action: /\b(i (led|built|created|designed|implemented|decided|organi[sz]ed|wrote|analy[sz]ed|worked|spoke|set up|started|changed|reviewed|fixed|proposed|used))\b/i,
  result: /\b(result|as a result|outcome|increased|reduced|improved|saved|grew|delivered|achieved|led to|%|\d+)\b/i,
};

/** Simple text checks, clearly labelled as such. They look at structure and can't judge quality or truth. */
export function ruleFeedback(answer: string, cat: string) {
  const words = answer.split(/\s+/).filter(Boolean).length;
  const notes: string[] = [];
  const star = Object.fromEntries(Object.entries(MARKERS).map(([k, re]) => [k, re.test(answer)]));
  if (words < 50) notes.push(`Your answer is ${words} words. Most spoken answers need more detail, roughly 100 to 250 words.`);
  else if (words > 350) notes.push(`Your answer is ${words} words. Try to tighten it; long answers can lose the listener.`);
  if (cat === 'behavioral' || cat === 'scenario') {
    for (const g of STAR_GUIDE) if (!star[g.key]) notes.push(`We couldn't spot the ${g.label} part. ${g.hint}`);
  }
  if (!/\d/.test(answer)) notes.push('Consider adding a real figure, such as a size, time or percentage.');
  const weCount = (answer.match(/\bwe\b/gi) ?? []).length;
  const iCount = (answer.match(/\bI\b/g) ?? []).length;
  if (weCount > iCount && weCount > 2) notes.push('You say "we" more than "I". Make your own contribution clear.');
  return { words, star, notes, method: 'rule-based' as const };
}

async function requireSession(userId: number, id: number) {
  const s = await one<{ id: number; status: string }>('SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?', [id, userId]);
  if (!s) throw notFound('Interview session');
  return s;
}

export const interviewService = {
  guide: () => ({ star: STAR_GUIDE, categories: ['behavioral', 'technical', 'hr', 'scenario', 'job_specific'] }),

  async roleFamilies() {
    return (await query<{ role_family: string }>('SELECT DISTINCT role_family FROM interview_questions WHERE user_id IS NULL ORDER BY role_family')).map((r) => r.role_family);
  },

  /** The shared bank, plus the questions generated for this user. */
  questions(userId: number, q: z.infer<typeof questionsQuery>) {
    const clauses = ['(user_id IS NULL OR user_id = ?)'];
    const params: (string | number)[] = [userId];
    if (q.category) { clauses.push('category = ?'); params.push(q.category); }
    if (q.roleFamily) { clauses.push('role_family = ?'); params.push(q.roleFamily); }
    return query(`SELECT id, category, role_family, question, guidance, sample_answer, source FROM interview_questions WHERE ${clauses.join(' AND ')} ORDER BY user_id IS NULL, category, id LIMIT 200`, params);
  },

  async generate(userId: number, b: z.infer<typeof generateSchema>) {
    const resume = await resumeRepo.defaultFor(userId);
    const raw = resume?.current_version_id ? await resumeRepo.version(resume.id, resume.current_version_id) : null;
    const out = await aiService.generate(PROMPTS.interviewQuestions, {
      count: String(b.count), jobTitle: b.jobTitle, company: b.company ?? '', job: b.jobDescription, resume: raw?.raw_text ?? '',
    }, userId);
    const ids: number[] = [];
    for (const q of out.questions) {
      const res = await exec(`INSERT INTO interview_questions (user_id, category, role_family, question, guidance, sample_answer, source) VALUES (?,?,?,?,?,?,'ai')`,
        [userId, q.category, b.jobTitle.slice(0, 60), q.question, q.guidance, q.sampleAnswer]);
      ids.push(res.insertId);
    }
    return { ids, questions: await this.questions(userId, { roleFamily: b.jobTitle.slice(0, 60) }) };
  },

  sessions: (userId: number) => query(
    `SELECT s.id, s.title, s.job_title, s.company, s.status, s.created_at, s.completed_at,
       (SELECT COUNT(*) FROM interview_answers a WHERE a.session_id = s.id) AS total,
       (SELECT COUNT(*) FROM interview_answers a WHERE a.session_id = s.id AND a.answered_at IS NOT NULL) AS answered
     FROM interview_sessions s WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 50`, [userId]),

  async createSession(userId: number, b: z.infer<typeof sessionSchema>) {
    const rows = await query<{ id: number }>(`SELECT id FROM interview_questions WHERE id IN (${b.questionIds.map(() => '?').join(',')}) AND (user_id IS NULL OR user_id = ?)`, [...b.questionIds, userId]);
    if (rows.length !== new Set(b.questionIds).size) throw badRequest('One or more questions were not found.');
    const id = await tx(async (db) => {
      const res = await exec('INSERT INTO interview_sessions (user_id, title, job_title, company) VALUES (?,?,?,?)', [userId, b.title, b.jobTitle ?? null, b.company ?? null], db);
      let position = 0;
      for (const qid of new Set(b.questionIds)) await exec('INSERT INTO interview_answers (session_id, question_id, position) VALUES (?,?,?)', [res.insertId, qid, position++], db);
      return res.insertId;
    });
    return this.session(userId, id);
  },

  async session(userId: number, id: number) {
    const s = await requireSession(userId, id);
    const answers = await query<{ rule_feedback: unknown; ai_feedback: unknown }>(
      `SELECT a.id, a.question_id, a.position, a.answer, a.rule_feedback, a.ai_feedback, a.answered_at, q.question, q.category, q.guidance, q.sample_answer
       FROM interview_answers a JOIN interview_questions q ON q.id = a.question_id WHERE a.session_id = ? ORDER BY a.position`, [id]);
    return { ...s, answers: answers.map((a) => ({ ...a, rule_feedback: json(a.rule_feedback, null), ai_feedback: json(a.ai_feedback, null) })) };
  },

  async answer(userId: number, sessionId: number, answerId: number, answer: string) {
    await requireSession(userId, sessionId);
    const row = await one<{ category: string }>(`SELECT q.category FROM interview_answers a JOIN interview_questions q ON q.id = a.question_id WHERE a.id = ? AND a.session_id = ?`, [answerId, sessionId]);
    if (!row) throw notFound('Question');
    await exec('UPDATE interview_answers SET answer = ?, rule_feedback = CAST(? AS JSON), ai_feedback = NULL, answered_at = UTC_TIMESTAMP() WHERE id = ?', [answer, JSON.stringify(ruleFeedback(answer, row.category)), answerId]);
    return this.session(userId, sessionId);
  },

  async aiFeedback(userId: number, sessionId: number, answerId: number) {
    await requireSession(userId, sessionId);
    const row = await one<{ answer: string | null; question: string }>(`SELECT a.answer, q.question FROM interview_answers a JOIN interview_questions q ON q.id = a.question_id WHERE a.id = ? AND a.session_id = ?`, [answerId, sessionId]);
    if (!row) throw notFound('Question');
    if (!row.answer) throw badRequest('Save an answer first.');
    const out = await aiService.generate(PROMPTS.interviewFeedback, { question: row.question, answer: row.answer }, userId);
    await exec('UPDATE interview_answers SET ai_feedback = CAST(? AS JSON) WHERE id = ?', [JSON.stringify(out), answerId]);
    return this.session(userId, sessionId);
  },

  async complete(userId: number, id: number) {
    await requireSession(userId, id);
    await exec(`UPDATE interview_sessions SET status = 'completed', completed_at = UTC_TIMESTAMP() WHERE id = ?`, [id]);
    return this.session(userId, id);
  },

  async removeSession(userId: number, id: number) {
    await requireSession(userId, id);
    await exec('DELETE FROM interview_sessions WHERE id = ?', [id]);
  },
};
