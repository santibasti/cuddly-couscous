// Small fills for older Android WebViews / Safari, which some libraries (charts, PDF, Excel) expect to exist.
/* eslint-disable @typescript-eslint/no-explicit-any */
const O = Object as any; const A = Array.prototype as any; const S = String.prototype as any; const G = globalThis as any;
if (!O.hasOwn) O.hasOwn = (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k);
if (!A.at) A.at = function (this: unknown[], i: number) { const n = Math.trunc(i) || 0; return this[n < 0 ? this.length + n : n]; };
if (!S.at) S.at = function (this: string, i: number) { const n = Math.trunc(i) || 0; return this[n < 0 ? this.length + n : n]; };
if (!S.replaceAll) S.replaceAll = function (this: string, a: string | RegExp, b: any) { return a instanceof RegExp ? this.replace(a.global ? a : new RegExp(a.source, a.flags + 'g'), b) : this.split(a).join(b); };
if (!A.findLast) A.findLast = function (this: unknown[], f: (v: unknown, i: number, a: unknown[]) => boolean) { for (let i = this.length - 1; i >= 0; i--) if (f(this[i], i, this)) return this[i]; return undefined; };
if (!A.findLastIndex) A.findLastIndex = function (this: unknown[], f: (v: unknown, i: number, a: unknown[]) => boolean) { for (let i = this.length - 1; i >= 0; i--) if (f(this[i], i, this)) return i; return -1; };
if (!G.structuredClone) G.structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
if (!A.toSorted) A.toSorted = function (this: unknown[], f?: (a: any, b: any) => number) { return [...this].sort(f); };
if (!A.toReversed) A.toReversed = function (this: unknown[]) { return [...this].reverse(); };
if (!G.queueMicrotask) G.queueMicrotask = (f: () => void) => Promise.resolve().then(f);
export {};
