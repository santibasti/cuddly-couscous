import { useEffect, useRef, useState } from 'react';
import { clearDraft, dirtyForms, loadDraft, saveDraft, type Draft } from './sync';

export type DraftStatus = 'clean' | 'saving' | 'saved' | 'trimmed';
/**
 * Auto-saves a form's entries to this device and restores them after a reload, a crash or a lost connection.
 * `snapshot` = everything the user can type / pick; `restore` re-applies a saved snapshot.
 * Pass enabled=false once the step is submitted (the draft is then discarded).
 */
export function useDraft<T>(key: string, snapshot: T, restore: (d: T) => void, enabled = true) {
  const json = JSON.stringify(snapshot);
  const initial = useRef(json);
  const latest = useRef({ json, snapshot, enabled });
  latest.current = { json, snapshot, enabled };
  const [status, setStatus] = useState<DraftStatus>('clean');
  const [restoredAt, setRestoredAt] = useState<string>();
  const first = useRef(true);
  const skipSave = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const d: Draft<T> | null = loadDraft<T>(key);
    if (d) { restoredRef.current = true; restore(d.data); setRestoredAt(d.at); setStatus(d.trimmed ? 'trimmed' : 'saved'); dirtyForms.add(key); }
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (first.current) { first.current = false; if (!restoredRef.current) return; }
    if (!enabled) { clearDraft(key); setStatus('clean'); return; }
    if (json === initial.current) { clearDraft(key); setStatus('clean'); return; }
    dirtyForms.add(key); setStatus('saving');
    const t = setTimeout(() => setStatus(saveDraft(key, snapshot) === 'trimmed' ? 'trimmed' : 'saved'), 500);
    return () => clearTimeout(t);
  }, [json, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // leaving the screen: keep the latest entries, and stop counting this form as "open"
  useEffect(() => () => {
    const l = latest.current;
    if (l.enabled && !skipSave.current && l.json !== initial.current) saveDraft(key, l.snapshot);
    dirtyForms.remove(key);
  }, [key]);

  const dirty = enabled && json !== initial.current;
  /** The entries are now stored for real (e.g. an explicit Save button): treat them as the clean state. */
  const markSaved = () => { initial.current = latest.current.json; clearDraft(key); setStatus('clean'); setRestoredAt(undefined); };
  return { status, dirty, restoredAt, markSaved, discard: () => { skipSave.current = true; clearDraft(key); window.dispatchEvent(new CustomEvent('draft-discard', { detail: key })); } };
}
export type DraftApi = ReturnType<typeof useDraft>;
