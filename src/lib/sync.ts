// Connection + sync status, local form drafts and the "unsaved form" registry.
// The demo data store lives in this browser (localStorage), so every submitted change is saved on the tablet immediately.
// The hub tracks whether those changes still have to reach a server: while offline they count as "Offline Draft" and are
// flushed when the connection returns. With a Supabase-backed store, register the upload with `syncHub.setFlusher(...)`.
import { useSyncExternalStore } from 'react';

export type SyncState = 'saved' | 'saving' | 'offline' | 'synced';
export interface SyncSnap { state: SyncState; online: boolean; pending: number; lastSyncedAt?: string }

const hasWin = typeof window !== 'undefined';
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
let snap: SyncSnap = { state: isOnline() ? 'synced' : 'offline', online: isOnline(), pending: 0 };
const subs = new Set<() => void>();
let t1: ReturnType<typeof setTimeout> | undefined; let t2: ReturnType<typeof setTimeout> | undefined;
let flusher: (() => Promise<void>) | null = null;
const set = (p: Partial<SyncSnap>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };

async function flush() {
  set({ state: 'saving' });
  try { await flusher?.(); set({ state: 'synced', pending: 0, lastSyncedAt: new Date().toISOString() }); }
  catch { set({ state: 'offline' }); }   // upload failed: keep the changes queued locally
}

export const syncHub = {
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  getSnapshot: () => snap,
  setFlusher(f: (() => Promise<void>) | null) { flusher = f; },
  /** Changes found waiting on this device after the app was reopened. */
  setPending(n: number) { set({ pending: n, state: n === 0 ? snap.state : snap.online ? 'saving' : 'offline' }); if (n > 0 && snap.online) { clearTimeout(t2); t2 = setTimeout(() => { void flush(); }, 300); } },
  /** Called after every change is written to local storage. */
  noteWrite() {
    if (!snap.online) { set({ state: 'offline', pending: snap.pending + 1 }); return; }
    set({ state: 'saving', pending: snap.pending + 1 });
    clearTimeout(t1); clearTimeout(t2);
    t1 = setTimeout(() => { set({ state: 'saved' }); t2 = setTimeout(() => { void flush(); }, 700); }, 350);
  },
  setOnline(on: boolean) {
    if (on === snap.online) return;
    set({ online: on });
    if (!on) { clearTimeout(t1); clearTimeout(t2); set({ state: 'offline' }); return; }
    if (snap.pending > 0) void flush(); else set({ state: 'synced' });
  },
};
// keep trying while changes are waiting (flaky signal on site)
if (hasWin) setInterval(() => { if (snap.pending > 0 && snap.online && flusher && snap.state !== 'saving') void flush(); }, 30000);
if (hasWin) { window.addEventListener('online', () => syncHub.setOnline(true)); window.addEventListener('offline', () => syncHub.setOnline(false)); }
export const useSync = (): SyncSnap => useSyncExternalStore(syncHub.subscribe, syncHub.getSnapshot);
export const SYNC_LABEL: Record<SyncState, string> = { saved: 'Saved', saving: 'Saving…', offline: 'Offline Draft', synced: 'Synced' };

/* ---------------- local form drafts ---------------- */
const PFX = 'topmop-draft:';
export interface Draft<T> { at: string; data: T; trimmed?: boolean }
export function loadDraft<T>(key: string): Draft<T> | null {
  try { const raw = localStorage.getItem(PFX + key); return raw ? (JSON.parse(raw) as Draft<T>) : null; } catch { return null; }
}
/** 'trimmed' = storage was full, so large attachments were left out of the draft. */
export function saveDraft<T>(key: string, data: T): 'ok' | 'trimmed' | 'failed' {
  const put = (d: unknown, trimmed?: boolean) => localStorage.setItem(PFX + key, JSON.stringify({ at: new Date().toISOString(), data: d, trimmed }));
  try { put(data); return 'ok'; } catch { /* quota — retry without big attachments */ }
  try { put(JSON.parse(JSON.stringify(data), (_k, v) => (typeof v === 'string' && v.startsWith('data:') && v.length > 40000 ? '' : v)), true); return 'trimmed'; } catch { return 'failed'; }
}
export function clearDraft(key: string) { try { localStorage.removeItem(PFX + key); } catch { /* noop */ } dirtyForms.remove(key); }
export function draftKeys(): string[] { try { return Object.keys(localStorage).filter((k) => k.startsWith(PFX)).map((k) => k.slice(PFX.length)); } catch { return []; } }

/* ---------------- unsaved-form registry (warn before leaving) ---------------- */
const dirtySet = new Set<string>();
export const dirtyForms = {
  add: (k: string) => { dirtySet.add(k); }, remove: (k: string) => { dirtySet.delete(k); },
  any: () => dirtySet.size > 0, keys: () => [...dirtySet],
};
export const LEAVE_MESSAGE = 'This step has entries that are not submitted yet. They are kept as a draft on this tablet, but the step is not complete. Leave anyway?';
/** true when it is fine to leave (nothing unsaved, or the user agreed). */
export const confirmLeave = (): boolean => !dirtyForms.any() || (typeof window === 'undefined' ? true : window.confirm(LEAVE_MESSAGE));
if (hasWin) {
  window.addEventListener('beforeunload', (e) => { if (dirtyForms.any()) { e.preventDefault(); e.returnValue = ''; } });
  // in-app links (sidebar, bottom bar, breadcrumbs): ask before navigating away from an unsaved step
  document.addEventListener('click', (e) => {
    if (!dirtyForms.any()) return;
    const a = (e.target as Element | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
    if (!a || a.getAttribute('href') === window.location.hash) return;
    if (!window.confirm(LEAVE_MESSAGE)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}
