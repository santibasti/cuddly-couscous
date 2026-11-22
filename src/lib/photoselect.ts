// Photo Library: choosing several photos and filing them to a job at once. Pure logic (the screen only draws it).
export interface SelPhoto { id: string; job_id: string | null; client_id?: string | null; kind?: string; source?: string; client_ok?: boolean }
export interface PhotoFilters { job: string; unsorted: boolean; kind: string; src: string; okOnly: boolean }

/** The ids between two positions in the list, both included, in list order (shift-click selects a range). */
export function rangeIds(ids: string[], from: number, to: number): string[] {
  if (!ids.length) return []; const a = Math.max(0, Math.min(from, to)), b = Math.min(ids.length - 1, Math.max(from, to)); return ids.slice(a, b + 1);
}
/** A click on a photo's checkbox: a plain click toggles that photo; a shift-click adds the whole range from the last click. Returns the new selection. */
export function clickSelect(selected: Set<string>, ids: string[], index: number, last: number, shift: boolean): Set<string> {
  const n = new Set(selected); const id = ids[index]; if (id === undefined) return n;
  if (shift && last >= 0 && last < ids.length) { for (const x of rangeIds(ids, last, index)) n.add(x); return n; }
  if (n.has(id)) n.delete(id); else n.add(id); return n;
}
/** Only photos that are still on screen can stay selected (a filter change or a reload must never leave an invisible selection that a click would still file). */
export const keepVisible = (selected: Set<string>, ids: string[]): Set<string> => { const on = new Set(ids); return new Set([...selected].filter((x) => on.has(x))); };
/** How many of the selected photos already belong to a DIFFERENT job (they would be moved, not just filed). */
export const alreadyElsewhere = (photos: SelPhoto[], selected: Set<string>, target: string): number => photos.filter((p) => selected.has(p.id) && p.job_id && p.job_id !== target).length;
/** Does a photo still match the filters the screen is showing? */
export const matchesFilters = (p: SelPhoto, f: PhotoFilters): boolean => (f.unsorted ? !p.job_id : !f.job || p.job_id === f.job) && (!f.src || p.source === f.src) && (!f.kind || p.kind === f.kind) && (!f.okOnly || !!p.client_ok);
/** The list after the selected photos were filed to `target` (clientId = that job's client): they carry the new job; the ones that no longer match the current filters leave the screen (for example the "Unsorted" view). */
export function afterFiling<T extends SelPhoto>(photos: T[], selected: Set<string>, target: string, clientId: string | null, f: PhotoFilters): T[] {
  return photos.map((p) => (selected.has(p.id) ? { ...p, job_id: target, client_id: clientId ?? p.client_id ?? null } : p)).filter((p) => matchesFilters(p, f));
}
/** The ids in blocks the database call can take comfortably. */
export const chunk = <T,>(a: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
