import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
let quota = Infinity;
Object.assign(globalThis, { localStorage: {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { if (v.length > quota) throw new Error('QuotaExceededError'); mem.set(k, v); },
  removeItem: (k: string) => void mem.delete(k), key: (i: number) => [...mem.keys()][i], get length() { return mem.size; },
} });

type S = typeof import('./sync');
let S: S;
beforeAll(async () => { vi.useFakeTimers(); S = await import('./sync'); });
beforeEach(() => { mem.clear(); quota = Infinity; });

describe('form drafts', () => {
  it('saves, restores and clears a draft', () => {
    expect(S.saveDraft('d:1:hq', { notes: 'Van fueled', qty: 3 })).toBe('ok');
    expect(S.loadDraft<{ notes: string }>('d:1:hq')?.data.notes).toBe('Van fueled');
    S.clearDraft('d:1:hq');
    expect(S.loadDraft('d:1:hq')).toBeNull();
  });
  it('drops oversized photos (and says so) when device storage is full', () => {
    quota = 5000;
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(60000);
    expect(S.saveDraft('d:1:arr', { photos: [big], notes: 'ok' })).toBe('trimmed');
    const d = S.loadDraft<{ photos: string[]; notes: string }>('d:1:arr')!;
    expect(d.trimmed).toBe(true); expect(d.data.notes).toBe('ok'); expect(d.data.photos[0]).toBe('');
  });
  it('reports failure instead of throwing when nothing fits', () => {
    quota = 5;
    expect(S.saveDraft('d:1:x', { a: 'long enough to not fit' })).toBe('failed');
  });
});

describe('unsaved-form registry', () => {
  it('tracks dirty forms and clears them with the draft', () => {
    S.dirtyForms.add('d:2:conf');
    expect(S.dirtyForms.any()).toBe(true);
    S.clearDraft('d:2:conf');
    expect(S.dirtyForms.any()).toBe(false);
  });
  it('confirmLeave is silent when nothing is unsaved', () => { expect(S.confirmLeave()).toBe(true); });
});

describe('sync status', () => {
  it('Saved → Synced online; Offline Draft offline; flushes queued changes when back online', async () => {
    const flushed = vi.fn(async () => undefined);
    S.syncHub.setFlusher(flushed);
    S.syncHub.noteWrite();
    expect(S.syncHub.getSnapshot().state).toBe('saving');
    await vi.advanceTimersByTimeAsync(400);
    expect(S.syncHub.getSnapshot().state).toBe('saved');
    await vi.advanceTimersByTimeAsync(800);
    expect(S.syncHub.getSnapshot().state).toBe('synced');
    expect(flushed).toHaveBeenCalledTimes(1);

    S.syncHub.setOnline(false);
    S.syncHub.noteWrite(); S.syncHub.noteWrite();
    expect(S.syncHub.getSnapshot()).toMatchObject({ state: 'offline', pending: 2, online: false });
    expect(flushed).toHaveBeenCalledTimes(1);

    S.syncHub.setOnline(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(flushed).toHaveBeenCalledTimes(2);
    expect(S.syncHub.getSnapshot()).toMatchObject({ state: 'synced', pending: 0 });
  });
  it('stays Offline Draft when the upload fails', async () => {
    S.syncHub.setFlusher(async () => { throw new Error('network'); });
    S.syncHub.setOnline(false); S.syncHub.noteWrite(); S.syncHub.setOnline(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(S.syncHub.getSnapshot().state).toBe('offline');
    S.syncHub.setFlusher(null);
  });
});
