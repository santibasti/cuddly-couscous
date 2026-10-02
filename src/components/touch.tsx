import { useEffect, useState, type ReactNode } from 'react';
import { SYNC_LABEL, useSync, type SyncState } from '@/lib/sync';
import type { DraftApi } from '@/lib/useDraft';
import { fmtStamp } from '@/lib/util';

/** Quantity stepper: big − / + buttons around a numeric field (type, or tap). */
export function Stepper({ value, onChange, min = 0, max, step = 1, disabled, label, unit }: { value?: number; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; disabled?: boolean; label: string; unit?: string }) {
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(n * 1000) / 1000));
  const v = value ?? 0;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" disabled={disabled || v <= min} onClick={() => onChange(clamp(v - step))} aria-label={`Decrease ${label}`}>−</button>
      <input type="number" inputMode={step % 1 ? 'decimal' : 'numeric'} min={min} max={max} step={step} disabled={disabled} value={value ?? ''} aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? undefined : clamp(+e.target.value))} />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" disabled={disabled || (max !== undefined && v >= max)} onClick={() => onChange(clamp(v + step))} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

/** Tap-to-add phrases so common notes need no typing. `replace` = one choice (e.g. a reason). */
export function PresetChips({ options, value, onChange, disabled, replace }: { options: readonly string[]; value: string; onChange: (v: string) => void; disabled?: boolean; replace?: boolean }) {
  const has = (o: string) => value.split(/;\s*/).includes(o) || value === o;
  const tap = (o: string) => {
    if (replace) return onChange(value === o ? '' : o);
    const parts = value.split(/;\s*/).filter(Boolean);
    onChange((has(o) ? parts.filter((p) => p !== o) : [...parts, o]).join('; '));
  };
  return <div className="chips" role="group" aria-label="Quick entries">{options.map((o) => <button key={o} type="button" disabled={disabled} className={has(o) ? 'on' : ''} onClick={() => tap(o)}>{o}</button>)}</div>;
}

/** On / off switch (used for confirmations). */
export function Toggle({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={`toggle ${disabled ? 'dis' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" /><span>{children}</span>
    </label>
  );
}

const ICON: Record<SyncState, string> = { saved: '●', saving: '◌', offline: '⚠', synced: '✓' };
/** Global status: Saved · Saving… · Offline Draft · Synced. */
export function SyncBadge({ compact }: { compact?: boolean }) {
  const s = useSync();
  const tip = `${s.online ? 'Online' : 'No connection — changes are kept on this tablet'}${s.pending ? ` • ${s.pending} change(s) queued` : ''}${s.lastSyncedAt ? ` • last sync ${fmtStamp(s.lastSyncedAt)}` : ''}`;
  return <span className={`syncbadge ${s.state}`} role="status" aria-live="polite" title={tip}><b aria-hidden="true">{ICON[s.state]}</b>{!compact && <span>{SYNC_LABEL[s.state]}</span>}</span>;
}

/** Per-step status line + "draft restored" notice. */
export function DraftBar({ d }: { d: DraftApi }) {
  const s = useSync();
  const state: SyncState = !s.online ? 'offline' : d.status === 'saving' ? 'saving' : d.dirty ? 'saved' : s.state;
  return (
    <div className="draftbar">
      <span className={`syncbadge ${state}`} role="status"><b aria-hidden="true">{ICON[state]}</b><span>{SYNC_LABEL[state]}</span></span>
      {d.dirty && <span className="small muted">{!s.online ? 'Draft kept on this tablet — it will sync when you are back online.' : 'Draft kept on this tablet until you submit this step.'}</span>}
      {d.status === 'trimmed' && <span className="small" style={{ color: 'var(--amber)' }}>Storage is full — large photos were left out of the draft.</span>}
      {d.restoredAt && d.dirty && <span className="small">Restored from {fmtStamp(d.restoredAt)}. <button type="button" className="linkbtn" onClick={() => { if (window.confirm('Discard this draft and start the step over?')) d.discard(); }}>Discard draft</button></span>}
    </div>
  );
}

export function useIsOnline() { return useSync().online; }
export function useMedia(q: string) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); f(); if (mq.addEventListener) mq.addEventListener('change', f); else mq.addListener(f); return () => { if (mq.removeEventListener) mq.removeEventListener('change', f); else mq.removeListener(f); }; }, [q]);
  return m;
}
