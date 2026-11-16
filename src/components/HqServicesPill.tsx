// "Services today" pill for the Booking & Scheduling room (the Rooms view draws its own copy on the wall).
export interface ServicesSummary { done: number; total: number; working: number; road: number; sample: boolean }
export function ServicesPill({ s, onOpen, compact }: { s: ServicesSummary; onOpen?: () => void; compact?: boolean }) {
  return (
    <button type="button" className={`svcpill ${compact ? "cmp" : ""}`} onClick={(e) => { e.stopPropagation(); onOpen?.(); }} aria-label={`Services today${s.sample ? ' (sample)' : ''}: ${s.done} of ${s.total} done, ${s.working} working, ${s.road} on the road`}>
      {compact ? <b>TODAY{s.sample ? '*' : ''} {s.done}/{s.total} · 🧽 {s.working} · 🚚 {s.road}</b> : <><small>SERVICES TODAY{s.sample ? ' · SAMPLE' : ''}</small><b>{s.done}/{s.total} done · 🧽 {s.working} · 🚚 {s.road}</b></>}
    </button>
  );
}
export const SVC_PILL_CSS = `.svcpill{display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:4px 12px;border-radius:14px;border:1px solid #3fdc94;background:rgba(60,220,140,.14);color:#fff;cursor:pointer;font-family:system-ui,sans-serif;line-height:1.15}.svcpill small{font-size:max(8px,.62vw);font-weight:800;letter-spacing:.12em;color:#8bf3bd}.svcpill b{font-size:max(10px,.8vw)}.svcpill.cmp{flex-direction:row;padding:2px 9px;border-radius:999px;white-space:nowrap}.svcpill.cmp b{font-size:max(9px,.72vw)}.svcpill:hover{background:rgba(60,220,140,.26)}`;
