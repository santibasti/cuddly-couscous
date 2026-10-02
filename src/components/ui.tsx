import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cls } from '@/lib/util';
import { RuleError, PermissionError } from '@/lib/store';

/* ============ Icons (stroke, 24px grid) ============ */
const P: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  clients: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  sales: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h7',
  jobs: 'M3 5h18v4H3zM5 9v11h14V9M9 13h6',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
  attendance: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  employees: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M17 8h4M17 12h4M17 16h4',
  payroll: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  inventory: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  assets: 'M14 7l-3 3 3 3 3-3M4 20l8-8M14.5 4.5a4 4 0 0 1 5 5l-3 3-5-5z',
  finance: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  reports: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L5 8.5 3 8l-1 3 2 1v2l-2 1 1 3 2-.5L6.5 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  dispatch: 'M2 6h12v10H2zM14 9h4l4 4v3h-8zM6 19a1.7 1.7 0 1 0 0-.01M17 19a1.7 1.7 0 1 0 0-.01',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  logout: 'M9 4H4v16h5M16 8l4 4-4 4M20 12H9',
  check: 'M5 12l5 5 9-10',
  chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  pin: 'M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  camera: 'M4 8h4l2-3h4l2 3h4v12H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  print: 'M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z',
  mail: 'M3 5h18v14H3zM3 7l9 7 9-7',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  portal: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  more: 'M5 12v.01M12 12v.01M19 12v.01',
};
export function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden>
      <path d={P[name] ?? P.more} />
    </svg>
  );
}

/* ============ Toasts & prompts ============ */
type ToastT = { id: number; msg: string; kind: 'ok' | 'err' | 'info' };
const toastBus = new Set<(t: ToastT) => void>();
let toastId = 0;
export const toast = (msg: string, kind: ToastT['kind'] = 'info') => toastBus.forEach((f) => f({ id: ++toastId, msg, kind }));

interface PromptReq { title: string; label: string; required?: boolean; resolve: (v: string | null) => void; multiline?: boolean; okLabel?: string }
const promptBus = new Set<(p: PromptReq) => void>();
export const ask = (title: string, label = 'Reason', opts: { required?: boolean; okLabel?: string } = {}) =>
  new Promise<string | null>((resolve) => promptBus.forEach((f) => f({ title, label, required: opts.required ?? true, okLabel: opts.okLabel, resolve })));

export function Overlays() {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [prm, setPrm] = useState<PromptReq | null>(null);
  const [val, setVal] = useState('');
  useEffect(() => {
    const t = (x: ToastT) => { setToasts((a) => [...a, x]); setTimeout(() => setToasts((a) => a.filter((y) => y.id !== x.id)), x.kind === 'err' ? 7000 : 3800); };
    const p = (x: PromptReq) => { setVal(''); setPrm(x); };
    toastBus.add(t); promptBus.add(p);
    return () => { toastBus.delete(t); promptBus.delete(p); };
  }, []);
  const done = (v: string | null) => { prm?.resolve(v); setPrm(null); };
  return (
    <>
      <div className="toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={cls('toast', t.kind)}>{t.msg}</div>)}</div>
      {prm && (
        <Modal title={prm.title} onClose={() => done(null)} footer={<><button className="btn" onClick={() => done(null)}>Cancel</button><button className="btn primary" disabled={!!prm.required && !val.trim()} onClick={() => done(val.trim())}>{prm.okLabel ?? 'Confirm'}</button></>}>
          <Field label={prm.label} required={prm.required}><textarea autoFocus value={val} onChange={(e) => setVal(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}

/** Run a domain action; show a friendly toast on success / rule violations. Returns true on success. */
export function attempt<T>(fn: () => T, ok?: string): T | undefined {
  try {
    const r = fn();
    if (ok) toast(ok, 'ok');
    return r ?? (true as unknown as T);
  } catch (e) {
    if (e instanceof RuleError || e instanceof PermissionError) toast((e as Error).message, 'err');
    else { console.error(e); toast((e as Error).message || 'Something went wrong', 'err'); }
    return undefined;
  }
}

/* ============ Basic building blocks ============ */
export function Modal({ title, onClose, children, footer, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'wide' | 'xl' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className={cls('modal', size)}>
        <div className="modal-h"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, required, children, className, hint }: { label: ReactNode; required?: boolean; children: ReactNode; className?: string; hint?: string }) {
  return <label className={cls('f', className)}><span>{label}{required && <span className="req"> *</span>}</span>{children}{hint && <span className="small muted" style={{ fontWeight: 400 }}>{hint}</span>}</label>;
}

const TONES: Record<string, string> = {
  // generic statuses across modules
  Active: 'green', Approved: 'green', Completed: 'green', Paid: 'green', Available: 'green', Confirmed: 'teal', Issued: 'green', Closed: 'green', Resolved: 'green', Regular: 'green', regular: 'green', Present: 'green', Finalized: 'navy', Returned: 'green', Excellent: 'green', Good: 'green', Booked: 'green', Won: 'green', Current: 'green',
  Pending: 'amber', Draft: 'gray', Prospect: 'blue', Sent: 'blue', 'For Approval': 'amber', 'In Progress': 'teal', 'Dispatch Checklist Pending': 'amber', Dispatched: 'blue', 'On Site': 'teal', 'Work Completed': 'green', 'Leaving Site': 'blue', 'Arrived at HQ': 'blue', 'In Use': 'teal', Acknowledged: 'blue', 'With Issue': 'amber', Leaking: 'red', Reserved: 'blue', Requested: 'amber', Open: 'amber', Investigating: 'amber', 'Partially Paid': 'amber', Unpaid: 'blue', Fair: 'amber', probationary: 'amber', contractual: 'blue', Late: 'amber', Low: 'gray', Medium: 'amber', Leave: 'blue', Holiday: 'blue', 'Client Approval': 'blue', 'Ocular Visit': 'blue', Inquiry: 'gray', Quotation: 'teal', '1–30': 'amber', '31–60': 'amber',
  Cancelled: 'red', Rejected: 'red', Expired: 'red', Overdue: 'red', Reversed: 'red', Damaged: 'red', Missing: 'red', Poor: 'red', Absent: 'red', High: 'red', Lost: 'red', inactive: 'gray', Inactive: 'gray', Retired: 'gray', Rescheduled: 'gray', 'Under Maintenance': 'amber', Released: 'teal', '61–90': 'red', '90+': 'red', 'In Repair': 'amber',
};
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone ?? (typeof children === 'string' ? TONES[children] : undefined) ?? 'gray';
  return <span className={cls('badge', t === 'gray' ? '' : t)}>{children}</span>;
}

export function Stat({ k, v, s, tone, to }: { k: string; v: ReactNode; s?: ReactNode; tone?: 'warn' | 'bad' | 'good' | 'navy'; to?: string }) {
  const inner = <><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</>;
  return to ? <a className={cls('stat', tone)} href={`#${to}`}>{inner}</a> : <div className={cls('stat', tone)}>{inner}</div>;
}

export function Card({ title, actions, children, flush, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={cls('card', className)}>
      {(title || actions) && <div className="card-h"><h3>{title}</h3><div className="row">{actions}</div></div>}
      <div className={cls('card-b', flush && 'flush')}>{children}</div>
    </section>
  );
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="row">{children}</div></div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={t.id === value} className={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}{t.count !== undefined && <span className="cnt">{t.count}</span>}</button>)}</div>;
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'bad' | 'warn' }) {
  return <div className={cls('bar', tone)}><i style={{ width: `${Math.max(0, Math.min(100, (value / (max || 1)) * 100))}%` }} /></div>;
}

/* ============ Form helpers ============ */
export function useObj<T extends object>(init: T | (() => T)) {
  const [v, setV] = useState<T>(init);
  const set = useCallback(<K extends keyof T>(k: K, val: T[K]) => setV((o) => ({ ...o, [k]: val })), []);
  const bind = <K extends keyof T>(k: K) => ({
    value: (v[k] ?? '') as never,
    onChange: (e: { target: { value: string; type?: string; checked?: boolean } }) => set(k, (e.target.type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.type === 'checkbox' ? e.target.checked : e.target.value) as T[K]),
  });
  return { v, set, bind, setV };
}

/** Resize an image file to a compact data URL so demo storage stays small. */
export async function fileToDataUrl(file: File, max = 900): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  }
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

export function PhotoInput({ label, onAdd, capture, multiple, accept, disabled }: { label: string; onAdd: (dataUrl: string, name: string) => void; capture?: 'environment' | 'user'; multiple?: boolean; accept?: string; disabled?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const f of Array.from(e.target.files ?? [])) { try { onAdd(await fileToDataUrl(f), f.name); } catch { toast('Could not read that file', 'err'); } }
    e.target.value = '';
  };
  // With `capture` the tablet opens its camera directly; a second button picks an existing photo / file instead.
  return (
    <span className="photobtns">
      {capture && <input ref={cam} type="file" accept="image/*" capture={capture} multiple={multiple} className="hide" onChange={onChange} />}
      <input ref={gal} type="file" accept={accept ?? 'image/*'} multiple={multiple} className="hide" onChange={onChange} />
      <button type="button" className="btn sm" disabled={disabled} onClick={() => (capture ? cam : gal).current?.click()}><Icon name="camera" />{label}</button>
      {capture && <button type="button" className="btn sm" disabled={disabled} onClick={() => gal.current?.click()} aria-label={`${label} – choose from gallery`}>From gallery</button>}
    </span>
  );
}

export function Photos({ items, onRemove }: { items: { src: string; caption?: string }[]; onRemove?: (i: number) => void }) {
  const [big, setBig] = useState<string | null>(null);
  if (!items.length) return <span className="muted small">No photos</span>;
  return (
    <>
      <div className="photos">
        {items.map((p, i) => (
          <figure key={i}>
            <img src={p.src} alt={p.caption ?? 'photo'} onClick={() => setBig(p.src)} />
            <figcaption>{p.caption}{onRemove && <> · <a href="#rm" onClick={(e) => { e.preventDefault(); onRemove(i); }}>remove</a></>}</figcaption>
          </figure>
        ))}
      </div>
      {big && <Modal title="Photo" onClose={() => setBig(null)}><img src={big} alt="" style={{ width: '100%' }} /></Modal>}
    </>
  );
}

export function SignaturePad({ onChange, value }: { onChange: (dataUrl: string | undefined) => void; value?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<string | undefined>(value);
  const width = useRef(0);
  const [has, setHas] = useState(!!value);
  // size the canvas to its box (sharp on retina tablets) and keep the drawing when the tablet is rotated
  const setup = () => {
    const c = ref.current!; const r = c.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); width.current = r.width;
    const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0B2545';
    if (last.current) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, r.width, r.height); img.src = last.current; }
  };
  useEffect(() => {
    setup();
    const ro = new ResizeObserver(() => { if (ref.current && Math.abs(ref.current.getBoundingClientRect().width - width.current) > 1) setup(); });
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  // a saved draft can hand the signature back in
  useEffect(() => { if (value === last.current) return; last.current = value; setHas(!!value); if (ref.current) setup(); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const end = () => { if (!drawing.current) return; drawing.current = false; last.current = ref.current!.toDataURL('image/png'); setHas(true); onChange(last.current); };
  return (
    <div>
      <canvas ref={ref} className="sigpad" aria-label="Signature area – sign with your finger or stylus"
        onPointerDown={(e) => { e.preventDefault(); drawing.current = true; const g = ref.current!.getContext('2d')!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke(); ref.current!.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawing.current) return; const g = ref.current!.getContext('2d')!; g.lineTo(...pos(e)); g.stroke(); }}
        onPointerUp={end} onPointerCancel={end} />
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="small muted">{has ? '✓ Signature captured' : 'Sign here with your finger or stylus'}</span>
        <button type="button" className="btn sm" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); last.current = undefined; setHas(false); onChange(undefined); }}>Clear signature</button>
      </div>
    </div>
  );
}

/* ============ Session / filter context ============ */
export const ToastCtx = createContext(null);
export function useDebounced<T>(v: T, ms = 200): T {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}
export function useMemoList<T>(f: () => T, deps: unknown[]): T { return useMemo(f, deps); } // eslint-disable-line react-hooks/exhaustive-deps
export const useToastCtx = () => useContext(ToastCtx);
