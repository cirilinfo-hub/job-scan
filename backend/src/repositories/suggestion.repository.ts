import { RowDataPacket } from 'mysql2';
import { exec, one, query } from '../config/db';

export interface SuggestionRow extends RowDataPacket {
  id: number; user_id: number; version_id: number; scan_id: number | null; kind: string; section_path: string;
  original_text: string | null; suggested_text: string; rationale: string | null; source: 'ai' | 'rule';
  needs_confirmation: number; status: 'pending' | 'accepted' | 'rejected'; final_text: string | null;
}

export const suggestionRepo = {
  async add(userId: number, versionId: number, scanId: number | null, s: { kind: string; sectionPath: string; original: string | null; suggested: string; rationale: string; needsConfirmation: boolean; source: 'ai' | 'rule' }) {
    await exec(
      `INSERT INTO resume_suggestions (user_id, version_id, scan_id, kind, section_path, original_text, suggested_text, rationale, source, needs_confirmation) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [userId, versionId, scanId, s.kind, s.sectionPath, s.original, s.suggested, s.rationale, s.source, s.needsConfirmation ? 1 : 0]);
  },
  list: (userId: number, versionId: number) => query<SuggestionRow>(`SELECT * FROM resume_suggestions WHERE user_id = ? AND version_id = ? ORDER BY status = 'pending' DESC, id`, [userId, versionId]),
  byId: (userId: number, id: number) => one<SuggestionRow>('SELECT * FROM resume_suggestions WHERE id = ? AND user_id = ?', [id, userId]),
  decide: (id: number, status: string, finalText: string | null) => exec('UPDATE resume_suggestions SET status = ?, final_text = ?, decided_at = UTC_TIMESTAMP() WHERE id = ?', [status, finalText, id]),
  clearPending: (userId: number, versionId: number, source: string) => exec(`DELETE FROM resume_suggestions WHERE user_id = ? AND version_id = ? AND status = 'pending' AND source = ?`, [userId, versionId, source]),
};
