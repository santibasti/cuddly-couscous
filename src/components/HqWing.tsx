// LIVING OFFICE V2: the whole headquarters. Nine rooms in three rows joined by corridors, connectors and automatic sliding doors.
// Doors, walkers and pulses come only from events (lib/hqwing.ts). The café is decorative: an idle agent may take a break there and walks back the moment a real task arrives.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AGENTS, DEPTS, deptByKey, type AgentView, type DeptKey, type HqEvent, type Kpi } from '@/lib/hq';
import { CLEANER, COOLER_ROOMS, LOOK, LAYOUT, applyLayout, cleanerState, coolerAt, coolerState, lightPhase, manilaParts, type Phase, CAFE_SEATS, ROOMS, ROW_Y, SPINES, STATION, WORLD, alongFrac, box, cafeBubble, cafeWanted, describeTrip, doors, handoverTrips, hallPath, inTransit, pulses, stepLoc, tripState, type DoorLight, type Loc, type Room, type TripState } from '@/lib/hqwing';
import { THEME, type FloorKind } from '@/lib/hqtheme';
import { Decor, Rug } from './HqDecor';
import { BOT_CSS, HqBot, HqWalker, WALK_CSS, type ScreenKind } from './HqBot';

const SCREEN: Record<Room, ScreenKind> = { email: 'mail', creative: 'photo', ads: 'chart', desk: 'chat', hub: 'core', booking: 'calendar', hr: 'list', cafe: 'core', board: 'chart' };
const ART: Record<Room, string> = { email: '✉️', creative: '🎞️', ads: '📊', desk: '💬', hub: '✦', booking: '📅', hr: '✅', cafe: '☕', board: '🏛️' };
const LIGHT: Record<DoorLight, string> = { idle: '#2f6dff', open: '#7be3ff', amber: '#ffb020', green: '#4dffa0', red: '#ff5d5d' };
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const PAT: Record<FloorKind, { w: number; h: number; draw: (dark: string, light: string) => React.ReactNode }> = {
  wood: { w: 30, h: 18, draw: (d, l) => <><rect width="30" height="9" fill="rgba(255,255,255,.05)" /><rect y="9" width="30" height="9" fill="rgba(0,0,0,.1)" /><path d="M0 .5H30M0 9.5H30M12 0V9M22 9V18" stroke={d} strokeWidth="1" opacity=".7" /><path d="M0 4.5H30" stroke={l} strokeWidth=".4" opacity=".12" /></> },
  carpet: { w: 6, h: 6, draw: (_d, l) => <><circle cx="1.5" cy="1.5" r=".7" fill={l} opacity=".16" /><circle cx="4.5" cy="4.5" r=".7" fill="#000" opacity=".16" /></> },
  tile: { w: 28, h: 28, draw: (d, l) => <><rect width="14" height="14" fill="rgba(255,255,255,.06)" /><rect x="14" y="14" width="14" height="14" fill="rgba(255,255,255,.06)" /><path d="M0 .5H28M.5 0V28M14 0V28M0 14H28" stroke={d} strokeWidth="1" opacity=".8" /><path d="M1 1H13" stroke={l} strokeWidth=".4" opacity=".2" /></> },
  marble: { w: 64, h: 64, draw: (_d, l) => <><path d="M0 40L30 0M20 64L64 8M44 64L64 40" stroke={l} strokeWidth=".6" opacity=".14" /><path d="M10 64L40 20" stroke="#fff" strokeWidth=".3" opacity=".12" /></> },
};
function viewBoxFor(focus: string, mobile: boolean): string {
  if (!ROOMS.includes(focus as Room)) return `0 0 ${WORLD.w} ${WORLD.h}`;
  const b = box(focus as Room), w = mobile ? 460 : b.w + 170, h = mobile ? 520 : (w * WORLD.h) / WORLD.w * 0.95;
  return `${clampN(b.cx - w / 2, 0, WORLD.w - w)} ${clampN(b.top + 140 - h / 2, 0, WORLD.h - h)} ${w} ${h}`;
}

/** A clock that runs smoothly between the (slower) real or demo clock updates. It stops when paused, hidden or when reduced motion is asked for. */
function useSmooth(now: number, run: boolean, host: React.RefObject<HTMLElement | null>) {
  const ref = useRef({ now, at: performance.now() }); const [t, setT] = useState(now); const [seen, setSeen] = useState(true);
  useEffect(() => { // do no work while the page is scrolled away or the tab is hidden
    const el = host.current; const io = typeof IntersectionObserver !== 'undefined' && el ? new IntersectionObserver((en) => setSeen(en[0]?.isIntersecting ?? true), { threshold: 0.01 }) : null; if (io && el) io.observe(el);
    const vis = () => setSeen(!document.hidden); document.addEventListener('visibilitychange', vis); return () => { io?.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [host]);
  run = run && seen;
  useEffect(() => { ref.current = { now, at: performance.now() }; setT(now); }, [now]);
  useEffect(() => {
    if (!run) return; let id = 0, last = 0;
    const f = (ts: number) => { if (ts - last > 30) { last = ts; setT(ref.current.now + Math.min(performance.now() - ref.current.at, 1100)); } id = requestAnimationFrame(f); };
    id = requestAnimationFrame(f); return () => cancelAnimationFrame(id);
  }, [run]);
  return t;
}
function beep(ctx: AudioContext, up: boolean) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = 'sine'; o.frequency.setValueAtTime(up ? 520 : 760, t); o.frequency.exponentialRampToValueAtTime(up ? 760 : 520, t + 0.18);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3);
}

function Door({ r, open, light }: { r: Room; open: boolean; light: DoorLight }) {
  const b = box(r), cx = b.cx, y = b.doorY, c = LIGHT[light], slide = open ? 40 : 0, tr = 'transform .75s cubic-bezier(.65,0,.3,1)';
  return (
    <g className="door" data-room={r} data-open={open} data-light={light}>
      <rect x={cx - 50} y={y - 18} width="100" height="5" rx="2" fill="#0d1d4d" stroke="#5fd0ff" strokeWidth=".8" />
      <circle cx={cx} cy={y - 25} r="5" fill={c} style={{ filter: `drop-shadow(0 0 ${open ? 9 : 4}px ${c})`, transition: 'fill .4s' }} />
      <rect x={cx - 48} y={y - 13} width="96" height="30" fill="#02081d" />
      <g style={{ transform: `translateX(${-slide}px)`, transition: tr }}><rect x={cx - 48} y={y - 13} width="48" height="30" fill="rgba(110,190,255,.28)" stroke="#8fe0ff" strokeWidth="1" /><rect x={cx - 4} y={y - 11} width="3" height="26" fill={c} opacity=".9" /></g>
      <g style={{ transform: `translateX(${slide}px)`, transition: tr }}><rect x={cx} y={y - 13} width="48" height="30" fill="rgba(110,190,255,.28)" stroke="#8fe0ff" strokeWidth="1" /><rect x={cx + 1} y={y - 11} width="3" height="26" fill={c} opacity=".9" /></g>
      <polygon points={`${cx - 44},${y + 17} ${cx + 44},${y + 17} ${cx + 84},${y + 62} ${cx - 84},${y + 62}`} fill="url(#spill)" style={{ opacity: open ? 0.9 : 0.1, transition: 'opacity .6s' }} />
    </g>
  );
}

function WallClock({ cx, cy, h, m, sec }: { cx: number; cy: number; h: number; m: number; sec: number }) {
  const ang = (deg: number, len: number) => ({ x2: cx + Math.sin((deg * Math.PI) / 180) * len, y2: cy - Math.cos((deg * Math.PI) / 180) * len });
  return (
    <g className="wall-clock" aria-hidden><circle cx={cx} cy={cy} r="12.5" fill="#0b1b45" stroke="#7be3ff" strokeWidth="1.4" />
      {[0, 90, 180, 270].map((d) => <line key={d} x1={cx + Math.sin((d * Math.PI) / 180) * 9.5} y1={cy - Math.cos((d * Math.PI) / 180) * 9.5} x2={cx + Math.sin((d * Math.PI) / 180) * 11} y2={cy - Math.cos((d * Math.PI) / 180) * 11} stroke="#9fe7ff" strokeWidth="1.2" />)}
      <line x1={cx} y1={cy} {...ang(((h % 12) + m / 60) * 30, 6)} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><line x1={cx} y1={cy} {...ang(m * 6, 9)} stroke="#fff" strokeWidth="1.2" strokeLinecap="round" /><line x1={cx} y1={cy} {...ang(sec * 6, 10)} stroke="#ffb020" strokeWidth=".7" /><circle cx={cx} cy={cy} r="1.2" fill="#ffb020" /></g>
  );
}
function Cooler({ r }: { r: Room }) {
  const c = coolerAt(r);
  return (
    <g className="cooler" aria-hidden><rect x={c.x - 7} y={c.y - 30} width="14" height="30" rx="3" fill="#dfe9ff" stroke="#8fa8d8" /><rect x={c.x - 6} y={c.y - 40} width="12" height="12" rx="5" fill="rgba(110,200,255,.55)" stroke="#7be3ff" /><circle cx={c.x + 1} cy={c.y - 34} r="2" fill="rgba(255,255,255,.7)" className="bubble" /><rect x={c.x - 5} y={c.y - 22} width="10" height="3" fill="#4f8bff" /><rect x={c.x - 5} y={c.y - 16} width="10" height="3" fill="#ff6a5a" /></g>
  );
}
function Furniture({ r, warm }: { r: Room; warm: number }) {
  const b = box(r), cx = b.cx, T = b.top, k = LAYOUT.k, X = (dx: number) => cx + dx * k;
  if (r === 'cafe') return (
    <g className="furn">
      <ellipse cx={cx} cy={T + 150} rx={170 * k} ry="70" fill="#ffb860" opacity={warm} style={{ filter: 'blur(14px)' }} />
      <rect x={X(-168)} y={T + 150} width={112 * k} height="26" rx="9" fill="#3a2a6b" stroke="#7a62d8" /><rect x={X(-168)} y={T + 132} width={112 * k} height="26" rx="9" fill="#4b377f" stroke="#7a62d8" />
      <ellipse cx={X(34)} cy={T + 196} rx={46 * k} ry="9" fill="#14306f" stroke="#7be3ff" strokeWidth="1.2" /><rect x={X(32)} y={T + 190} width="4" height="9" fill="#7be3ff" />
      <rect x={X(104)} y={T + 104} width={76 * k} height="42" rx="6" fill="#1b2f6a" stroke="#ffc94d" strokeWidth="1.2" /><rect x={X(112)} y={T + 86} width="26" height="20" rx="3" fill="#9fb4de" /><circle cx={X(125)} cy={T + 96} r="4" fill="#ff7b54" />
      {[0, 1, 2].map((i) => <path key={i} className="steam" d={`M${X(150) + i * 9} ${T + 100}q-4 -7 0 -13`} fill="none" stroke="rgba(220,240,255,.6)" strokeWidth="1.4" style={{ animationDelay: `${i * 0.5}s` }} />)}
      <rect x={cx - 52} y={T + 70} width="104" height="20" rx="10" fill="rgba(255,120,200,.14)" stroke="#ff7bd0" /><text x={cx} y={T + 84} textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffb3e6" letterSpacing=".2em">AI CAFÉ</text>
      <text x={X(-190)} y={T + 150} fontSize="20">🪴</text>
    </g>
  );
  if (r === 'board') return (
    <g className="furn">
      <polygon points={`${cx - 40 * k},${T + 76} ${cx + 40 * k},${T + 76} ${cx + 96 * k},${T + 128} ${cx - 96 * k},${T + 128}`} fill="url(#cone)" /><g className="holo">{[16, 28, 20, 34, 26].map((h, i) => <rect key={i} x={cx - 40 * k + i * 17 * k} y={T + 126 - h} width={11 * k} height={h} rx="2" fill="#7be3ff" opacity=".85" />)}</g>
      <ellipse cx={cx} cy={b.deskY + 20} rx={160 * k} ry="26" fill="#102a63" stroke="#7be3ff" strokeWidth="1.6" /><ellipse cx={cx} cy={b.deskY + 17} rx={146 * k} ry="20" fill="none" stroke="#ffc94d" opacity=".6" />
      {[-90, 0, 90].map((dx, i) => <rect key={i} x={cx + dx * k - 18} y={b.deskY + 12} width="36" height="14" rx="3" fill="rgba(255,201,77,.22)" stroke="#ffc94d" strokeWidth=".8" />)}
    </g>
  );
  return <g className="furn">{COOLER_ROOMS.includes(r) && <Cooler r={r} />}<text x={b.x + b.w - 30} y={T + 214} fontSize="18" opacity=".8">🪴</text></g>;
}

function RoomShell({ r, live, kpis, demo, count, svc, phase, wall, onOpen }: { r: Room; live: boolean; kpis?: Kpi[]; demo: boolean; count: number; svc?: HqWingProps['services']; phase: Phase; wall: ReturnType<typeof manilaParts>; onOpen: () => void }) {
  const look = LOOK[phase];
  const b = box(r), name = deptByKey(r)?.name ?? r;
  return (
    <g className={`room room-${r}`} role="button" tabIndex={0} aria-label={`Open the ${name} work queue`} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <rect x={b.x} y={b.top} width={b.w} height="244" rx="10" fill="#060f2c" />
      <rect x={b.x} y={b.top} width={b.w} height="64" fill={`url(#wall-${r})`} />
      <rect x={b.x} y={b.top} width={b.w} height="4" fill="#fff" opacity=".22" /><rect x={b.x + 10} y={b.top + 2} width={b.w - 20} height="3" rx="1.5" fill={THEME[r].glow} opacity=".55" />
      <rect x={b.x} y={b.top} width={b.w} height="64" fill={look.sky} opacity={look.skyA} />
      {look.stars && [0.1, 0.22, 0.31, 0.47, 0.58, 0.69, 0.83, 0.92].map((f, i) => <circle key={i} cx={b.x + b.w * f} cy={b.top + 8 + ((i * 17) % 34)} r={i % 3 ? 0.8 : 1.3} fill="#fff" opacity=".85" />)}
      <path d={`M${b.x + 12} ${b.top + 64} l12 -12 l9 6 l14 -16 l10 14 l18 -9 l12 16 l20 -20 l14 18 l20 -8 l12 10 H${b.x + b.w - 12} V${b.top + 64} Z`} fill="#0a1a4d" opacity=".7" />
      <rect x={b.x} y={b.top + 64} width={b.w} height="148" fill={`url(#floor-${r})`} /><rect x={b.x} y={b.top + 64} width={b.w} height="148" fill={`url(#fp-${r})`} /><ellipse cx={b.cx} cy={b.top + 130} rx={b.w * 0.42} ry="46" fill={`url(#glow-${r})`} /><rect x={b.x} y={b.top + 62} width={b.w} height="5" fill={THEME[r].trim} opacity=".6" /><rect x={b.x} y={b.top + 67} width={b.w} height="3" fill="#000" opacity=".25" />
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => <line key={i} x1={b.cx + i * 30} y1={b.top + 64} x2={b.cx + i * 58} y2={b.top + 212} stroke="rgba(120,180,255,.1)" />)}
      {[0, 1, 2, 3].map((i) => <line key={i} x1={b.x} x2={b.x + b.w} y1={b.top + 84 + i * i * 9 + i * 14} y2={b.top + 84 + i * i * 9 + i * 14} stroke="rgba(120,180,255,.08)" />)}
      <rect x={b.cx - 120} y={b.top + 7} width="240" height="21" rx="10.5" fill="rgba(8,20,62,.85)" stroke="rgba(120,200,255,.5)" />
      <text x={b.cx} y={b.top + 21.5} textAnchor="middle" fontSize="11.5" fontWeight="800" letterSpacing=".06em" fill="#dff1ff">{name.toUpperCase()}</text>
      {r === 'booking' && svc ? <g className="today-pill" aria-label="Services today"><rect x={b.cx - 74} y={b.top + 33} width="148" height="26" rx="13" fill="rgba(60,220,140,.14)" stroke="#3fdc94" /><text x={b.cx} y={b.top + 44} textAnchor="middle" fontSize="8" fontWeight="800" letterSpacing=".12em" fill="#8bf3bd">SERVICES TODAY{svc.sample ? ' · SAMPLE' : ''}</text><text x={b.cx} y={b.top + 55} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">{svc.done}/{svc.total} done · 🧽 {svc.working} · 🚚 {svc.road}</text></g>
        : r === 'hub' ? <g><text x={b.cx} y={b.top + 52} textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff" style={{ fontVariantNumeric: 'tabular-nums' }}>{wall.label}</text><text x={b.cx} y={b.top + 61} textAnchor="middle" fontSize="7.5" fill="#a9c2ee" letterSpacing=".1em">{wall.date.toUpperCase()} · MANILA</text></g>
        : <text x={b.cx} y={b.top + 56} textAnchor="middle" fontSize="20" opacity={live ? 0.95 : 0.4}>{ART[r]}</text>}
      {r !== 'cafe' && <g transform={`translate(${b.x + b.w - 10} ${b.top + 48})`}><rect x="-84" y="-10" width="84" height="16" rx="8" fill={live ? 'rgba(60,220,140,.22)' : 'rgba(150,170,210,.2)'} /><text x="-42" y="1.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={live ? '#7ff0b4' : '#9fb3d9'}>{live ? `LIVE${count ? ` · ${count} today` : ''}` : 'NOT CONNECTED'}</text></g>}
      {kpis?.slice(0, 2).map((k, i) => <g key={k.label} transform={`translate(${b.x + 14 + i * 74} ${b.top + 50})`}><text fontSize="17" fontWeight="800" fill="#7be3ff">{k.value}</text><text y="9" fontSize="7" fill="#a9c2ee">{k.label.slice(0, 16)}{demo ? '*' : ''}</text></g>)}
      {r !== 'cafe' && <WallClock cx={b.x + b.w - 26} cy={b.top + 20} h={wall.h} m={wall.m} sec={wall.s} />}
      <rect className="rim" x={b.x} y={b.top} width={b.w} height="244" rx="10" fill="none" stroke="rgba(110,170,255,.45)" strokeWidth="1.5" />
    </g>
  );
}

export interface HqWingProps { demo: boolean; events: HqEvent[]; views: Record<string, AgentView>; kpis?: Partial<Record<DeptKey, Kpi[]>>; now: number; still: boolean; hold: boolean; focus: string; selectedAgent: string; mobile: boolean; services?: { done: number; total: number; working: number; road: number; sample: boolean }; link?: 'live' | 'connecting' | 'reconnecting' | 'off'; onPickDept: (d: string) => void; onPickAgent: (k: string) => void }

export function HqWing({ demo, events, views, kpis, now, still, hold, focus, selectedAgent, mobile, link, services, onPickDept, onPickAgent }: HqWingProps) {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1.6); useEffect(() => { const f = () => setVw(window.innerWidth / window.innerHeight); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const wide = !mobile && vw > 1.25; applyLayout(wide);                    // the building takes the shape of the screen: wide screens get a wide building, no empty sides
  const reduce = useReducedMotion(); const frozen = still || hold || !!reduce;
  const host = useRef<HTMLDivElement>(null); const t = useSmooth(now, !frozen, host); const [sound, setSound] = useState(false); const ctx = useRef<AudioContext | null>(null);
  const [locs, setLocs] = useState<Record<string, Loc>>({});
  const [wallMs, setWallMs] = useState(Date.now()); useEffect(() => { const i = setInterval(() => { if (!document.hidden) setWallMs(Date.now()); }, 1000); return () => clearInterval(i); }, []);
  const [lightMode, setLightMode] = useState<'auto' | 'day' | 'night'>('auto');
  const wall = manilaParts(wallMs); const phase: Phase = lightMode === 'auto' ? lightPhase(wall.h, wall.m) : lightMode === 'day' ? 'day' : 'night'; const look = LOOK[phase];
  // where each agent is: at the desk or in the café. Re-evaluated four times a second; a change starts a walking trip.
  useEffect(() => { setLocs({}); }, [wide]);
  const tick = Math.floor(t / 250);
  useEffect(() => {
    setLocs((cur) => {
      let changed = false; const next = { ...cur }; const used = () => Object.values(next).filter((l) => l.at === 'cafe').map((l) => l.seat!);
      for (const a of AGENTS) { if (!STATION[a.key]) continue; const l = stepLoc(cur[a.key], a.key, cafeWanted(a.key, views[a.key], t), t, used()); if (l !== cur[a.key]) { next[a.key] = l; changed = true; } }
      return changed ? next : cur;
    });
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const trips: TripState[] = useMemo(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const hs = handoverTrips(events, t).map((x) => tripState(x, t)); const ls = Object.values(locs).map((l) => (l.trip ? tripState(l.trip, t) : null));
    return [...hs, ...ls].filter((x): x is TripState => !!x);
  }, [events, locs, Math.floor(t / 33)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dr = doors(events, views, trips, t), pu = pulses(events, t), today = new Date(now).toISOString().slice(0, 10);
  const vb = viewBoxFor(focus, mobile);
  const prev = useRef<Record<string, boolean>>({});
  useEffect(() => { for (const r of ROOMS) { if (prev.current[r] !== undefined && prev.current[r] !== dr[r].open && sound && ctx.current) beep(ctx.current, dr[r].open); prev.current[r] = dr[r].open; } }); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSound = () => { if (!sound) { try { ctx.current = ctx.current ?? new AudioContext(); void ctx.current.resume(); } catch { /* no audio */ } } setSound(!sound); };
  const withStation = AGENTS.filter((a) => STATION[a.key]);
  const waiting = withStation.filter((a) => views[a.key]?.state === 'awaiting').length, busy = withStation.filter((a) => ['working', 'received', 'coordinating'].includes(views[a.key]?.state)).length;
  const cooler: Record<string, ReturnType<typeof coolerState>> = {}; for (const a of withStation) { if (locs[a.key]?.at !== 'cafe' && !inTransit(locs[a.key], t) && !trips.some((x) => x.trip.agent === a.key)) { const c = coolerState(a.key, views[a.key], t); if (c) cooler[a.key] = c; } }   // an idle agent's short water break; never while busy
  const gone = (k: string) => { const l = locs[k]; return !!cooler[k] || inTransit(l, t) || l?.at === 'cafe' || trips.some((s) => s.trip.agent === k && s.trip.kind === 'handover' && s.away); };
  const cafeGuests = withStation.filter((a) => locs[a.key]?.at === 'cafe' && !inTransit(locs[a.key], t));
  const active = trips[0];

  return (
    <div className={`wing ${frozen ? 'still' : ''}`} ref={host} style={{ ['--wa' as string]: (WORLD.w / WORLD.h).toFixed(3) }}>
      <style>{BOT_CSS}{WALK_CSS}{CSS}</style>
      <div className="wing-bar"><div className="wing-tag" data-mode={demo ? 'demo' : link === 'live' || link === 'off' ? 'live' : 'wait'}>{demo ? 'SAMPLE · DEMO MODE · nothing is sent or saved' : link === 'live' ? 'LIVE · doors and walks follow real events' : link === 'off' ? 'LOCAL DATA · this browser only' : 'RECONNECTING · showing the last 24 h, nothing is lost'}</div>
      <span className="wing-btns"><button type="button" className="wing-snd" onClick={() => setLightMode(lightMode === 'auto' ? 'day' : lightMode === 'day' ? 'night' : 'auto')} title="Light follows the Manila clock; tap to preview day or night">{lightMode === 'auto' ? `🌗 Light: auto (${phase})` : lightMode === 'day' ? '☀️ Light: day' : '🌙 Light: night'}</button> <button type="button" className="wing-snd" onClick={() => toggleSound()} aria-pressed={sound}>{sound ? '🔊 Door sounds on' : '🔇 Door sounds off'}</button></span></div>
      <div className="wing-cam" style={{ aspectRatio: mobile ? '460 / 520' : `${WORLD.w} / ${WORLD.h}` }}>
        <motion.svg viewBox={vb} animate={{ viewBox: vb }} transition={{ duration: reduce ? 0 : 0.9, ease: [0.65, 0, 0.3, 1] }} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Living office: nine rooms joined by corridors">
          <defs>
            {ROOMS.map((r) => { const t = THEME[r]; return (<g key={r}>
              <linearGradient id={`wall-${r}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.wall[0]} /><stop offset="1" stopColor={t.wall[1]} /></linearGradient>
              <linearGradient id={`floor-${r}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.floor[0]} /><stop offset="1" stopColor={t.floor[1]} /></linearGradient>
              <pattern id={`fp-${r}`} width={PAT[t.kind].w} height={PAT[t.kind].h} patternUnits="userSpaceOnUse">{PAT[t.kind].draw(t.floor[1], t.trim)}</pattern>
              <radialGradient id={`glow-${r}`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor={t.glow} stopOpacity=".28" /><stop offset="1" stopColor={t.glow} stopOpacity="0" /></radialGradient></g>); })}
            <linearGradient id="botg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#b3c4e6" /></linearGradient>
            <radialGradient id="shell" cx=".34" cy=".28" r=".95"><stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#eaf0fc" /><stop offset="1" stopColor="#a9bbe0" /></radialGradient>
            <linearGradient id="visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d2f6c" /><stop offset="1" stopColor="#060c22" /></linearGradient>
            <linearGradient id="desktop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#19a4d6" /><stop offset="1" stopColor="#0f4f94" /></linearGradient>
            <linearGradient id="wallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12307a" /><stop offset="1" stopColor="#0a1c52" /></linearGradient>
            <linearGradient id="floorg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c2159" /><stop offset="1" stopColor="#081541" /></linearGradient>
            <linearGradient id="hallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1a4a" /><stop offset="1" stopColor="#050e2c" /></linearGradient>
            <linearGradient id="spill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7be3ff" stopOpacity=".55" /><stop offset="1" stopColor="#7be3ff" stopOpacity="0" /></linearGradient>
            <radialGradient id="coreg" cx=".5" cy=".4" r=".6"><stop offset="0" stopColor="#e6fbff" /><stop offset=".35" stopColor="#4fc4ff" /><stop offset="1" stopColor="#0d3aa8" stopOpacity=".85" /></radialGradient>
            <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fd8ff" stopOpacity=".38" /><stop offset="1" stopColor="#6fd8ff" stopOpacity="0" /></linearGradient>
          </defs>
          <rect x="-40" y="-20" width={WORLD.w + 80} height={WORLD.h + 60} fill="#040a20" />
          {/* corridors: one under each row, joined by two connectors */}
          <g className="hall">
            {ROW_Y.map((y) => <g key={y}><rect x="0" y={y + 244} width={WORLD.w} height="100" fill="url(#hallg)" /><rect x="0" y={y + 244} width={WORLD.w} height="2" fill="#5fd0ff" opacity=".5" /><line className="flow" x1="20" y1={y + 294} x2={WORLD.w - 20} y2={y + 294} stroke="rgba(123,227,255,.3)" strokeWidth="2" strokeDasharray="3 16" /></g>)}
            {SPINES.map((x) => <g key={x}><rect x={x - 22} y={ROW_Y[0] + 244} width="44" height={ROW_Y[2] - ROW_Y[0]} fill="url(#hallg)" /><line className="flow" x1={x} y1={ROW_Y[0] + 294} x2={x} y2={ROW_Y[2] + 294} stroke="rgba(123,227,255,.3)" strokeWidth="2" strokeDasharray="3 16" /></g>)}
            <rect x="0" y={WORLD.h - 6} width={WORLD.w} height="3" fill="#ffc94d" opacity=".4" />
            {ROOMS.filter((r) => r !== 'hub').map((r) => <polyline key={r} className="link" points={hallPath('hub', r).map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="rgba(123,227,255,.2)" strokeWidth="2" />)}
          </g>
          {ROOMS.map((r) => <RoomShell key={r} r={r} live={r === 'hub' || r === 'cafe' ? true : AGENTS.some((a) => a.dept === r && a.live)} kpis={kpis?.[r]} demo={demo} count={events.filter((e) => e.dept === r && e.at.slice(0, 10) === today).length} svc={services} phase={phase} wall={wall} onOpen={() => onPickDept(r)} />)}
          {ROOMS.map((r) => <g key={`d${r}`}><Rug r={r} /><Decor r={r} /></g>)}
          {ROOMS.map((r) => <Furniture key={r} r={r} warm={look.warm} />)}

          {/* JARVIS core */}
          <g className={`core ${busy ? 'busy' : ''} ${waiting ? 'wait' : ''}`} transform={`translate(${box('hub').cx} ${box('hub').top + 112}) scale(${0.78 * (1 + (LAYOUT.k - 1) * 0.45)})`}>
            <polygon points="-34,-12 34,-12 80,84 -80,84" fill="url(#cone)" />
            <ellipse cx="0" cy="88" rx="92" ry="16" fill="#0b2a75" stroke="#5fd0ff" strokeWidth="1.5" /><ellipse cx="0" cy="86" rx="62" ry="10" fill="none" stroke="#ffc94d" strokeWidth="1.2" opacity=".8" />
            <circle className="orb" cx="0" cy="0" r="46" fill="url(#coreg)" />
            <ellipse className="ring r1" cx="0" cy="0" rx="72" ry="19" fill="none" stroke="#7be3ff" strokeWidth="2" /><ellipse className="ring r2" cx="0" cy="0" rx="62" ry="15" fill="none" stroke="#ffc94d" strokeWidth="1.6" /><ellipse className="ring r3" cx="0" cy="0" rx="54" ry="48" fill="none" stroke="#7be3ff" strokeWidth="1.2" strokeDasharray="4 6" />
            <text y="9" textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff" style={{ filter: 'drop-shadow(0 0 6px #4fc4ff)' }}>AI</text>
            {waiting > 0 && <g className="amber" transform="translate(0 -64)"><rect x="-76" y="-11" width="152" height="21" rx="10.5" fill="rgba(255,176,32,.2)" stroke="#ffb020" /><text y="4" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffcf70">{waiting} WAITING FOR YOU</text></g>}
          </g>

          {/* people at their desks, in the café, and walking */}
          {withStation.map((a) => { const s = STATION[a.key]; if (gone(a.key)) return null; return <HqBot deskColors={THEME[s.room].desk} scale={LAYOUT.scale} key={a.key} a={a} x={s.x} y={s.y} side={s.side} state={views[a.key]?.state ?? 'idle'} dept={s.room} planned={!a.live} screen={SCREEN[s.room]} desk={s.room !== 'board'} selected={selectedAgent === a.key} onPick={() => onPickAgent(a.key)} />; })}
          {withStation.map((a) => { const s = STATION[a.key]; return gone(a.key) && (!!cooler[a.key] || trips.some((x) => x.trip.agent === a.key && x.away)) ? <HqBot deskColors={THEME[s.room].desk} scale={LAYOUT.scale} key={`e${a.key}`} a={a} x={s.x} y={s.y} side={s.side} state="idle" dept={s.room} planned={!a.live} screen={SCREEN[s.room]} desk={s.room !== 'board'} away selected={false} onPick={() => onPickAgent(a.key)} /> : null; })}
          {cafeGuests.map((a, i) => { const seat = CAFE_SEATS[locs[a.key].seat ?? 0]; return <HqBot scale={LAYOUT.scale} key={`c${a.key}`} a={a} x={seat.x} y={seat.y + 22} side={seat.x < box('cafe').cx ? 1 : -1} state="idle" dept="cafe" planned={!a.live} screen="core" desk={false} social bubble={cafeBubble(a.key, t + i * 3000)} selected={selectedAgent === a.key} onPick={() => onPickAgent(a.key)} />; })}

          <g className="flights" pointerEvents="none">
            {pu.map((p) => { const q = alongFrac(p.pts, p.p); return <circle key={`p${p.id}`} className="pulse" cx={q.x} cy={q.y} r="5" />; })}
            {trips.map((s) => <HqWalker key={s.trip.id} a={AGENTS.find((q) => q.key === s.trip.agent)!} x={s.pos.x} y={s.pos.y} dir={s.dir} moving={s.moving} carrying={s.carrying} give={s.phase === 'handover'} scale={LAYOUT.scale} />)}
            {withStation.filter((a) => cooler[a.key]).map((a) => { const c = cooler[a.key]!; return <HqWalker key={`w${a.key}`} a={a} x={c.pos.x} y={c.pos.y} dir={c.dir} moving={c.moving} carrying={false} give={false} prop={c.cup ? 'cup' : undefined} scale={LAYOUT.scale} />; })}
            {(() => { const c = cleanerState(t); return <g className="cleaner"><polyline points={c.trail.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#bdf3ff" strokeWidth="5" strokeLinecap="round" opacity=".16" /><HqWalker a={CLEANER} x={c.pos.x} y={c.pos.y + 4} dir={c.dir} moving carrying={false} give={false} prop="mop" scale={LAYOUT.scale * 0.9} /></g>; })()}
          </g>

          {/* front glass walls with the automatic doors */}
          {ROOMS.map((r) => { const b = box(r); return (
            <g key={r} className="front">
              <rect x={b.x} y={b.wallY} width={b.cx - 50 - b.x} height="32" fill="rgba(70,130,255,.2)" stroke="#5fd0ff" strokeWidth="1" /><rect x={b.cx + 50} y={b.wallY} width={b.x + b.w - b.cx - 50} height="32" fill="rgba(70,130,255,.2)" stroke="#5fd0ff" strokeWidth="1" />
              <rect x={b.x} y={b.wallY} width={b.w} height="3" fill="#ffc94d" opacity=".8" />
              <Door r={r} open={dr[r].open} light={dr[r].light} />
              <text x={b.cx} y={b.doorY + 42} textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing=".2em" fill="rgba(190,220,255,.6)">{dr[r].open ? 'OPEN' : dr[r].light === 'amber' ? 'WAITING' : 'ENTRANCE'}</text>
            </g>); })}
          <rect x="-40" y="-20" width={WORLD.w + 80} height={WORLD.h + 60} fill={look.overlay} opacity={look.alpha} pointerEvents="none" />
          {active && <g transform={`translate(${WORLD.w / 2} ${ROW_Y[1] + 330})`}><rect x="-190" y="-12" width="380" height="22" rx="11" fill="rgba(6,16,48,.9)" stroke="rgba(123,227,255,.6)" /><text y="3" textAnchor="middle" fontSize="11" fontWeight="700" fill="#dff6ff">{describeTrip(active)}</text></g>}
        </motion.svg>
      </div>
      <p className="sr" aria-live="polite">{active ? describeTrip(active) : `${busy} busy, ${waiting} waiting for approval`}</p>
      <div className="wing-legend"><span><i className="d idle" /> Door idle</span><span><i className="d open" /> Opens only when someone walks through</span><span><i className="d amber" /> Waiting for you</span><span><i className="d green" /> Just finished</span><span><i className="d red" /> Problem</span><span className="grow">{demo ? 'Sample scenario: press Start above. ' : `${busy} busy · ${waiting} waiting · `}Café chat, the cleaning robot and water breaks are decorative.</span></div>
      <p className="wing-note">{DEPTS.filter((d) => d.key !== 'cafe' && d.key !== 'hub' && !AGENTS.some((a) => a.dept === d.key && a.live)).map((d) => d.name).join(' · ')} are planned: their agents rest and can take café breaks, but never show work.</p>
    </div>
  );
}

const CSS = `
.wing{position:relative;width:100%}.wing-cam{width:min(100%,calc((100vh - 270px) * var(--wa)));min-width:min(100%,520px);margin:0 auto;border-radius:16px;overflow:hidden;border:1px solid rgba(120,170,255,.3);box-shadow:0 0 50px rgba(40,110,255,.18) inset,0 14px 40px rgba(0,0,0,.35);background:#040a20}
.wing-cam svg{width:100%;height:100%;display:block}
.wing-btns{display:flex;gap:6px}.wing .cooler .bubble{animation:blink-a 2.4s infinite}.wing-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.wing-tag{font:800 11px/1 system-ui,sans-serif;letter-spacing:.06em;padding:6px 10px;border-radius:999px}
.wing-tag[data-mode=demo]{background:rgba(255,176,32,.18);border:1px solid #ffb020;color:#ffd07a}.wing-tag[data-mode=wait]{background:rgba(255,176,32,.18);border:1px solid #ffb020;color:#ffd07a}.wing-tag[data-mode=live]{background:rgba(60,220,140,.16);border:1px solid #3fdc94;color:#8bf3bd}
.wing-snd{font:600 11px system-ui,sans-serif;padding:6px 10px;border-radius:999px;background:rgba(8,20,62,.8);color:#cfe0ff;border:1px solid rgba(120,170,255,.4);cursor:pointer}
@media (max-width:760px){.wing-tag{font-size:9px;padding:5px 8px}.wing-cam{width:100%}}
.room{cursor:pointer;outline:none}.room:hover .rim,.room:focus-visible .rim{stroke:#9fe7ff;stroke-width:2.5}
.wing .flow{animation:flow 2.4s linear infinite}@keyframes flow{to{stroke-dashoffset:-38}}.wing .link{stroke-dasharray:2 7}
.wing .pulse{fill:#ffe28a;filter:drop-shadow(0 0 7px #ffc94d)}
.wing .core .orb{animation:orbp 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes orbp{50%{transform:scale(1.05)}}
.wing .core .ring{transform-box:fill-box;transform-origin:center;animation:spin 14s linear infinite}.wing .core .r2{animation-duration:9s;animation-direction:reverse}.wing .core .r3{animation-duration:22s}.wing .core.busy .ring{animation-duration:4s}.wing .core.wait .orb{filter:drop-shadow(0 0 16px #ffb020)}
.wing .amber{animation:blink-a 1.4s infinite}.wing .furn .steam{animation:blink-a 2s infinite}.wing .holo rect{animation:holo 3s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom}.wing .holo rect:nth-child(2n){animation-delay:.6s}@keyframes holo{50%{transform:scaleY(.7)}}
.wing.still .flow,.wing.still .core *,.wing.still .holo rect{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.wing .flow,.wing .core *,.wing .amber,.wing .holo rect{animation:none!important}}
.hqp.full .wing-cam{width:min(100%,calc((100vh - 235px) * var(--wa)))}
.wing .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.wing-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:#9fb3d9;margin-top:8px}.wing-legend .grow{margin-left:auto}.wing-legend .d{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.wing-legend .idle{background:#2f6dff}.wing-legend .open{background:#7be3ff}.wing-legend .amber{background:#ffb020}.wing-legend .green{background:#4dffa0}.wing-legend .red{background:#ff5d5d}.wing-note{font-size:11.5px;color:#8197c4;margin:4px 0 0}
`;
