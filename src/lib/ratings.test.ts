import { describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });

describe('rating sync', () => {
  it('treats the same object with its keys in another order as unchanged (jsonb returns keys in its own order)', async () => {
    const { stable } = await import('./ratings');
    expect(stable({ attendance: 4, client: 5, safety: 3 })).toBe(stable({ safety: 3, attendance: 4, client: 5 }));
    expect(stable({ a: { y: 1, x: 2 } })).toBe(stable({ a: { x: 2, y: 1 } }));
    expect(stable({ a: 1 })).not.toBe(stable({ a: 2 }));
    expect(stable([3, 1])).not.toBe(stable([1, 3]));
  });
});
