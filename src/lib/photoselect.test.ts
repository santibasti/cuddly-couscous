import { describe, expect, it } from 'vitest';
import { afterFiling, alreadyElsewhere, chunk, clickSelect, keepVisible, matchesFilters, rangeIds, type PhotoFilters, type SelPhoto } from './photoselect';

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const none: PhotoFilters = { job: '', unsorted: false, kind: '', src: '', okOnly: false };
const photos: SelPhoto[] = [{ id: 'a', job_id: null, source: 'telegram' }, { id: 'b', job_id: null, source: 'telegram' }, { id: 'c', job_id: 'J1', source: 'app' }, { id: 'd', job_id: 'J2', source: 'telegram' }];

describe('Photo Library: selecting several photos', () => {
  it('a plain click selects, a second click unselects', () => {
    let s = clickSelect(new Set(), ids, 1, -1, false); expect([...s]).toEqual(['b']); s = clickSelect(s, ids, 3, 1, false); expect([...s].sort()).toEqual(['b', 'd']); s = clickSelect(s, ids, 1, 3, false); expect([...s]).toEqual(['d']);
  });
  it('shift-click adds the whole range from the last click, in either direction, and keeps what was selected', () => {
    expect([...clickSelect(new Set(['a']), ids, 3, 1, true)].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...clickSelect(new Set(), ids, 1, 4, true)].sort()).toEqual(['b', 'c', 'd', 'e']);
    expect([...clickSelect(new Set(), ids, 2, -1, true)]).toEqual(['c']);     // no earlier click: it behaves like a plain click
    expect(rangeIds(ids, 4, 2)).toEqual(['c', 'd', 'e']); expect(rangeIds([], 0, 3)).toEqual([]); expect(rangeIds(ids, -5, 99)).toEqual(ids);
  });
  it('a click outside the list changes nothing', () => { expect([...clickSelect(new Set(['a']), ids, 99, 0, false)]).toEqual(['a']); });
  it('only photos still on screen can stay selected', () => { expect([...keepVisible(new Set(['a', 'x', 'c']), ['a', 'b', 'c'])].sort()).toEqual(['a', 'c']); expect(keepVisible(new Set(['x']), []).size).toBe(0); });
  it('counts the selected photos that would be MOVED from another job (so the screen can ask first)', () => {
    expect(alreadyElsewhere(photos, new Set(['a', 'c', 'd']), 'J1')).toBe(1);      // d is on J2; c is already on J1; a has no job
    expect(alreadyElsewhere(photos, new Set(['a', 'b']), 'J1')).toBe(0);
  });
});

describe('Photo Library: after filing to a job', () => {
  it('the filed photos carry the job and its client; the others are untouched', () => {
    const r = afterFiling(photos, new Set(['a', 'b']), 'J9', 'C9', none);
    expect(r.find((p) => p.id === 'a')).toMatchObject({ job_id: 'J9', client_id: 'C9' }); expect(r.find((p) => p.id === 'b')?.job_id).toBe('J9'); expect(r.find((p) => p.id === 'c')?.job_id).toBe('J1'); expect(r).toHaveLength(4);
  });
  it('in the "Unsorted" view the filed photos leave the screen (they are sorted now)', () => {
    const r = afterFiling(photos, new Set(['a']), 'J9', 'C9', { ...none, unsorted: true }); expect(r.map((p) => p.id)).toEqual(['b']);
  });
  it('in a job view, photos filed to ANOTHER job leave the screen; photos filed to the job being viewed stay', () => {
    expect(afterFiling(photos, new Set(['c']), 'J2', 'C2', { ...none, job: 'J1' }).map((p) => p.id)).not.toContain('c');
    expect(afterFiling(photos, new Set(['a']), 'J1', 'C1', { ...none, job: 'J1' }).map((p) => p.id)).toContain('a');
  });
  it('the source, type and marketing filters are respected', () => {
    expect(matchesFilters({ id: 'x', job_id: null, source: 'app', kind: 'After', client_ok: false }, { ...none, src: 'telegram' })).toBe(false);
    expect(matchesFilters({ id: 'x', job_id: 'J1', source: 'telegram', kind: 'After', client_ok: true }, { job: 'J1', unsorted: false, kind: 'After', src: 'telegram', okOnly: true })).toBe(true);
  });
  it('a long selection is sent to the database in blocks', () => { expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]); expect(chunk([], 3)).toEqual([]); });
});
