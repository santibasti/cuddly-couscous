// ISOMETRIC OFFICE: every department is a little pixel-art room seen from above at an angle (tile floor, two back walls with windows, desks, monitors, chairs, props).
// Agents sit at their desks in pixel form; their state comes from the real events (screen lights up, badge shows). No walking in this view yet (walks and doors are in Rooms V2).
import { Fragment, useMemo, useRef } from 'react';
import { AGENTS, deptByKey, type AgentView, type HqEvent } from '@/lib/hq';
import { ROOMS, STATION, doors, handoverTrips, tripState, type Room, type TripState } from '@/lib/hqwing';
import { useSmooth } from './HqWing';
import { THEME } from '@/lib/hqtheme';
import { PixelCtx, PIXEL_CSS, PixelSeated, PixelWalker } from './HqPixel';

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


/** A sliding glass door in the front wall. It opens only while someone really walks through it. */
function Door({ o, open, light }: { o: { x: number; y: number }; r: Room; open: boolean; light: string }) {
  const P = (x: number, z: number) => { const q = iso(x, M, z); return { x: q.x + o.x, y: q.y + o.y }; }; const c = N / 2;
  return (
    <g>
      <polygon points={pts([P(c - 1, 0), P(c + 1, 0), P(c + 1, 2.4), P(c - 1, 2.4)])} fill="rgba(8,20,60,.5)" />
      <g style={{ transition: 'opacity .25s' }} opacity={open ? 0 : 1}><polygon points={pts([P(c - 1, 0), P(c, 0), P(c, 2.2), P(c - 1, 2.2)])} fill="rgba(160,220,255,.35)" stroke={light} strokeWidth="1" /><polygon points={pts([P(c, 0), P(c + 1, 0), P(c + 1, 2.2), P(c, 2.2)])} fill="rgba(160,220,255,.35)" stroke={light} strokeWidth="1" /></g>
      <g style={{ transition: 'opacity .25s' }} opacity={open ? 1 : 0}><polygon points={pts([P(c - 1, 0), P(c - 0.7, 0), P(c - 0.7, 2.2), P(c - 1, 2.2)])} fill="rgba(160,220,255,.5)" stroke={light} strokeWidth="1" /><polygon points={pts([P(c + 0.7, 0), P(c + 1, 0), P(c + 1, 2.2), P(c + 0.7, 2.2)])} fill="rgba(160,220,255,.5)" stroke={light} strokeWidth="1" /></g>
      <polygon points={pts([P(c - 1, 2.4), P(c + 1, 2.4), P(c + 1, 2.6), P(c - 1, 2.6)])} fill={light} />
    </g>
  );
}
const LIGHT: Record<string, string> = { idle: '#2f6dff', open: '#7be3ff', amber: '#ffb020', green: '#4dffa0', red: '#ff5d5d' };
type Tile = { x: number; y: number };
const col = (i: number) => i % 3, rowOf = (i: number) => Math.floor(i / 3);
/** Where an agent stands to talk: in front of their desk. */
const standAt = (k: string): Tile => { const r = STATION[k].room, i = ROOMS.indexOf(r), mates = AGENTS.filter((a) => STATION[a.key]?.room === r), j = Math.max(0, mates.findIndex((a) => a.key === k)); return { x: col(i) * (N + GAP) + 0.9 + j * (mates.length > 3 ? 2.35 : 2.9) + 1, y: rowOf(i) * (M + GAP) + 3.3 }; };
/** The walking route between two desks: out of the door, along the corridors, in at the other door. */
export function isoRoute(from: string, to: string): Tile[] {
  const a = ROOMS.indexOf(STATION[from].room), b = ROOMS.indexOf(STATION[to].room); const A = standAt(from), B = standAt(to);
  const doorX = (i: number) => col(i) * (N + GAP) + N / 2, cy = (i: number) => rowOf(i) * (M + GAP) + M + GAP / 2, front = (i: number) => rowOf(i) * (M + GAP) + M - 0.3;
  const pts: Tile[] = [A];
  if (a === b) { pts.push({ x: B.x, y: A.y }, B); }
  else { const xv = Math.min(col(a), col(b)) * (N + GAP) + N + GAP / 2; pts.push({ x: doorX(a), y: A.y }, { x: doorX(a), y: front(a) }, { x: doorX(a), y: cy(a) }, { x: xv, y: cy(a) }, { x: xv, y: cy(b) }, { x: doorX(b), y: cy(b) }, { x: doorX(b), y: front(b) }, { x: doorX(b), y: B.y }, B); }
  return pts.filter((q, i) => !i || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y);
}
export function alongTiles(pts: Tile[], f: number): { pos: Tile; sx: number; sy: number } {
  const len = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y)), tot = len.reduce((s, v) => s + v, 0) || 1; let d = Math.max(0, Math.min(1, f)) * tot, i = 0;
  while (i < len.length - 1 && d > len[i]) { d -= len[i]; i++; } const u = len[i] ? Math.min(1, d / len[i]) : 0, p = pts[i], q = pts[i + 1] ?? p;
  return { pos: { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }, sx: (q.x - q.y) - (p.x - p.y), sy: (q.x + q.y) - (p.x + p.y) };
}

function IsoRoom({ r, o, views, selected, away, doorOpen, doorLight, onPickDept, onPickAgent }: { r: Room; o: { x: number; y: number }; views: Record<string, AgentView>; selected: string; away: Set<string>; doorOpen: boolean; doorLight: string; onPickDept: (d: Room) => void; onPickAgent: (k: string) => void }) {
  const t = THEME[r]; const P = (px: number, py: number, pz = 0) => { const q = iso(px, py, pz); return { x: q.x + o.x, y: q.y + o.y }; };
  const agents = AGENTS.filter((a) => STATION[a.key]?.room === r); const live = r === 'hub' || r === 'cafe' ? true : agents.some((a) => a.live);
  const name = deptByKey(r)?.name ?? r;
  const tiles = useMemo(() => { const out: { x: number; y: number }[] = []; for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) out.push({ x, y }); return out; }, []);
  return (
    <g onClick={() => onPickDept(r)} style={{ cursor: 'pointer' }}>
      {/* glass walls: a solid kick panel at the bottom, clear glass above with frames, so you can see into the next room */}
      <polygon points={pts([P(0, 0), P(N, 0), P(N, 0, 1), P(0, 0, 1)])} fill={t.wall[0]} />
      <polygon points={pts([P(0, 0), P(0, M), P(0, M, 1), P(0, 0, 1)])} fill={t.wall[1]} />
      <polygon points={pts([P(0, 0, 1), P(N, 0, 1), P(N, 0, WALL), P(0, 0, WALL)])} fill="url(#isoglass)" stroke={t.trim} strokeOpacity=".7" strokeWidth=".8" />
      <polygon points={pts([P(0, 0, 1), P(0, M, 1), P(0, M, WALL), P(0, 0, WALL)])} fill="url(#isoglass)" stroke={t.trim} strokeOpacity=".7" strokeWidth=".8" />
      {Array.from({ length: N + 1 }, (_, i) => <polygon key={`mx${i}`} points={pts([P(i, 0, 1), P(i + 0.06, 0, 1), P(i + 0.06, 0, WALL), P(i, 0, WALL)])} fill={t.trim} opacity=".55" />)}
      {Array.from({ length: M + 1 }, (_, i) => <polygon key={`my${i}`} points={pts([P(0, i, 1), P(0, i + 0.06, 1), P(0, i + 0.06, WALL), P(0, i, WALL)])} fill={t.trim} opacity=".4" />)}
      <polygon points={pts([P(0, 0, WALL), P(N, 0, WALL), P(N, 0, WALL + 0.22), P(0, 0, WALL + 0.22)])} fill={t.trim} />
      <polygon points={pts([P(0, 0, WALL), P(0, M, WALL), P(0, M, WALL + 0.22), P(0, 0, WALL + 0.22)])} fill={shade(t.trim, 0.7)} />
      {/* floor: checker tiles */}
      {tiles.map(({ x, y }) => <polygon key={`${x}-${y}`} points={pts([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)])} fill={shade((x + y) % 2 ? t.floor[0] : t.floor[1], 2.1)} stroke="rgba(0,0,0,.25)" strokeWidth=".5" />)}
      <polygon points={pts([P(0, 0), P(N, 0), P(N, M), P(0, M)])} fill="none" stroke={t.trim} strokeOpacity=".6" strokeWidth="1" />
      {/* rug under the desks */}
      <polygon points={pts([P(0.6, 0.6), P(N - 0.6, 0.6), P(N - 0.6, 4), P(0.6, 4)])} fill={t.rug} opacity=".22" />
      {/* front glass edge with a sliding door in the middle */}
      <polygon points={pts([P(0, M), P(N / 2 - 1, M), P(N / 2 - 1, M, 0.9), P(0, M, 0.9)])} fill="rgba(160,220,255,.12)" stroke={t.trim} strokeOpacity=".5" strokeWidth=".8" />
      <polygon points={pts([P(N / 2 + 1, M), P(N, M), P(N, M, 0.9), P(N / 2 + 1, M, 0.9)])} fill="rgba(160,220,255,.12)" stroke={t.trim} strokeOpacity=".5" strokeWidth=".8" />
      <polygon points={pts([P(N, 0), P(N, M), P(N, M, 0.9), P(N, 0, 0.9)])} fill="rgba(160,220,255,.08)" stroke={t.trim} strokeOpacity=".4" strokeWidth=".8" />
      <Door o={o} r={r} open={!!doorOpen} light={doorLight} />
      {/* desks, agents */}
      {agents.map((a, i) => {
        const cx = 0.9 + i * (agents.length > 3 ? 2.35 : 2.9), planned = !a.live, st = views[a.key]?.state ?? 'idle', on = !planned && (st === 'working' || st === 'received' || st === 'coordinating'); const head = P(cx + 1, 0.7, 0);
        const badge = planned ? '' : BADGE[st] ?? '';
        return (
          <g key={a.key} onClick={(e) => { e.stopPropagation(); onPickAgent(a.key); }} style={{ cursor: 'pointer', filter: planned ? 'saturate(.5) brightness(.85)' : undefined }}>
            <Block o={o} x={cx + 0.5} y={0.1} w={1} d={0.8} h={1.1} c="#33406a" />
            {!away.has(a.key) && <g transform={`translate(${head.x} ${head.y - 4}) scale(.42)`}><PixelSeated k={a.key} accent={a.shirt} prop={undefined} /></g>}
            <Block o={o} x={cx} y={1.3} w={2} d={1} h={0.75} c={r === 'board' ? '#2b3350' : '#e6edf9'} />
            <Block o={o} x={cx + 0.5} y={1.35} w={1} d={0.12} h={0.7} z={0.75} c={on ? '#7fe4ff' : '#16234a'} />
            <Block o={o} x={cx + 0.45} y={2.1} w={1.1} d={0.3} h={0.04} z={0.75} c="#1b2a52" />
            {badge && <g transform={`translate(${head.x + 15} ${head.y - 48})`}><circle r="6" fill="#ffd86b" /><text y="3" textAnchor="middle" fontSize="8" fontWeight="800" fill="#1b1200">{badge}</text></g>}
          </g>
        );
      })}
      <Furniture r={r} P={P} o={o} />
      {agents.map((a, i) => { const cx = 0.9 + i * (agents.length > 3 ? 2.35 : 2.9); const q0 = P(cx + 1, 0.7); const q = { x: q0.x, y: q0.y - 50 }; const planned = !a.live; const label = `${a.name}${planned ? ' · PLANNED' : ''}`; const w = label.length * 4.6 + 8;
        return <g key={`t${a.key}`} pointerEvents="none"><rect x={q.x - w / 2} y={q.y - 3} width={w} height="11" rx="2" fill="rgba(5,12,34,.85)" stroke={selected === a.key ? '#ffd86b' : t.trim} strokeWidth={selected === a.key ? 1.6 : 0.6} /><text x={q.x} y={q.y + 5} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#e8f1ff">{label}</text></g>; })}
      {/* room label */}
      <g transform={`translate(${P(N / 2, 0, WALL + 2.4).x} ${P(N / 2, 0, WALL + 2.4).y})`}><rect x="-62" y="-9" width="124" height="16" rx="8" fill="rgba(6,14,40,.88)" stroke={t.trim} /><text y="2.5" textAnchor="middle" fontSize="8.5" fontWeight="800" letterSpacing=".05em" fill="#e8f1ff">{name.toUpperCase()}</text>
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
      case 'creative': {
        const reel = (x: number, y: number, z: number, rr: number, c: string) => { const q = P(x, y, z), rx = rr * 22, ry = rr * 11; return <g><rect x={q.x - rx} y={q.y} width={rx * 2} height="4" fill={shade(c, 0.55)} /><ellipse cx={q.x} cy={q.y + 4} rx={rx} ry={ry} fill={shade(c, 0.55)} /><ellipse cx={q.x} cy={q.y} rx={rx} ry={ry} fill={c} />{[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx={q.x + Math.cos(i * 1.047) * rx * 0.55} cy={q.y + Math.sin(i * 1.047) * ry * 0.55} rx={rx * 0.2} ry={ry * 0.2} fill="#0b0f1c" />)}<ellipse cx={q.x} cy={q.y} rx={rx * 0.14} ry={ry * 0.14} fill="#d7def0" /></g>; };
        const cable = (x0: number, y0: number, x1: number, y1: number) => { const a = P(x0, y0), c = P(x1, y1); return <path d={`M${a.x} ${a.y}Q${(a.x + c.x) / 2} ${(a.y + c.y) / 2 + 8} ${c.x} ${c.y}`} fill="none" stroke="#0b0f1c" strokeWidth="1.6" />; };
        const stripe = (x: number, i: number) => B(x + i * 0.2, 5.2, 0.1, 0.1, 0.1, i % 2 ? '#f4f7ff' : '#0b0f1c', 1.25);
        return (
          <g>
            {cable(1.2, 5.2, 4, 3.4)}{cable(4, 3.4, 7.5, 5.8)}{cable(1.2, 6, 3, 6.6)}
            {/* editing wall: a long desk with two glowing monitors, keyboard and a purple chair */}
            {B(0.15, 3.5, 0.9, 3, 0.75, '#8a5a3a')}{B(0.2, 3.6, 0.12, 1.3, 0.75, '#e0a8ff', 0.75)}{B(0.2, 5.1, 0.12, 1.3, 0.75, '#7fe4ff', 0.75)}{B(0.35, 3.9, 0.3, 0.7, 0.04, '#1b2a52', 0.75)}{B(0.35, 5.3, 0.3, 0.7, 0.04, '#1b2a52', 0.75)}
            {B(0.5, 4.8, 0.25, 0.25, 0.2, '#d7def0', 0.75)}{B(1.3, 4.5, 0.8, 0.8, 0.45, '#7a3fd0')}{B(1.3, 4.5, 0.15, 0.8, 1.0, '#5a2aa8')}
            {/* shelf of film reels on the left wall */}
            {B(0.05, 0.4, 0.5, 2.4, 0.1, '#5a3d25', 1.9)}{reel(0.5, 0.9, 2.05, 0.55, '#f2c94c')}{reel(0.5, 1.8, 2.05, 0.55, '#e0554f')}{reel(0.5, 2.6, 2.05, 0.55, '#4fb0ff')}
            {/* floor lamp / softbox */}
            {B(5.2, 3.5, 0.12, 0.12, 2.4, '#2a2f45')}{B(4.8, 3.3, 0.9, 0.12, 0.9, '#fff6d0', 2.1)}{B(4.7, 3.4, 0.5, 0.5, 0.06, '#2a2f45')}
            {/* camera on a tripod with a red REC light */}
            {B(6.2, 4.2, 0.08, 0.08, 1.4, '#2a2f45')}{B(6.6, 4.2, 0.08, 0.08, 1.4, '#2a2f45')}{B(6.4, 4.5, 0.08, 0.08, 1.4, '#2a2f45')}
            {B(6.1, 4.0, 0.9, 0.55, 0.45, '#3b4160', 1.4)}{B(6.95, 4.15, 0.35, 0.25, 0.25, '#0b0f1c', 1.5)}{B(6.2, 4.05, 0.12, 0.12, 0.1, '#ff4d4d', 1.85)}
            {/* reel table with stacked reels and a clapperboard */}
            {B(7.6, 3.9, 2, 1.1, 0.7, '#6c3da8')}{reel(8.2, 4.35, 0.7, 0.7, '#e0a8ff')}{reel(8.2, 4.35, 0.94, 0.7, '#f2c94c')}{reel(9.0, 4.45, 0.7, 0.55, '#4fb0ff')}
            {B(8.6, 5.1, 0.9, 0.12, 0.6, '#14172a')}{[0, 1, 2, 3].map((i) => <Fragment key={i}>{stripe(8.6, i)}</Fragment>)}
            {/* film strip running along the floor edge */}
            {Array.from({ length: 9 }, (_, i) => B(1.2 + i * 0.75, M - 0.3, 0.4, 0.22, 0.03, i % 2 ? '#14172a' : '#e0a8ff'))}
          </g>
        );
      }
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

export function HqIso({ views, events, now, still, selectedAgent, demo, onPickDept, onPickAgent }: { views: Record<string, AgentView>; events: HqEvent[]; now: number; still: boolean; selectedAgent: string; demo: boolean; onPickDept: (d: string) => void; onPickAgent: (k: string) => void }) {
  const cols = 3, rows = 3; const origin = (i: number) => iso(col(i) * (N + GAP), rowOf(i) * (M + GAP));
  const host = useRef<HTMLDivElement>(null); const t = useSmooth(now, !still, host);
  const box = useMemo(() => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; ROOMS.forEach((_, i) => { const o = origin(i); for (const q of [iso(0, 0, WALL + 1.5), iso(N, 0), iso(N, M + GAP), iso(0, M + GAP)]) { x0 = Math.min(x0, q.x + o.x); x1 = Math.max(x1, q.x + o.x); y0 = Math.min(y0, q.y + o.y); y1 = Math.max(y1, q.y + o.y); } }); return { x: x0 - 20, y: y0 - 20, w: x1 - x0 + 40, h: y1 - y0 + 50 }; }, []);
  const trips: TripState[] = useMemo(() => handoverTrips(events, t).map((x) => tripState(x, t)).filter((x): x is TripState => !!x), [events, Math.floor(t / 33)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dr = doors(events, views, trips, t); const away = new Set(trips.filter((s) => s.away).map((s) => s.trip.agent));
  const G = (x: number, y: number) => iso(x, y);
  const totalW = cols * (N + GAP), totalH = rows * (M + GAP);
  return (
    <div className="iso-wrap" ref={host} style={{ aspectRatio: `${box.w} / ${box.h}` }}>
      <style>{PIXEL_CSS}{`.iso-wrap{width:100%;border-radius:14px;background:radial-gradient(ellipse at 50% 30%,#10265c,#050b22);border:1px solid rgba(110,170,255,.3);overflow:hidden}.iso-wrap svg{width:100%;height:100%;display:block;shape-rendering:crispEdges}.iso-wrap text{font-family:"Courier New",ui-monospace,monospace}`}</style>
      <PixelCtx.Provider value={true}>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="group" aria-label="Isometric pixel office: nine rooms joined by glass corridors">
          <defs><linearGradient id="isoglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfe6ff" stopOpacity=".26" /><stop offset=".5" stopColor="#bfe6ff" stopOpacity=".1" /><stop offset="1" stopColor="#bfe6ff" stopOpacity=".2" /></linearGradient></defs>
          {/* corridors: a lit floor between the rooms */}
          {[0, 1, 2].map((r) => { const y0 = r * (M + GAP) + M, y1 = y0 + GAP; return <polygon key={`h${r}`} points={pts([G(-1, y0), G(totalW, y0), G(totalW, y1), G(-1, y1)])} fill="rgba(30,70,150,.28)" stroke="rgba(120,190,255,.25)" strokeWidth=".8" />; })}
          {[0, 1, 2].map((c) => { const x0 = c * (N + GAP) + N, x1 = x0 + GAP; return <polygon key={`v${c}`} points={pts([G(x0, -1), G(x1, -1), G(x1, totalH), G(x0, totalH)])} fill="rgba(30,70,150,.28)" stroke="rgba(120,190,255,.25)" strokeWidth=".8" />; })}
          {ROOMS.map((r, i) => ({ r, i })).sort((a, b) => (rowOf(a.i) + col(a.i)) - (rowOf(b.i) + col(b.i))).map(({ r, i }) => <IsoRoom key={r} r={r} o={origin(i)} views={views} selected={selectedAgent} away={away} doorOpen={dr[r].open} doorLight={LIGHT[dr[r].light] ?? LIGHT.idle} onPickDept={(d) => onPickDept(d)} onPickAgent={onPickAgent} />)}
          {/* walkers: only for real hand-overs between agents */}
          {trips.filter((s) => s.away).map((s) => {
            const a = AGENTS.find((q) => q.key === s.trip.agent), partner = s.trip.partner; if (!a || !partner) return null;
            const route = isoRoute(a.key, partner), { pos, sx, sy } = alongTiles(route, s.f), q = iso(pos.x, pos.y);
            const view = Math.abs(sx) > Math.abs(sy) * 0.8 ? 'side' : (sy < 0 ? 'back' : 'front'); const flip = sx < 0 ? -1 : 1;
            return <g key={s.trip.id} className={`walker ${s.moving ? 'go' : 'stand'}`} transform={`translate(${q.x} ${q.y}) scale(.52)`} pointerEvents="none"><ellipse cx="0" cy="2" rx="26" ry="7" fill="rgba(0,0,0,.4)" /><g transform={`scale(${view === 'side' ? flip : 1} 1)`}><PixelWalker k={a.key} view={view} accent={a.shirt} prop={s.carrying ? 'envelope' : undefined} /></g></g>;
          })}
        </svg>
      </PixelCtx.Provider>
      {demo && <div className="iso-note">SAMPLE · demo mode. Doors open and robots walk only for real (or sample) hand-overs between agents.</div>}
    </div>
  );
}
