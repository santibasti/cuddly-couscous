// Announcements, rewards, awards and recognition from TopMop to the crew and staff.
// Live site: the announcements / announcement_reactions tables (row-level security decides who sees what). Demo: this browser only.
import { useEffect, useSyncExternalStore } from 'react';
import { CLOUD, supabase } from './cloud';
import { store } from './store';
import { today, uid } from './util';

export type AnnKind = 'Reward' | 'Award' | 'Recognition' | 'Announcement' | 'Reminder';
export const KINDS: Record<AnnKind, { icon: string; tone: string; blurb: string }> = {
  Reward: { icon: '🎁', tone: 'amber', blurb: 'A bonus, gift or perk' },
  Award: { icon: '🏆', tone: 'gold', blurb: 'Employee of the month, best crew …' },
  Recognition: { icon: '🙌', tone: 'teal', blurb: 'A thank-you for good work' },
  Announcement: { icon: '📣', tone: 'blue', blurb: 'News for everyone' },
  Reminder: { icon: '⏰', tone: 'red', blurb: 'Something to do or remember' },
};
export const EMOJI = ['👏', '🎉', '❤️', '💪'] as const;
export type Emoji = (typeof EMOJI)[number];
export type Audience = 'all' | 'leaders' | 'people';

export interface Announcement {
  id: string; created_at: string; created_by?: string;
  kind: AnnKind; title: string; body: string; awardee_ids: string[]; reward?: string | null;
  audience: Audience; audience_ids: string[]; pinned: boolean; status: 'Draft' | 'Published' | 'Archived';
  publish_at?: string | null; expires_on?: string | null; deleted_at?: string | null;
}
export type AnnInput = Pick<Announcement, 'kind' | 'title' | 'body' | 'awardee_ids' | 'reward' | 'audience' | 'audience_ids' | 'pinned' | 'status' | 'publish_at' | 'expires_on'>;
export interface MyState { seen: boolean; reaction: Emoji | null }
export interface Stats { seen: number; reactions: Partial<Record<Emoji, number>> }

/** Is this announcement meant for this person right now? (The database applies the same rule on the live site.) */
export function visibleTo(a: Announcement, who: { role: string; employeeId?: string | null }, now = new Date().toISOString(), day = today()): boolean {
  if (a.deleted_at || a.status !== 'Published') return false;
  if (a.publish_at && a.publish_at > now) return false;
  if (a.expires_on && a.expires_on < day) return false;
  if (a.awardee_ids.includes(who.employeeId ?? '')) return true;
  if (a.audience === 'all') return true;
  if (a.audience === 'leaders') return ['leader', 'ops', 'owner'].includes(who.role);
  return !!who.employeeId && a.audience_ids.includes(who.employeeId);
}

/* ---------- storage ---------- */
const DEMO = 'topmop-announce-demo';
interface DemoDb { items: Announcement[]; mine: Record<string, Record<string, MyState>>; stats: Record<string, Stats> }   // mine: per signed-in person, then per announcement
const demoLoad = (): DemoDb => { try { return { items: [], mine: {}, stats: {}, ...(JSON.parse(localStorage.getItem(DEMO) ?? '{}') as Partial<DemoDb>) }; } catch { return { items: [], mine: {}, stats: {} }; } };
const demoSave = (d: DemoDb) => { try { localStorage.setItem(DEMO, JSON.stringify(d)); } catch { /* storage full: nothing to do in the demo */ } };

/* ---------- the feed every screen shares ---------- */
interface Feed { items: Announcement[]; mine: Record<string, MyState>; stats: Record<string, Stats>; loaded: boolean }
let feed: Feed = { items: [], mine: {}, stats: {}, loaded: false };
const listeners = new Set<() => void>();
let users = 0; let timer: ReturnType<typeof setInterval> | undefined;
const set = (f: Feed) => { feed = f; listeners.forEach((l) => l()); };

export async function refreshAnnouncements(): Promise<void> {
  if (!store.user) return;
  if (!CLOUD) { const d = demoLoad(); set({ items: d.items.filter((a) => !a.deleted_at).sort(byNewest), mine: d.mine[store.user.id] ?? {}, stats: d.stats, loaded: true }); return; }
  try {
    const { data, error } = await supabase().from('announcements').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(60);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) { set({ ...feed, loaded: true }); return; } throw new Error(error.message); }
    const items = ((data ?? []) as Announcement[]).sort(byNewest);
    const ids = items.map((a) => a.id);
    const [mine, st] = ids.length ? await Promise.all([
      supabase().from('announcement_reactions').select('announcement_id, reaction').eq('user_id', store.user.id).in('announcement_id', ids),
      supabase().rpc('announcement_stats', { p_ids: ids }),
    ]) : [{ data: [] }, { data: [] }];
    const m: Record<string, MyState> = {}; for (const r of (mine.data ?? []) as { announcement_id: string; reaction: Emoji | null }[]) m[r.announcement_id] = { seen: true, reaction: r.reaction };
    const s: Record<string, Stats> = {}; for (const r of (st.data ?? []) as { announcement_id: string; seen: number; reactions: Stats['reactions'] }[]) s[r.announcement_id] = { seen: r.seen, reactions: r.reactions ?? {} };
    set({ items, mine: m, stats: s, loaded: true });
  } catch { set({ ...feed, loaded: true }); /* offline: keep what is on screen */ }
}
const byNewest = (a: Announcement, b: Announcement) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at);

/** The announcements this person can see, which ones are new to them, and the totals. Starts checking every 2 minutes while the app is open. */
export function useAnnouncements() {
  const f = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => feed);
  useEffect(() => { users += 1; if (users === 1) { void refreshAnnouncements(); timer = setInterval(() => { if (!document.hidden) void refreshAnnouncements(); }, 120000); } else if (!feed.loaded) void refreshAnnouncements(); return () => { users -= 1; if (users === 0 && timer) { clearInterval(timer); timer = undefined; } }; }, [store.user?.id]);
  const u = store.user; const emp = u?.employee_id ?? null;
  const items = u ? f.items.filter((a) => visibleTo(a, { role: u.role, employeeId: emp })) : [];
  const unread = items.filter((a) => !f.mine[a.id]?.seen);
  return { items, all: f.items, unread, mine: f.mine, stats: f.stats, loaded: f.loaded };
}

/* ---------- reading / reacting ---------- */
export async function markSeen(ids: string[]): Promise<void> {
  const u = store.user; if (!u) return; const todo = ids.filter((id) => !feed.mine[id]?.seen); if (!todo.length) return;
  const mine = { ...feed.mine }; for (const id of todo) mine[id] = { seen: true, reaction: mine[id]?.reaction ?? null };
  set({ ...feed, mine });
  if (!CLOUD) { const d = demoLoad(); const me = (d.mine[u.id] ??= {}); for (const id of todo) { me[id] = { seen: true, reaction: me[id]?.reaction ?? null }; d.stats[id] = { seen: (d.stats[id]?.seen ?? 0) + 1, reactions: d.stats[id]?.reactions ?? {} }; } demoSave(d); return; }
  await supabase().from('announcement_reactions').upsert(todo.map((id) => ({ announcement_id: id, user_id: u.id })), { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
  void refreshAnnouncements();
}
export async function react(id: string, emoji: Emoji | null): Promise<void> {
  const u = store.user; if (!u) return; const was = feed.mine[id]?.reaction ?? null;
  const st = feed.stats[id] ?? { seen: 1, reactions: {} }; const reactions = { ...st.reactions };
  if (was) reactions[was] = Math.max(0, (reactions[was] ?? 1) - 1);
  if (emoji) reactions[emoji] = (reactions[emoji] ?? 0) + 1;
  set({ ...feed, mine: { ...feed.mine, [id]: { seen: true, reaction: emoji } }, stats: { ...feed.stats, [id]: { ...st, reactions } } });
  if (!CLOUD) { const d = demoLoad(); (d.mine[u.id] ??= {})[id] = { seen: true, reaction: emoji }; d.stats[id] = { seen: Math.max(1, d.stats[id]?.seen ?? 1), reactions }; demoSave(d); return; }
  const { error } = await supabase().from('announcement_reactions').upsert({ announcement_id: id, user_id: u.id, reaction: emoji, seen_at: new Date().toISOString() }, { onConflict: 'announcement_id,user_id' });
  if (error) { void refreshAnnouncements(); throw new Error(error.message); }
}

/* ---------- posting (Owner) ---------- */
export async function saveAnnouncement(input: AnnInput, id?: string): Promise<void> {
  store.require('announce.manage');
  if (!input.title.trim()) throw new Error('Give the announcement a title.');
  if (input.audience === 'people' && !input.audience_ids.length) throw new Error('Choose who should see it.');
  if (['Reward', 'Award', 'Recognition'].includes(input.kind) && input.status === 'Published' && !input.awardee_ids.length && input.audience !== 'all') { /* allowed: a team-wide thank-you */ }
  const row = { ...input, title: input.title.trim(), body: input.body.trim(), reward: input.reward?.trim() || null, publish_at: input.publish_at || null, expires_on: input.expires_on || null };
  if (!CLOUD) {
    const d = demoLoad();
    if (id) d.items = d.items.map((a) => (a.id === id ? { ...a, ...row } : a));
    else d.items.push({ id: uid(), created_at: new Date().toISOString(), created_by: store.user?.id, ...row });
    demoSave(d); await refreshAnnouncements(); return;
  }
  const { error } = id ? await supabase().from('announcements').update(row).eq('id', id) : await supabase().from('announcements').insert(row);
  if (error) throw new Error(error.message);
  await refreshAnnouncements();
}
export async function setAnnouncementStatus(id: string, status: Announcement['status']): Promise<void> {
  store.require('announce.manage');
  if (!CLOUD) { const d = demoLoad(); d.items = d.items.map((a) => (a.id === id ? { ...a, status } : a)); demoSave(d); await refreshAnnouncements(); return; }
  const { error } = await supabase().from('announcements').update({ status }).eq('id', id); if (error) throw new Error(error.message);
  await refreshAnnouncements();
}
export async function deleteAnnouncement(id: string): Promise<void> {
  store.require('announce.manage');
  if (!CLOUD) { const d = demoLoad(); d.items = d.items.map((a) => (a.id === id ? { ...a, deleted_at: new Date().toISOString() } : a)); demoSave(d); await refreshAnnouncements(); return; }
  const { error } = await supabase().from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message);
  await refreshAnnouncements();
}
