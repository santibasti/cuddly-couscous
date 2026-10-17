// Reads the recognition boards for the signed-in account. In the live app a crew login can read only its own rows, so the boards come from
// database functions; in demo mode everything is computed from the local data.
import { CLOUD, supabase } from './cloud';
import { badgesOf, computeRecog, teamBoardLocal, type Recog, type TeamRow } from './recognition-core';
import type { DB } from './types';
import { addDays, monthStart, today } from './util';

export interface Person { id: string; full_name: string; position: string; avatar?: string; rating?: number; recog?: Recog }
export interface Board { top: Person[]; improved: Person[]; streaks: Person[]; perfect: Person[] }
export interface Praise { id: string; praise: string; crew: string; service: string; service_date: string }
export interface Award { kind: 'top1' | 'top2' | 'top3' | 'improved' | 'perfect' | 'streak'; employee_id: string; name: string; avatar?: string; reward: string }
export interface Recognition { id: string; month: string; awards: Award[]; announced_at: string }

export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
/** The last `n` months, newest first (YYYY-MM). */
export const recentMonths = (n = 6) => { const out: string[] = []; let m = monthStart(today()); for (let i = 0; i < n; i++) { out.push(m.slice(0, 7)); m = monthStart(addDays(m, -1)); } return out; };

export async function loadBoard(db: DB): Promise<Board> {
  if (CLOUD) {
    const { data } = await supabase().rpc('recognition_board');
    const b = (data ?? {}) as Partial<Board>; const fix = (l?: Person[]) => (l ?? []).map((p) => ({ ...p, rating: p.rating === undefined || p.rating === null ? undefined : Number(p.rating) }));
    return { top: fix(b.top), improved: fix(b.improved), streaks: fix(b.streaks), perfect: fix(b.perfect) };
  }
  const people: Person[] = db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive').map((e) => ({ id: e.id, full_name: e.full_name, position: e.position, avatar: e.avatar, rating: e.rating, recog: e.recog ?? computeRecog(db, e) }));
  return {
    top: people.filter((p) => p.rating !== undefined).sort((a, b) => b.rating! - a.rating! || a.full_name.localeCompare(b.full_name)).slice(0, 3),
    improved: people.filter((p) => (p.recog?.delta ?? 0) >= 0.1).sort((a, b) => b.recog!.delta! - a.recog!.delta!).slice(0, 3),
    streaks: people.filter((p) => (p.recog?.streak ?? 0) >= 5).sort((a, b) => b.recog!.streak - a.recog!.streak).slice(0, 6),
    perfect: people.filter((p) => p.recog?.perfect).slice(0, 12),
  };
}
export const badgesFor = (p: Person) => badgesOf(p.recog);

export async function loadPraise(db: DB, n = 8): Promise<Praise[]> {
  if (CLOUD) {
    const { data } = await supabase().rpc('praise_wall', { p_n: n });
    return ((data ?? []) as { id: string; praise: string; crew: string; service: string; service_date: string }[]).map((r) => ({ ...r }));
  }
  const name = (id: string) => db.employees.find((e) => e.id === id)?.full_name.split(' ')[0] ?? '';
  return db.client_feedback.filter((f) => !f.deleted_at && f.rating === 3 && (f.comment ?? '').trim()).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, n)
    .map((f) => ({ id: f.id, praise: f.comment!.trim().slice(0, 280), crew: [f.leader_id, ...f.crew_ids].filter(Boolean).map((i) => name(i!)).filter(Boolean).join(', '), service: f.service_codes.map((c) => db.services.find((s) => s.code === c)?.name ?? c).join(', '), service_date: f.service_date }));
}

export async function loadTeams(db: DB, month: string): Promise<TeamRow[]> {
  if (CLOUD) { const { data } = await supabase().rpc('team_board', { p_month: month }); return ((data ?? []) as TeamRow[]).map((r) => ({ ...r })); }
  return teamBoardLocal(db, month);
}

const KEY = 'topmop-recognitions';
export async function loadRecognitions(): Promise<Recognition[]> {
  if (CLOUD) { const { data } = await supabase().from('recognitions').select('*').order('month', { ascending: false }).limit(12); return (data ?? []) as Recognition[]; }
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Recognition[]; } catch { return []; }
}
export async function announce(month: string, awards: Award[]): Promise<void> {
  const rec = { month, awards, announced_at: new Date().toISOString() };
  if (CLOUD) { const { error } = await supabase().from('recognitions').upsert(rec, { onConflict: 'month' }); if (error) throw new Error(error.message); return; }
  const all = (await loadRecognitions()).filter((r) => r.month !== month); all.unshift({ id: crypto.randomUUID(), ...rec });
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 12))); } catch { /* demo only */ }
}
