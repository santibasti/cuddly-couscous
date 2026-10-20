import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Bytes } from './sha256';
import { uuid } from './uuid';

describe('sha256 fallback', () => {
  it('matches node for edge-case lengths', () => {
    for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000, 100_000]) {
      const b = randomBytes(n);
      expect(sha256Bytes(new Uint8Array(b))).toBe(createHash('sha256').update(b).digest('hex'));
    }
    expect(sha256Bytes(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('uuid fallback', () => {
  it('works without crypto.randomUUID and looks like a v4 uuid', () => {
    const orig = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = uuid(), b = uuid();
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(a).not.toBe(b);
    } finally { Object.defineProperty(globalThis.crypto, 'randomUUID', { value: orig, configurable: true }); }
  });
});
