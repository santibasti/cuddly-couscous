// Small key-value store on the device (IndexedDB, with an in-memory fallback). It keeps what must survive closing the app while offline:
// the changes still waiting to be sent, a copy of the data so the app can open without a connection, and unused document numbers.
const NAME = 'topmop-offline'; const STORE = 'kv';
const mem = new Map<string, unknown>();
let dbp: Promise<IDBDatabase | null> | null = null;
const open = (): Promise<IDBDatabase | null> => (dbp ??= new Promise((res) => {
  try {
    if (typeof indexedDB === 'undefined') return res(null);
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  } catch { res(null); }
}));
const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => open().then((d) => (!d ? undefined : new Promise<T | undefined>((res) => {
  try { const q = fn(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); } catch { res(undefined); }
})));

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const v = await tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
  return v !== undefined ? v : (mem.get(key) as T | undefined);
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  mem.set(key, value);
  await tx('readwrite', (s) => s.put(value, key));
}
export async function kvDel(key: string): Promise<void> {
  mem.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}
