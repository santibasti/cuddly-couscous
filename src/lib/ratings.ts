// Keeps each employee's stored rating up to date (store side). Run by people who can manage employees; everyone else only reads their own.
import { store } from './store';
import { employeeRating } from './rating-core';
import { computeRecog } from './recognition-core';
import { today } from './util';

/** JSON with sorted keys. The database stores these objects as jsonb, which hands the keys back in its own order, so a plain JSON.stringify never matched and every employee was rewritten on every pass. */
export const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/** Recalculate ratings; only employees whose rating, breakdown or month changed are written. Safe to run repeatedly. */
let lastRecogAt = 0;
export function syncRatings() {
  if (!store.can('employees.edit') || !store.can('performance.view')) return;
  const db = store.getDB(); const t = today(); const recogDue = Date.now() - lastRecogAt > 5 * 60_000; if (recogDue) lastRecogAt = Date.now();
  for (const e of db.employees.filter((x) => !x.deleted_at && x.status !== 'inactive')) {
    if (recogDue || !e.recog) { // badge data changes slowly: recalculated every few minutes, not after every action
      const rc = computeRecog(db, e, t);
      if (stable(rc) !== stable(e.recog)) store.system('employees', e.id, { recog: rc }, `Badges of ${e.full_name} updated`);
    }
    const r = employeeRating(db, e, t);
    if (!r) continue;
    const same = e.rating === r.rating && e.rating_at?.slice(0, 7) === t.slice(0, 7) && stable(e.rating_parts) === stable(r.parts);
    if (!same) store.system('employees', e.id, { rating: r.rating, rating_parts: r.parts, rating_at: t }, `Rating of ${e.full_name}: ${r.rating.toFixed(1)}`);
  }
}
