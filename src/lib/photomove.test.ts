import { describe, expect, it } from 'vitest';
import { arrangePhotos, movePhoto } from './servicereport';

const ph = (id: string, group: 'Before' | 'After' | 'Detail') => ({ id, group, caption: '' });
const ids = (l: { id: string }[]) => l.map((x) => x.id);
const list = [ph('a', 'Before'), ph('b', 'Before'), ph('c', 'After'), ph('d', 'After'), ph('e', 'Detail')];

describe('moving a photo in a service report', () => {
  it('moves it to another position and keeps everyone else in order', () => {
    expect(ids(movePhoto(list, 'a', 3))).toEqual(['b', 'c', 'd', 'a', 'e']);   // forward
    expect(ids(movePhoto(list, 'e', 0))).toEqual(['e', 'a', 'b', 'c', 'd']);   // to the very first place
    expect(ids(movePhoto(list, 'c', 1))).toEqual(['a', 'c', 'b', 'd', 'e']);   // one earlier
    expect(ids(movePhoto(list, 'c', 3))).toEqual(['a', 'b', 'd', 'c', 'e']);   // one later
  });
  it('clamps a position outside the list and ignores a no-op, an unknown id and a bad number', () => {
    expect(ids(movePhoto(list, 'b', 99))).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(ids(movePhoto(list, 'b', -5))).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(movePhoto(list, 'b', 1)).toBe(list);              // already there: the same array comes back
    expect(movePhoto(list, 'zzz', 0)).toBe(list);
    expect(movePhoto(list, 'a', Number.NaN)).toBe(list);
    expect(ids(movePhoto(list, 'a', 2.9))).toEqual(['b', 'c', 'a', 'd', 'e']);   // a fraction is cut to a whole position
  });
  it('never changes the input list, loses a photo or changes a group or caption', () => {
    const before = JSON.stringify(list); const out = movePhoto(list, 'a', 4);
    expect(JSON.stringify(list)).toBe(before); expect(out).toHaveLength(list.length);
    expect([...ids(out)].sort()).toEqual([...ids(list)].sort());
    expect(out.find((p) => p.id === 'a')).toEqual(list[0]);
  });
  it('changes which Before / After photos are paired in the report', () => {
    expect(arrangePhotos(list).pairs.map(([x, y]) => [x.id, y.id])).toEqual([['a', 'c'], ['b', 'd']]);
    expect(arrangePhotos(movePhoto(list, 'b', 0)).pairs.map(([x, y]) => [x.id, y.id])).toEqual([['b', 'c'], ['a', 'd']]);   // b is now the first Before: it pairs with the first After
  });
});
