// ISOMETRIC OFFICE: every department is a little pixel-art room seen from above at an angle (tile floor, two back walls with windows, desks, monitors, chairs, props).
// Agents sit at their desks in pixel form; their state comes from the real events (screen lights up, badge shows). No walking in this view yet (walks and doors are in Rooms V2).
import { Fragment, useMemo } from 'react';
import { AGENTS, deptByKey, type AgentView } from '@/lib/hq';
import { ROOMS, STATION, type Room } from '@/lib/hqwing';
import { THEME } from '@/lib/hqtheme';
import { PixelCtx, PIXEL_CSS, PixelSeated } from './HqPixel';

const N = 10, M = 7, GAP = 4, TW = 16, TH = 8, Z = 15, WALL = 3.6;
const iso = (x: number, y: number, z = 0) => ({ x: (x - y) * TW, y: (x + y) * TH - z * Z });
const pts = (ps: { x: number; y: number }[]) => ps.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; };

/** A solid block in room tiles: top, right and left faces. */
function Block({ o, x, y, z = 0, w, d, h, c, k }: { o: { x: number; y: number }; x: number; y: number; z?: number; w: number; d: number; h: number; c: string; k?: string }) {
  const P = (px: number, py: number, pz: number) => { const q = iso(px, py, pz); return { x: q.x + o.x, y: q.y + o.y }; };
  return (
    <g key={k}>
      <polygon points={pts([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)])} fill={shade(c, 0.62)} />
      <polygon points={pts([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)])} fill={shade(c, 0.8)} />
      <polygon points={pts([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)])} fill={c} />
    </g>
  );
}
const BADGE: Partial<Record<AgentView['state'], string>> = { received: '🔔', awaiting: '⏸', done: '✔', error: '!', blocked: '!' };

function IsoRoom({ r, o, views, selected, onPickDept, onPickAgent }: { r: Room; o: { x: number; y: number }; views: Record<string, AgentView>; selected: string; onPickDept: (d: Room) => void; onPickAgent: (k: string) => void }) {
  const t = THEME[r]; const P = (px: number, py: number, pz = 0) => { const q = iso(px, py, pz); return { x: q.x + o.x, y: q.y + o.y }; };
  const agents = AGENTS.filter((a) => STATION[a.key]?.room === r); const live = r === 'hub' || r === 'cafe' ? true : agents.some((a) => a.live);
  const name = deptByKey(r)?.name ?? r;
  const tiles = useMemo(() => { const out: { x: number; y: number }[] = []; for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) out.push({ x, y }); return out; }, []);
  const win = (wall: 'x' | 'y', a: number, b: number) => { const f = (u: number, z: number) => wall === 'x' ? P(u, 0, z) : P(0, u, z); return <g key={`${wall}${a}`}><polygon points={pts([f(a, 1.7), f(b, 1.7), f(b, 3), f(a, 3)])} fill="#0b1b45" stroke={t.trim} strokeWidth="1" /><polygon points={pts([f(a + 0.2, 1.8), f(b - 0.2, 1.8), f(b - 0.2, 2.9), f(a + 0.2, 2.9)])} fill="#1d4f9a" opacity=".85" /></g>; };
  return (
    <g onClick={() => onPickDept(r)} style={{ cursor: 'pointer' }}>
      {/* walls */}
      <polygon points={pts([P(0, 0), P(N, 0), P(N, 0, WALL), P(0, 0, WALL)])} fill={t.wall[0]} />
      <polygon points={pts([P(0, 0), P(0, M), P(0, M, WALL), P(0, 0, WALL)])} fill={t.wall[1]} />
      <polygon points={pts([P(0, 0, WALL), P(N, 0, WALL), P(N, 0, WALL + 0.25), P(0, 0, WALL + 0.25)])} fill={t.trim} />
      <polygon points={pts([P(0, 0, WALL), P(0, M, WALL), P(0, M, WALL + 0.25), P(0, 0, WALL + 0.25)])} fill={shade(t.trim, 0.7)} />
      {[1, 4, 7].map((u) => win('x', u, u + 2))}{[1.5, 4.5].map((u) => win('y', u, u + 2))}
      {/* floor: checker tiles */}
      {tiles.map(({ x, y }) => <polygon key={`${x}-${y}`} points={pts([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)])} fill={(x + y) % 2 ? t.floor[0] : t.floor[1]} stroke="rgba(0,0,0,.25)" strokeWidth=".5" />)}
      <polygon points={pts([P(0, 0), P(N, 0), P(N, M), P(0, M)])} fill="none" stroke={t.trim} strokeOpacity=".6" strokeWidth="1" />
      {/* rug under the desks */}
      <polygon points={pts([P(0.6, 0.6), P(N - 0.6, 0.6), P(N - 0.6, 4), P(0.6, 4)])} fill={t.rug} opacity=".22" />
      <Furniture r={r} P={P} o={o} />
      {/* front glass edge */}
      <polygon points={pts([P(0, M), P(N, M), P(N, M, 0.9), P(0, M, 0.9)])} fill="rgba(160,220,255,.12)" stroke={t.trim} strokeOpacity=".5" strokeWidth=".8" />
      <polygon points={pts([P(N, 0), P(N, M), P(N, M, 0.9), P(N, 0, 0.9)])} fill="rgba(160,220,255,.08)" stroke={t.trim} strokeOpacity=".4" strokeWidth=".8" />
      {/* desks, agents */}
      {agents.map((a, i) => {
        const cx = 0.9 + i * (agents.length > 3 ? 2.35 : 2.9), planned = !a.live, st = views[a.key]?.state ?? 'idle', on = !planned && (st === 'working' || st === 'received' || st === 'coordinating'); const head = P(cx + 1, 0.7, 0);
        const badge = planned ? '' : BADGE[st] ?? '';
        return (
          <g key={a.key} onClick={(e) => { e.stopPropagation(); onPickAgent(a.key); }} style={{ cursor: 'pointer', filter: planned ? 'saturate(.5) brightness(.85)' : undefined }}>
            <Block o={o} x={cx + 0.5} y={0.1} w={1} d={0.8} h={1.1} c="#33406a" />
            <g transform={`translate(${head.x} ${head.y - 4}) scale(.42)`}><PixelSeated k={a.key} accent={a.shirt} prop={undefined} /></g>
            <Block o={o} x={cx} y={1.3} w={2} d={1} h={0.75} c={r === 'board' ? '#2b3350' : '#e6edf9'} />
            <Block o={o} x={cx + 0.5} y={1.35} w={1} d={0.12} h={0.7} z={0.75} c={on ? '#7fe4ff' : '#16234a'} />
            <Block o={o} x={cx + 0.45} y={2.1} w={1.1} d={0.3} h={0.04} z={0.75} c="#1b2a52" />
            {badge && <g transform={`translate(${head.x + 15} ${head.y - 48})`}><circle r="6" fill="#ffd86b" /><text y="3" textAnchor="middle" fontSize="8" fontWeight="800" fill="#1b1200">{badge}</text></g>}
          </g>
        );
      })}
      {agents.map((a, i) => { const cx = 0.9 + i * (agents.length > 3 ? 2.35 : 2.9); const q = P(cx + 1, 2.9); const planned = !a.live; const label = `${a.name}${planned ? ' · PLANNED' : ''}`; const w = label.length * 4.6 + 8;
        return <g key={`t${a.key}`} pointerEvents="none"><rect x={q.x - w / 2} y={q.y - 3} width={w} height="11" rx="2" fill="rgba(5,12,34,.85)" stroke={selected === a.key ? '#ffd86b' : t.trim} strokeWidth={selected === a.key ? 1.6 : 0.6} /><text x={q.x} y={q.y + 5} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#e8f1ff">{label}</text></g>; })}
      {/* room label */}
      <g transform={`translate(${P(N / 2, 0, WALL + 0.9).x} ${P(N / 2, 0, WALL + 0.9).y})`}><rect x="-62" y="-9" width="124" height="16" rx="8" fill="rgba(6,14,40,.88)" stroke={t.trim} /><text y="2.5" textAnchor="middle" fontSize="8.5" fontWeight="800" letterSpacing=".05em" fill="#e8f1ff">{name.toUpperCase()}</text>
        <text y="16" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={live ? '#7ff0b4' : '#9fb3d9'}>{live ? 'LIVE' : 'NOT CONNECTED'}</text></g>
    </g>
  );
}

/** The signature furniture of each department. */
function Furniture({ r, P, o }: { r: Room; P: (x: number, y: number, z?: number) => { x: number; y: number }; o: { x: number; y: number } }) {
  const B = (x: number, y: number, w: number, d: number, h: number, c: string, z = 0) => <Block o={o} x={x} y={y} z={z} w={w} d={d} h={h} c={c} />;
  const plant = (x: number, y: number) => <g>{B(x, y, 0.5, 0.5, 0.4, '#e8eefb')}{B(x + 0.1, y + 0.1, 0.3, 0.3, 0.9, '#2fbf6a', 0.4)}</g>;
  const cooler = <g>{B(0.4, M - 1.3, 0.6, 0.6, 1.3, '#e8eefb')}{B(0.45, M - 1.25, 0.5, 0.5, 0.45, '#4fb0ff', 1.3)}</g>;
  const cab = (x: number, y: number) => B(x, y, 0.8, 0.8, 1.2, '#33406a');
  const sig = (() => {
    switch (r) {
      case 'email': return <g>{[0, 1, 2].map((i) => <Fragment key={i}>{B(0.15, 4.2 + i * 0.85, 0.7, 0.75, 1.5 + (i % 2) * 0.3, '#2c4a7e')}</Fragment>)}{B(N - 1.2, 4.6, 0.8, 0.8, 0.5, '#f4f7ff')}</g>;
      case 'creative': return <g>{B(N - 2.4, 4.4, 1.6, 0.8, 0.7, '#6c3da8')}{B(N - 2.2, 4.5, 0.6, 0.6, 0.12, '#f4f7ff', 0.7)}{B(N - 1.4, 4.5, 0.5, 0.5, 0.3, '#1b1e30', 0.7)}{B(0.2, 5, 0.9, 0.9, 0.9, '#2a1b40')}{B(0.3, 5.1, 0.7, 0.7, 0.14, '#e0a8ff', 0.9)}</g>;
      case 'ads': return <g>{B(N - 2.2, 4.2, 1.8, 0.7, 0.6, '#a86a1c')}{B(0.2, 5, 0.9, 0.9, 1.4, '#3d424e')}{B(0.3, 5.1, 0.7, 0.2, 0.8, '#ffae3d', 1.4)}</g>;
      case 'desk': return <g>{B(N - 2.4, 4.4, 1.6, 0.8, 0.5, '#0f8f8a')}{B(0.2, 5, 0.9, 0.9, 0.5, '#2fe0c0')}</g>;
      case 'hub': return <g>{B(N / 2 - 0.9, 4.3, 1.8, 1.8, 0.35, '#2a4aa6')}{B(N / 2 - 0.35, 4.85, 0.7, 0.7, 1.7, '#4f86ff', 0.35)}{B(N / 2 - 0.2, 5, 0.4, 0.4, 0.4, '#e6fbff', 2.05)}</g>;
      case 'booking': return <g>{B(0.2, 4.6, 0.9, 0.9, 0.7, '#8a5a2a')}{B(0.25, 5.6, 0.8, 0.8, 0.5, '#a8743a')}{B(N - 1.8, 4.6, 0.9, 0.9, 0.7, '#8a5a2a')}</g>;
      case 'hr': return <g>{cab(0.2, 4.4)}{cab(0.2, 5.3)}{B(N - 2.2, 4.4, 1.6, 0.8, 0.5, '#2f7a52')}</g>;
      case 'cafe': return <g>{[2, 5, 8].map((x) => <Fragment key={x}>{B(x - 0.6, 3.6, 1.2, 1.2, 0.7, '#8a3a6a')}{B(x - 0.4, 3.8, 0.8, 0.8, 0.1, '#ffd694', 0.7)}</Fragment>)}{B(N - 1.6, 0.3, 1, 0.8, 1.5, '#3a3a46')}</g>;
      case 'board': return <g>{B(1.6, 3.4, N - 3.2, 1.5, 0.7, '#4a2a22')}{B(1.8, 3.6, N - 3.6, 1.1, 0.1, '#7a4a3a', 0.7)}</g>;
      default: return <g />;
    }
  })();
  return <g>{sig}{plant(N - 0.9, M - 1.1)}{r !== 'cafe' && cooler}</g>;
}

export function HqIso({ views, selectedAgent, demo, onPickDept, onPickAgent }: { views: Record<string, AgentView>; selectedAgent: string; demo: boolean; onPickDept: (d: string) => void; onPickAgent: (k: string) => void }) {
  const cols = 3, rows = 3; const origin = (i: number) => { const c = i % cols, rr = Math.floor(i / cols); return iso(c * (N + GAP), rr * (M + GAP)); };
  const box = useMemo(() => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; ROOMS.forEach((_, i) => { const o = origin(i); for (const q of [iso(0, 0, WALL + 1.5), iso(N, 0), iso(N, M), iso(0, M)]) { x0 = Math.min(x0, q.x + o.x); x1 = Math.max(x1, q.x + o.x); y0 = Math.min(y0, q.y + o.y); y1 = Math.max(y1, q.y + o.y); } }); return { x: x0 - 20, y: y0 - 20, w: x1 - x0 + 40, h: y1 - y0 + 50 }; }, []);
  return (
    <div className="iso-wrap" style={{ aspectRatio: `${box.w} / ${box.h}` }}>
      <style>{PIXEL_CSS}{`.iso-wrap{width:100%;border-radius:14px;background:radial-gradient(ellipse at 50% 30%,#10265c,#050b22);border:1px solid rgba(110,170,255,.3);overflow:hidden}.iso-wrap svg{width:100%;height:100%;display:block;shape-rendering:crispEdges}.iso-wrap text{font-family:"Courier New",ui-monospace,monospace}`}</style>
      <PixelCtx.Provider value={true}>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="group" aria-label="Isometric pixel office: nine rooms">
          {ROOMS.map((r, i) => ({ r, i })).sort((a, b) => (Math.floor(a.i / 3) + (a.i % 3)) - (Math.floor(b.i / 3) + (b.i % 3))).map(({ r, i }) => <IsoRoom key={r} r={r} o={origin(i)} views={views} selected={selectedAgent} onPickDept={(d) => onPickDept(d)} onPickAgent={onPickAgent} />)}
        </svg>
      </PixelCtx.Provider>
      {demo && <div className="iso-note">SAMPLE · demo mode. Agent states come from the same events as Rooms V2; walking and doors are not drawn here yet.</div>}
    </div>
  );
}
