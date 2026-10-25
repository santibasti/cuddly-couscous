// The bookkeeper's own entries (opening balances, adjusting entries). Live site: the book_entries table; demo: this browser only.
import { useCallback, useEffect, useState } from 'react';
import { CLOUD, isMissingTable, supabase } from './cloud';
import { store } from './store';
import { entryProblem, type BookLine, type ManualEntry } from './books';
import { uid } from './util';

const DEMO = 'topmop-books-demo';
const demoLoad = (): ManualEntry[] => { try { return JSON.parse(localStorage.getItem(DEMO) ?? '[]') as ManualEntry[]; } catch { return []; } };
const demoSave = (r: ManualEntry[]) => { try { localStorage.setItem(DEMO, JSON.stringify(r)); } catch { /* storage full: nothing to do in the demo */ } };

export async function listManual(): Promise<{ rows: ManualEntry[]; missing: boolean }> {
  if (!CLOUD) return { rows: demoLoad(), missing: false };
  const { data, error } = await supabase().from('book_entries').select('id, entry_date, ref, memo, kind, lines, deleted_at, created_at').is('deleted_at', null).order('entry_date').limit(2000);
  if (error) { if (isMissingTable(error)) return { rows: [], missing: true }; throw new Error(error.message); }
  return { rows: (data ?? []) as ManualEntry[], missing: false };
}
export interface ManualInput { id?: string; entry_date: string; ref: string; memo: string; kind: 'manual' | 'opening'; lines: BookLine[] }
export async function saveManual(f: ManualInput): Promise<void> {
  store.require('books.manage');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.entry_date)) throw new Error('Choose the date of the entry.');
  if (!f.memo.trim() && f.kind === 'manual') throw new Error('Describe the entry, for example "Owner invested cash".');
  const lines = f.lines.filter((l) => l.debit > 0 || l.credit > 0).map((l) => ({ account: l.account, debit: Math.round(l.debit * 100) / 100, credit: Math.round(l.credit * 100) / 100 }));
  const problem = entryProblem(lines); if (problem) throw new Error(problem);
  const row = { entry_date: f.entry_date, ref: f.ref.trim(), memo: f.memo.trim(), kind: f.kind, lines };
  if (!CLOUD) { const all = demoLoad(); if (f.id) demoSave(all.map((r) => (r.id === f.id ? { ...r, ...row } : r))); else demoSave([...all, { id: uid(), created_at: new Date().toISOString(), ...row }]); return; }
  const { error } = f.id ? await supabase().from('book_entries').update(row).eq('id', f.id) : await supabase().from('book_entries').insert(row);
  if (error) throw new Error(error.message);
}
export async function removeManual(id: string): Promise<void> {
  store.require('books.manage');
  if (!CLOUD) { demoSave(demoLoad().filter((r) => r.id !== id)); return; }
  const { error } = await supabase().from('book_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
/** The bookkeeper's entries, kept in step with the screen. */
export function useManual() {
  const [rows, setRows] = useState<ManualEntry[]>([]); const [missing, setMissing] = useState(false); const [err, setErr] = useState('');
  const reload = useCallback(() => { listManual().then((r) => { setRows(r.rows); setMissing(r.missing); setErr(''); }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the entries')); }, []);
  useEffect(reload, [reload]);
  return { rows, missing, err, reload };
}
