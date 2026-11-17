// OPEN OFFICE: one big open-plan pixel floor (wood, big windows, plants) where each department is a zone with its own rug, desks and props. No doors: agents walk across the floor.
// Agent states and walks come from the real events (sample events in demo mode); the furniture, plants and sky are decoration only.
import { useMemo, useRef } from 'react';
import { AGENTS, deptByKey, type AgentView, type HqEvent } from '@/lib/hq';
import { ROOMS, STATION, handoverTrips, tripState, type Room, type TripState } from '@/lib/hqwing';
import { THEME } from '@/lib/hqtheme';
import { PIXEL_CSS, PixelCtx, PixelSeated, PixelWalker } from './HqPixel';
import { useSmooth } from './HqWing';

const W = 1240, H = 770;
const ZONE: Record<Room, { x: number; y: number; w: number; h: number; row: number; col: number }> = {
  email: { x: 40, y: 150, w: 360, h: 190, row: 0, col: 0 }, creative: { x: 430, y: 150, w: 370, h: 190, row: 0, col: 1 }, ads: { x: 830, y: 150, w: 370, h: 190, row: 0, col: 2 },
  desk: { x: 40, y: 375, w: 360, h: 190, row: 1, col: 0 }, hub: { x: 430, y: 375, w: 370, h: 190, row: 1, col: 1 }, booking: { x: 830, y: 375, w: 370, h: 190, row: 1, col: 2 },
  hr: { x: 40, y: 600, w: 360, h: 150, row: 2, col: 0 }, cafe: { x: 430, y: 600, w: 370, h: 150, row: 2, col: 1 }, board: { x: 830, y: 600, w: 370, h: 150, row: 2, col: 2 },
};
const DESK_DY = 94;
const mates = (r: Room) => AGENTS.filter((a) => STATION[a.key]?.room === r);
const seat = (k: string) => { const r = STATION[k].room, z = ZONE[r], m = mates(r), i = Math.max(0, m.findIndex((a) => a.key === k)); return { x: z.x + (z.w / m.length) * (i + 0.5), y: z.y + DESK_DY, r }; };
const BADGE: Partial<Record<AgentView['state'], string>> = { received: '🔔', awaiting: '⏸', done: '✔', error: '!', blocked: '!' };

const Plant = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="0" cy="2" rx="13" ry="4" fill="rgba(0,0,0,.25)" /><rect x="-9" y="-12" width="18" height="14" fill="#b5653a" stroke="#6e3a1c" /><rect x="-9" y="-12" width="18" height="3" fill="#d58a58" />
    <path d="M0 -12L-14 -26L-8 -42L0 -28L8 -44L15 -26Z" fill="#2f9e56" stroke="#1d6a3a" /><path d="M0 -14L-5 -34L0 -50L5 -34Z" fill="#44c474" stroke="#1d6a3a" /></g>
);
const Shelf = ({ x, y, w = 56, h = 70, a = '#4fb0ff' }: { x: number; y: number; w?: number; h?: number; a?: string }) => (
  <g><rect x={x} y={y} width={w} height={h} fill="#6a4426" stroke="#3a2412" strokeWidth="2" />{[0, 1, 2].map((i) => <g key={i}><rect x={x + 3} y={y + 4 + i * (h / 3 - 1)} width={w - 6} height={h / 3 - 6} fill="#2c1c10" />{Array.from({ length: Math.floor((w - 8) / 6) }, (_, j) => <rect key={j} x={x + 5 + j * 6} y={y + 6 + i * (h / 3 - 1) + (j % 3)} width="4" height={h / 3 - 10 - (j % 3)} fill={['#e0554f', a, '#f2c94c', '#f4f7ff', '#46e08a'][(i + j) % 5]} />)}</g>)}</g>
);
const Board = ({ x, y, w, h, kids }: { x: number; y: number; w: number; h: number; kids?: React.ReactNode }) => <g><rect x={x} y={y} width={w} height={h} fill="#f4f1e6" stroke="#8a6a3a" strokeWidth="3" />{kids}<rect x={x + 6} y={y + h} width="4" height="12" fill="#5a3d25" /><rect x={x + w - 10} y={y + h} width="4" height="12" fill="#5a3d25" /></g>;
const notes = (x: number, y: number, n: number, cols: string[]) => Array.from({ length: n }, (_, i) => <rect key={i} x={x + 8 + (i % 4) * 16} y={y + 8 + Math.floor(i / 4) * 14} width="12" height="10" fill={cols[i % cols.length]} />);

function Props({ r }: { r: Room }) {
  const z = ZONE[r], bx = z.x + 8, by = z.y + 112, rx = z.x + z.w - 64;
  switch (r) {
    case 'email': return <g><Shelf x={bx} y={by} a="#4fb0ff" /><Plant x={rx + 40} y={by + 62} s={1.1} /></g>;
    case 'creative': return <g><Board x={bx} y={by - 4} w={58} h={52} kids={notes(bx, by - 4, 8, ['#e0a8ff', '#ffd694', '#7fe4ff', '#ff9ac0'])} /><Plant x={rx + 40} y={by + 62} /></g>;
    case 'ads': return <g><Board x={bx} y={by - 4} w={58} h={52} kids={<g><rect x={bx + 8} y={by + 26} width="8" height="14" fill="#e0554f" /><rect x={bx + 20} y={by + 16} width="8" height="24" fill="#ffae3d" /><rect x={bx + 32} y={by + 8} width="8" height="32" fill="#46e08a" /></g>} /><Plant x={rx + 40} y={by + 62} /></g>;
    case 'desk': return <g><Board x={bx} y={by - 4} w={58} h={52} kids={<g><rect x={bx + 8} y={by + 6} width="30" height="12" rx="5" fill="#34c8a8" /><rect x={bx + 18} y={by + 24} width="30" height="12" rx="5" fill="#4fb0ff" /></g>} /><Plant x={rx + 40} y={by + 62} /></g>;
    case 'booking': return <g><Board x={bx} y={by - 4} w={58} h={52} kids={<g><rect x={bx} y={by - 4} width="58" height="10" fill="#e0554f" />{Array.from({ length: 12 }, (_, i) => <rect key={i} x={bx + 6 + (i % 4) * 12} y={by + 12 + Math.floor(i / 4) * 11} width="9" height="8" fill={i === 5 ? '#ffd694' : '#d9dfef'} />)}</g>} /><g><rect x={rx + 6} y={by + 36} width="30" height="26" fill="#a8743a" stroke="#6a4a24" strokeWidth="2" /><rect x={rx + 20} y={by + 22} width="26" height="22" fill="#c28a48" stroke="#6a4a24" strokeWidth="2" /></g></g>;
    case 'hr': return <g>{[0, 1].map((i) => <g key={i}><rect x={bx + i * 30} y={by + 6} width="26" height="52" fill="#8a96b4" stroke="#4d5a78" strokeWidth="2" />{[0, 1, 2].map((j) => <rect key={j} x={bx + i * 30 + 4} y={by + 10 + j * 16} width="18" height="12" fill="#a8b4cf" stroke="#4d5a78" />)}</g>)}<Plant x={rx + 40} y={by + 50} /></g>;
    case 'hub': return <g><ellipse cx={z.x + z.w / 2} cy={z.y + 128} rx="120" ry="24" fill="#2a4aa6" stroke="#9fc2ff" strokeWidth="3" /><ellipse cx={z.x + z.w / 2} cy={z.y + 124} rx="116" ry="20" fill="#3a5fd0" />{[-70, 0, 70].map((dx) => <ellipse key={dx} cx={z.x + z.w / 2 + dx} cy={z.y + 152} rx="12" ry="5" fill="#f2c94c" stroke="#8a6a1a" strokeWidth="2" />)}<circle cx={z.x + z.w / 2} cy={z.y + 112} r="13" fill="#7fe4ff" stroke="#fff" strokeWidth="2" opacity=".9" /><Plant x={bx + 10} y={by + 60} s={1.2} /><Plant x={z.x + z.w - 24} y={by + 60} s={1.2} /></g>;
    case 'cafe': return <g><rect x={z.x + 30} y={z.y + 20} width="170" height="36" fill="#1f4aa8" stroke="#0e2a66" strokeWidth="3" /><rect x={z.x + 30} y={z.y + 12} width="170" height="12" fill="#e8dfc8" stroke="#b8a888" strokeWidth="2" /><rect x={z.x + 50} y={z.y - 14} width="22" height="26" fill="#4a4f60" stroke="#222634" strokeWidth="2" /><rect x={z.x + 56} y={z.y - 6} width="10" height="8" fill="#ff9a3d" />{[92, 112].map((dx) => <rect key={dx} x={z.x + dx} y={z.y + 2} width="10" height="12" fill="#f4f7ff" stroke="#9fb4de" />)}
      <rect x={z.x + 220} y={z.y + 70} width="130" height="40" rx="8" fill="#2f8f56" stroke="#1d5a36" strokeWidth="3" /><rect x={z.x + 220} y={z.y + 52} width="130" height="22" rx="8" fill="#38a863" stroke="#1d5a36" strokeWidth="3" /><rect x={z.x + 244} y={z.y + 112} width="80" height="22" rx="4" fill="#b8844e" stroke="#6a4a24" strokeWidth="2" /><Plant x={z.x + 14} y={z.y + 130} s={1.2} /></g>;
    case 'board': return <g><rect x={z.x + 20} y={z.y + 12} width={z.w - 40} height="12" fill="#101a3a" stroke="#ffc94d" strokeWidth="2" />{[8, 16, 12, 24, 18, 28].map((h, i) => <rect key={i} x={z.x + 40 + i * 50} y={z.y + 22 - h} width="14" height={h} fill="#7fe4ff" />)}<Plant x={z.x + 14} y={z.y + 130} s={1.1} /><Plant x={z.x + z.w - 16} y={z.y + 130} s={1.1} /></g>;
  }
}

type Pt = { x: number; y: number };
/** Walking route between two desks across the open floor: down to the aisle, along it, through the gap between zones, along the other aisle and up to the desk. */
export function openRoute(from: string, to: string): Pt[] {
  const A = seat(from), B = seat(to), a = ZONE[A.r], b = ZONE[B.r]; const sa = { x: A.x, y: A.y + 52 }, sb = { x: B.x, y: B.y + 52 };
  const aisle = (row: number) => (row === 0 ? 352 : 577);
  if (A.r === B.r) return [sa, { x: sb.x, y: sa.y }, sb].filter((q, i, l) => !i || q.x !== l[i - 1].x || q.y !== l[i - 1].y);
  const lx = Math.min(a.col, b.col) === 0 ? 415 : 815;
  const out = [sa, { x: sa.x, y: aisle(a.row) }, { x: lx, y: aisle(a.row) }, { x: lx, y: aisle(b.row) }, { x: sb.x, y: aisle(b.row) }, sb];
  return out.filter((q, i, l) => !i || q.x !== l[i - 1].x || q.y !== l[i - 1].y);
}
export function alongPx(pts: Pt[], f: number): { pos: Pt; dx: number; dy: number } {
  const len = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y)), tot = len.reduce((s, v) => s + v, 0) || 1; let d = Math.max(0, Math.min(1, f)) * tot, i = 0;
  while (i < len.length - 1 && d > len[i]) { d -= len[i]; i++; } const u = len[i] ? Math.min(1, d / len[i]) : 0, p = pts[i], q = pts[i + 1] ?? p;
  return { pos: { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }, dx: q.x - p.x, dy: q.y - p.y };
}

export function HqOpen({ views, events, now, still, selectedAgent, demo, onPickDept, onPickAgent }: { views: Record<string, AgentView>; events: HqEvent[]; now: number; still: boolean; selectedAgent: string; demo: boolean; onPickDept: (d: string) => void; onPickAgent: (k: string) => void }) {
  const host = useRef<HTMLDivElement>(null); const t = useSmooth(now, !still, host);
  const trips: TripState[] = useMemo(() => handoverTrips(events, t).map((x) => tripState(x, t)).filter((x): x is TripState => !!x), [events, Math.floor(t / 33)]); // eslint-disable-line react-hooks/exhaustive-deps
  const away = new Set(trips.filter((s) => s.away).map((s) => s.trip.agent));
  const sky = ['#7fc4f0', '#a8dcf8'];
  return (
    <div className="open-wrap" ref={host} style={{ aspectRatio: `${W} / ${H}` }}>
      <style>{PIXEL_CSS}{`.open-wrap{width:100%;border-radius:14px;overflow:hidden;border:1px solid rgba(110,170,255,.3);background:#2a1a10}.open-wrap svg{width:100%;height:100%;display:block;shape-rendering:crispEdges}.open-wrap text{font-family:"Courier New",ui-monospace,monospace}`}</style>
      <PixelCtx.Provider value={true}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Open-plan pixel office: nine zones">
          <defs>
            <pattern id="opwood" width="64" height="24" patternUnits="userSpaceOnUse"><rect width="64" height="24" fill="#b8844e" /><rect width="64" height="12" fill="#c28f58" /><path d="M0 .5H64M0 12.5H64M20 0V12M44 12V24" stroke="#8a5e34" strokeWidth="1.5" /></pattern>
            <pattern id="opbrick" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="#d9d2c2" /><path d="M0 .5H28M0 7.5H28M14 0V7M0 7V14M28 7V14" stroke="#a89f8c" strokeWidth="1.2" /></pattern>
          </defs>
          {/* back wall with big windows and a city skyline */}
          <rect x="0" y="0" width={W} height="140" fill="url(#opbrick)" />
          {[0, 1, 2].map((i) => { const x = 60 + i * 400; return <g key={i}><rect x={x} y="14" width="340" height="104" fill={sky[0]} stroke="#4a5a70" strokeWidth="5" /><rect x={x} y="60" width="340" height="58" fill={sky[1]} />{[0, 1, 2, 3, 4, 5, 6].map((j) => <rect key={j} x={x + 10 + j * 46} y={50 - (j * 17) % 30 + 20} width="30" height={68 - ((50 - (j * 17) % 30) + 20 - 50) - 0} fill={['#5a7fa8', '#6c8fb8', '#4d6e98'][j % 3]} />)}<path d={`M${x + 113} 14V118M${x + 226} 14V118`} stroke="#4a5a70" strokeWidth="4" /><rect x={x + 20} y="24" width="30" height="8" fill="#fff" opacity=".7" /><rect x={x + 200} y="34" width="40" height="8" fill="#fff" opacity=".6" /></g>; })}
          <rect x="0" y="136" width={W} height="10" fill="#6a4426" /><rect x="0" y="136" width={W} height="3" fill="#8a5e34" />
          {/* wooden floor */}
          <rect x="0" y="146" width={W} height={H - 146} fill="url(#opwood)" />
          <rect x="0" y="146" width="18" height={H - 146} fill="url(#opbrick)" /><rect x={W - 18} y="146" width="18" height={H - 146} fill="url(#opbrick)" />
          {/* zones: rug, plaque */}
          {ROOMS.map((r) => { const z = ZONE[r], th = THEME[r], live = r === 'hub' || r === 'cafe' ? true : mates(r).some((a) => a.live); const name = deptByKey(r)?.name ?? r;
            return <g key={r} onClick={() => onPickDept(r)} style={{ cursor: 'pointer' }}><rect x={z.x} y={z.y} width={z.w} height={z.h} fill={th.rug} opacity=".3" /><rect x={z.x + 4} y={z.y + 4} width={z.w - 8} height={z.h - 8} fill="none" stroke={th.trim} strokeWidth="3" opacity=".8" strokeDasharray="10 6" />
              <g transform={`translate(${z.x + z.w / 2} ${z.y + z.h - 8})`}><rect x="-84" y="-14" width="168" height="26" fill="#20150e" stroke={th.trim} strokeWidth="2" /><text y="-3" textAnchor="middle" fontSize="11" fontWeight="800" fill="#f4ecdc">{name.toUpperCase()}</text><text y="8" textAnchor="middle" fontSize="8" fontWeight="800" fill={live ? '#7ff0b4' : '#b8a98c'}>{live ? '● LIVE' : '○ NOT CONNECTED'}</text></g></g>; })}
          {ROOMS.map((r) => <Props key={`p${r}`} r={r} />)}
          {/* desks and seated agents */}
          {AGENTS.filter((a) => STATION[a.key]).map((a) => {
            const p = seat(a.key), tw = Math.min(88, ZONE[STATION[a.key].room].w / mates(STATION[a.key].room).length - 6), planned = !a.live, st = views[a.key]?.state ?? 'idle', on = !planned && (st === 'working' || st === 'received' || st === 'coordinating'), th = THEME[p.r], badge = planned ? '' : BADGE[st] ?? '', sel = selectedAgent === a.key;
            return (
              <g key={a.key} onClick={(e) => { e.stopPropagation(); onPickAgent(a.key); }} style={{ cursor: 'pointer', filter: planned ? 'saturate(.5) brightness(.85)' : undefined }}>
                <ellipse cx={p.x} cy={p.y + 36} rx="42" ry="7" fill="rgba(0,0,0,.28)" />
                <rect x={p.x - 16} y={p.y - 16} width="32" height="30" rx="8" fill="#243257" stroke="#3a4f86" strokeWidth="2" />
                {!away.has(a.key) && <g transform={`translate(${p.x} ${p.y + 4}) scale(.66)`}><PixelSeated k={a.key} accent={a.shirt} prop={undefined} /></g>}
                <rect x={p.x - 38} y={p.y} width="76" height="12" fill="#d9a86a" stroke="#6a4a2a" strokeWidth="2" /><rect x={p.x - 38} y={p.y + 12} width="76" height="16" fill="#9a6a3a" stroke="#3a2c20" strokeWidth="2" /><rect x={p.x - 34} y={p.y + 28} width="6" height="10" fill="#3a2c20" /><rect x={p.x + 28} y={p.y + 28} width="6" height="10" fill="#3a2c20" />
                <rect x={p.x - 14} y={p.y + 3} width="28" height="6" fill="#1b2a52" /><rect x={p.x + 20} y={p.y - 22} width="22" height="22" fill="#14203f" stroke="#7a8cb4" strokeWidth="2" /><rect x={p.x + 23} y={p.y - 19} width="16" height="14" fill={on ? '#7fe4ff' : '#223566'} />
                <rect x={p.x - 38} y={p.y + 8} width="76" height="3" fill={a.shirt} opacity=".9" />
                <g transform={`translate(${p.x} ${p.y - 78})`}><rect x={-tw / 2} y="-12" width={tw} height="25" fill="rgba(20,12,8,.88)" stroke={sel ? '#ffd86b' : th.trim} strokeWidth={sel ? 2.4 : 1.2} /><text y="-1" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#fff4de">{a.name}</text><text y="9" textAnchor="middle" fontSize="7" fontWeight="700" fill="#e0cfa8">{planned ? 'PLANNED' : a.role.slice(0, Math.floor(tw / 4.4))}</text></g>
                {badge && <g transform={`translate(${p.x + 40} ${p.y - 84})`}><circle r="8" fill="#ffd86b" stroke="#6a4a00" strokeWidth="1.5" /><text y="3.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#1b1200">{badge}</text></g>}
              </g>
            );
          })}
          {/* walkers: only for real hand-overs between agents */}
          {trips.filter((s) => s.away).map((s) => {
            const a = AGENTS.find((q) => q.key === s.trip.agent), partner = s.trip.partner; if (!a || !partner) return null;
            const { pos, dx, dy } = alongPx(openRoute(a.key, partner), s.f); const back = s.phase === 'back'; const ex = back ? -dx : dx, ey = back ? -dy : dy;
            const view = Math.abs(ex) > Math.abs(ey) ? 'side' : ey < 0 ? 'back' : 'front'; const flip = ex < 0 ? -1 : 1;
            return <g key={s.trip.id} className={`walker ${s.moving ? 'go' : 'stand'}`} transform={`translate(${pos.x} ${pos.y + 10}) scale(.7)`} pointerEvents="none"><ellipse cx="0" cy="2" rx="26" ry="7" fill="rgba(0,0,0,.35)" /><g transform={`scale(${view === 'side' ? flip : 1} 1)`}><PixelWalker k={a.key} view={view} accent={a.shirt} prop={s.carrying ? 'envelope' : undefined} /></g></g>;
          })}
          {/* plants along the walls */}
          {[60, 400, 820, 1190].map((x) => <Plant key={x} x={x} y={162} s={1.3} />)}
        </svg>
      </PixelCtx.Provider>
      {demo && <div className="iso-note">SAMPLE · demo mode. Robots walk only for real (or sample) hand-overs between agents. Plants, sky and furniture are decoration.</div>}
    </div>
  );
}
