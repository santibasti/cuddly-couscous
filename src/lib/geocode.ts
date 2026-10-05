// Street-level positions for saved addresses. The app first places every address by city / area (geo-ph.ts, instant, offline);
// this queue then asks OpenStreetMap Nominatim (max one request per second, as its policy requires) for a precise point, in the background,
// and never blocks a booking. Set VITE_GEOCODER=off to keep addresses on the device and use the built-in area match only.
import { store } from './store';
import { geoHooks } from './geo-ph';
import type { DB, GeoFields } from './types';

const OFF = (import.meta.env?.VITE_GEOCODER as string | undefined) === 'off';
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MAX_TRIES = 2;
const PH_BOX = { s: 4.5, n: 21.5, w: 116, e: 127 };

type Geo = 'sites' | 'clients' | 'ocular_visits';
const ADDRESS: Record<Geo, 'address' | 'location'> = { sites: 'address', clients: 'address', ocular_visits: 'location' };
interface Pending { table: Geo; id: string; address: string }

/** Rows still waiting for a street-level point. */
export function pendingGeocodes(db: DB): Pending[] {
  const out: Pending[] = [];
  for (const table of Object.keys(ADDRESS) as Geo[]) {
    for (const r of db[table] as unknown as (GeoFields & { id: string; deleted_at?: string | null } & Record<string, string>)[]) {
      const address = (r[ADDRESS[table]] ?? '').trim();
      if (r.deleted_at || !address || r.geo_status !== 'approximate' || r.geo_source !== 'address-match' || (r.geo_tries ?? 0) >= MAX_TRIES) continue;
      out.push({ table, id: r.id, address });
    }
  }
  return out;
}

let running = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Looks up a few pending addresses (one per second). Safe to call often. */
export async function geocodePending(limit = 5): Promise<number> {
  if (OFF || running || typeof fetch === 'undefined' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  if (!store.user || !store.can('clients.edit')) return 0;
  running = true; let done = 0;
  try {
    for (const p of pendingGeocodes(store.getDB()).slice(0, limit)) {
      let hit: { lat: number; lng: number } | null = null; let failed = false;
      try {
        const res = await fetch(`${ENDPOINT}?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(p.address)}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { lat: string; lon: string }[];
        const lat = Number(j[0]?.lat), lng = Number(j[0]?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= PH_BOX.s && lat <= PH_BOX.n && lng >= PH_BOX.w && lng <= PH_BOX.e) hit = { lat, lng };
      } catch { failed = true; }
      const cur = (store.getDB()[p.table] as unknown as (GeoFields & { id: string } & Record<string, string>)[]).find((r) => r.id === p.id);
      if (!cur || (cur[ADDRESS[p.table]] ?? '').trim() !== p.address) continue;            // edited meanwhile
      try {
        if (hit) { store.system(p.table, p.id, { lat: hit.lat, lng: hit.lng, geo_source: 'geocoder', geo_precision: 'precise', geo_status: 'mapped', geo_at: new Date().toISOString() } as never, `Located ${p.address}`); done++; }
        else if (!failed) store.system(p.table, p.id, { geo_tries: (cur.geo_tries ?? 0) + 1 } as never, `No street-level match for ${p.address}`);
      } catch { /* not allowed to save, or offline: leave as area-level */ }
      await sleep(1100);
    }
  } finally { running = false; }
  return done;
}

/** Admin fixes a location by hand (type the coordinates, or pick a point). */
export function setManualLocation(table: Geo, id: string, lat: number, lng: number, city?: string, province?: string) {
  store.require('dashboard.executive');
  if (!(lat >= PH_BOX.s && lat <= PH_BOX.n && lng >= PH_BOX.w && lng <= PH_BOX.e)) throw new Error('That point is outside the Philippines.');
  const cur = (store.getDB()[table] as unknown as Record<string, string>[]).find((r) => r.id === id);
  store.update(table, id, { lat, lng, city: city || undefined, province: province || undefined, geo_source: 'manual', geo_precision: 'precise', geo_status: 'mapped', geo_address: (cur?.[ADDRESS[table]] ?? '').trim(), geo_at: new Date().toISOString() } as never, 'update', 'Location corrected by Admin');
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Wire the queue to address changes and start-up. */
export function startGeocoder() {
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => void geocodePending(), 1500); };
  geoHooks.onChange = kick;
  store.subscribe?.(kick);
  kick();
}
