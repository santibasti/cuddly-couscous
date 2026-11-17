// Where the rulebook is kept. Live system: the `ai_rulebook` table (Owner / Admin only, changed through the database functions of migration 0124).
// Demo build: this browser only (localStorage), with the same rules, so the screen can be tried safely.
import { CLOUD, supabase } from './cloud';
import type { RulebookVersion, Section } from './rulebook';

export interface RulebookApi { list(): Promise<RulebookVersion[]>; saveDraft(sections: Section[], title: string, note: string): Promise<number>; testsPassed(id: number, summary: unknown): Promise<void>; publish(id: number): Promise<void>; restore(id: number): Promise<number> }

const COLS = 'id, version, status, title, change_note, sections, tests_passed_at, created_at, published_at';
const cloud: RulebookApi = {
  async list() { const { data, error } = await supabase().from('ai_rulebook').select(COLS).order('version', { ascending: false }); if (error) throw new Error(error.message); return (data ?? []) as RulebookVersion[]; },
  async saveDraft(sections, title, note) { const { data, error } = await supabase().rpc('rulebook_save_draft', { p_sections: sections, p_title: title, p_note: note }); if (error) throw new Error(error.message); return Number(data); },
  async testsPassed(id, summary) { const { error } = await supabase().rpc('rulebook_tests_passed', { p_id: id, p_summary: summary }); if (error) throw new Error(error.message); },
  async publish(id) { const { error } = await supabase().rpc('rulebook_publish', { p_id: id }); if (error) throw new Error(error.message); },
  async restore(id) { const { data, error } = await supabase().rpc('rulebook_restore', { p_id: id }); if (error) throw new Error(error.message); return Number(data); },
};

const KEY = 'topmop.rulebook.demo';
const read = (): RulebookVersion[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RulebookVersion[]; } catch { return []; } };
const write = (v: RulebookVersion[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked: the demo just does not remember */ } };
const local: RulebookApi = {
  async list() { return read().sort((a, b) => b.version - a.version); },
  async saveDraft(sections, title, note) {
    const all = read(); const d = all.find((v) => v.status === 'draft');
    if (d) { Object.assign(d, { sections, title: title || d.title, change_note: note, tests_passed_at: null }); write(all); return d.id; }
    const id = Math.max(0, ...all.map((v) => v.id)) + 1; all.push({ id, version: Math.max(0, ...all.map((v) => v.version)) + 1, status: 'draft', title: title || 'TopMop AI Customer Service Rulebook', change_note: note, sections, tests_passed_at: null, created_at: new Date().toISOString(), published_at: null }); write(all); return id;
  },
  async testsPassed(id) { const all = read(); const d = all.find((v) => v.id === id && v.status === 'draft'); if (!d) throw new Error('Only the draft can be tested.'); d.tests_passed_at = new Date().toISOString(); write(all); },
  async publish(id) { const all = read(); const d = all.find((v) => v.id === id); if (!d || d.status !== 'draft') throw new Error('Only the draft can be published.'); if (!d.tests_passed_at) throw new Error('Run the tests on this draft first: it can be published only after they pass.'); for (const v of all) if (v.status === 'published') v.status = 'archived'; d.status = 'published'; d.published_at = new Date().toISOString(); write(all); },
  async restore(id) { const s = read().find((v) => v.id === id); if (!s) throw new Error('That version does not exist.'); return local.saveDraft(s.sections, s.title, `Restored from version ${s.version}`); },
};
export const rulebookApi = (): RulebookApi => (CLOUD ? cloud : local);
