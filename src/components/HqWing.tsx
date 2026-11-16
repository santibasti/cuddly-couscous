// LIVING OFFICE V2, step 1+2: three real rooms (Messenger Desk, JARVIS Atrium, Booking) joined by a visible corridor with automatic sliding doors.
// Doors, packets and pulses come only from events (see lib/hqwing.ts). Decorative motion (breathing, blinking, looking around, café-style idle) never changes a status.
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AGENTS, STATE_LABEL, type AgentView, type DeptKey, type HqEvent, type Kpi } from '@/lib/hq';
import { AISLE, DOOR_Y, FLOOR_Y, HALL_Y, ROOM_BOX, ROOM_NAME, STATION, WING_ROOMS, along, describeFlight, doors, flights, pulses, route, type DoorLight, type Room } from '@/lib/hqwing';
import { BOT_CSS, HqBot, HqWalker, WALK_CSS, type ScreenKind } from './HqBot';

const SCREEN: Record<Room, ScreenKind> = { desk: 'chat', booking: 'calendar', hub: 'core' };
const LIGHT: Record<DoorLight, string> = { idle: '#2f6dff', open: '#7be3ff', amber: '#ffb020', green: '#4dffa0', red: '#ff5d5d' };
const VB: Record<string, string> = { all: '0 0 1200 620', desk: '0 150 620 320', hub: '290 150 620 320', booking: '580 150 620 320' };
const VB_M: Record<string, string> = { all: '0 0 1200 620', desk: '0 90 460 520', hub: '370 90 460 520', booking: '740 90 460 520' };

/** A clock that runs smoothly between the (slower) real or demo clock updates. It stops when paused, hidden or when reduced motion is asked for. */
function useSmooth(now: number, run: boolean) {
  const ref = useRef({ now, at: performance.now() }); const [t, setT] = useState(now);
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

function Door({ cx, open, light }: { cx: number; open: boolean; light: DoorLight }) {
  const c = LIGHT[light]; const slide = open ? 42 : 0;
  return (
    <g className="door" data-open={open} data-light={light}>
      <rect x={cx - 52} y={DOOR_Y - 22} width="104" height="6" rx="2" fill="#0d1d4d" stroke="#5fd0ff" strokeWidth=".8" />
      <circle cx={cx} cy={DOOR_Y - 30} r="5.5" fill={c} style={{ filter: `drop-shadow(0 0 ${open ? 9 : 4}px ${c})`, transition: 'fill .4s' }} />
      <rect x={cx - 50} y={DOOR_Y - 16} width="100" height="34" fill="#02081d" />
      <g style={{ transform: `translateX(${-slide}px)`, transition: 'transform .75s cubic-bezier(.65,0,.3,1)' }}><rect x={cx - 50} y={DOOR_Y - 16} width="50" height="34" fill="rgba(110,190,255,.28)" stroke="#8fe0ff" strokeWidth="1" /><rect x={cx - 4} y={DOOR_Y - 14} width="3" height="30" fill={c} opacity=".9" /></g>
      <g style={{ transform: `translateX(${slide}px)`, transition: 'transform .75s cubic-bezier(.65,0,.3,1)' }}><rect x={cx} y={DOOR_Y - 16} width="50" height="34" fill="rgba(110,190,255,.28)" stroke="#8fe0ff" strokeWidth="1" /><rect x={cx + 1} y={DOOR_Y - 14} width="3" height="30" fill={c} opacity=".9" /></g>
      <polygon points={`${cx - 46},${DOOR_Y + 18} ${cx + 46},${DOOR_Y + 18} ${cx + 92},${HALL_Y + 52} ${cx - 92},${HALL_Y + 52}`} fill="url(#spill)" style={{ opacity: open ? 0.9 : 0.12, transition: 'opacity .6s' }} />
    </g>
  );
}

function RoomShell({ r, live, kpis, demo, count, onOpen }: { r: Room; live: boolean; kpis?: Kpi[]; demo: boolean; count: number; onOpen: () => void }) {
  const b = ROOM_BOX[r]; const cx = AISLE[r];
  return (
    <g className={`room room-${r}`} role="button" tabIndex={0} aria-label={`Open the ${ROOM_NAME[r]} work queue`} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <rect x={b.x} y="30" width={b.w} height="422" rx="10" fill="#060f2c" />
      <rect x={b.x} y="30" width={b.w} height="86" fill="url(#wallg)" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={b.x + 14 + i * ((b.w - 28) / 5)} y="38" width={(b.w - 28) / 5 - 6} height="50" rx="3" fill="url(#glassg)" opacity=".55" />)}
      <path d={`M${b.x + 14} 88 l14 -16 l10 8 l16 -22 l12 20 l20 -12 l14 22 l22 -26 l16 24 l22 -10 l14 14 H${b.x + b.w - 14} V88 Z`} fill="#0a1a4d" opacity=".7" />
      <rect x={b.x} y="116" width={b.w} height={FLOOR_Y + 8 - 116} fill="url(#floorg)" />
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => <line key={i} x1={cx + i * 34} y1="116" x2={cx + i * 66} y2={FLOOR_Y + 8} stroke="rgba(120,180,255,.1)" />)}
      {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={b.x} x2={b.x + b.w} y1={140 + i * i * 14 + i * 20} y2={140 + i * i * 14 + i * 20} stroke="rgba(120,180,255,.08)" />)}
      <rect x={b.x + b.w / 2 - 130} y="40" width="260" height="22" rx="11" fill="rgba(8,20,62,.85)" stroke="rgba(120,200,255,.5)" />
      <text x={cx} y="55" textAnchor="middle" fontSize="12.5" fontWeight="800" letterSpacing=".08em" fill="#dff1ff">{ROOM_NAME[r].toUpperCase()}</text>
      <g transform={`translate(${b.x + b.w - 14} 72)`}><rect x="-76" y="-11" width="76" height="17" rx="8.5" fill={live ? 'rgba(60,220,140,.22)' : 'rgba(150,170,210,.2)'} /><text x="-38" y="1.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill={live ? '#7ff0b4' : '#9fb3d9'}>{live ? `LIVE${count ? ` · ${count} today` : ''}` : 'PLANNED'}</text></g>
      {kpis?.slice(0, 2).map((k, i) => <g key={k.label} transform={`translate(${b.x + 22 + i * 125} 78)`}><text fontSize="21" fontWeight="800" fill="#7be3ff">{k.value}</text><text y="12" fontSize="8" fill="#a9c2ee">{k.label}{demo ? ' · sample' : ''}</text></g>)}
      <rect className="rim" x={b.x} y="30" width={b.w} height="422" rx="10" fill="none" stroke="rgba(110,170,255,.45)" strokeWidth="1.5" />
    </g>
  );
}

export interface HqWingProps { demo: boolean; events: HqEvent[]; views: Record<string, AgentView>; kpis?: Partial<Record<DeptKey, Kpi[]>>; now: number; still: boolean; hold: boolean; focus: string; selectedAgent: string; mobile: boolean; onPickDept: (d: string) => void; onPickAgent: (k: string) => void }

export function HqWing({ demo, events, views, kpis, now, still, hold, focus, selectedAgent, mobile, onPickDept, onPickAgent }: HqWingProps) {
  const reduce = useReducedMotion(); const frozen = still || hold || !!reduce;
  const t = useSmooth(now, !frozen); const [sound, setSound] = useState(false); const ctx = useRef<AudioContext | null>(null);
  const fl = flights(events, t), dr = doors(events, views, t), pu = pulses(events, t), today = new Date(now).toISOString().slice(0, 10);
  const vbKey = WING_ROOMS.includes(focus as Room) ? focus : mobile ? 'desk' : 'all'; const vb = (mobile ? VB_M : VB)[vbKey];
  const prev = useRef<Record<string, boolean>>({});
  useEffect(() => { // an optional, quiet chime on every door change. Off until the person turns it on.
    for (const r of WING_ROOMS) { if (prev.current[r] !== undefined && prev.current[r] !== dr[r].open && sound && ctx.current) beep(ctx.current, dr[r].open); prev.current[r] = dr[r].open; }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSound = () => { if (!sound) { try { ctx.current = ctx.current ?? new AudioContext(); void ctx.current.resume(); } catch { /* no audio */ } } setSound(!sound); };
  const waiting = AGENTS.filter((a) => STATION[a.key] && views[a.key]?.state === 'awaiting').length, busy = AGENTS.filter((a) => STATION[a.key] && ['working', 'received', 'coordinating'].includes(views[a.key]?.state)).length;
  const active = fl[0];

  return (
    <div className={`wing ${frozen ? 'still' : ''}`}>
      <style>{BOT_CSS}{WALK_CSS}{CSS}</style>
      <div className="wing-tag" data-mode={demo ? 'demo' : 'live'}>{demo ? 'SAMPLE · DEMO MODE · nothing is sent or saved' : 'LIVE · doors and packets follow real events'}</div>
      <button type="button" className="wing-snd" onClick={toggleSound} aria-pressed={sound}>{sound ? '🔊 Door sounds on' : '🔇 Door sounds off'}</button>
      <div className="wing-cam" style={{ aspectRatio: mobile ? '460 / 520' : '1200 / 620' }}>
        <motion.svg viewBox={vb} animate={{ viewBox: vb }} transition={{ duration: reduce ? 0 : 0.9, ease: [0.65, 0, 0.3, 1] }} preserveAspectRatio="xMidYMid slice" role="group" aria-label="Living office: Messenger desk, JARVIS atrium and Booking joined by a corridor">
          <defs>
            <linearGradient id="botg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#b3c4e6" /></linearGradient>
            <linearGradient id="desktop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#19a4d6" /><stop offset="1" stopColor="#0f4f94" /></linearGradient>
            <linearGradient id="wallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12307a" /><stop offset="1" stopColor="#0a1c52" /></linearGradient>
            <linearGradient id="glassg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5fa8ff" stopOpacity=".5" /><stop offset="1" stopColor="#1b3f9a" stopOpacity=".1" /></linearGradient>
            <linearGradient id="floorg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c2159" /><stop offset="1" stopColor="#081541" /></linearGradient>
            <linearGradient id="hallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1a4a" /><stop offset="1" stopColor="#050e2c" /></linearGradient>
            <linearGradient id="spill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7be3ff" stopOpacity=".55" /><stop offset="1" stopColor="#7be3ff" stopOpacity="0" /></linearGradient>
            <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7be3ff" stopOpacity="0" /><stop offset="1" stopColor="#bdf3ff" /></linearGradient>
            <radialGradient id="coreg" cx=".5" cy=".4" r=".6"><stop offset="0" stopColor="#e6fbff" /><stop offset=".35" stopColor="#4fc4ff" /><stop offset="1" stopColor="#0d3aa8" stopOpacity=".85" /></radialGradient>
            <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fd8ff" stopOpacity=".38" /><stop offset="1" stopColor="#6fd8ff" stopOpacity="0" /></linearGradient>
          </defs>
          <rect x="-40" y="-20" width="1280" height="680" fill="#040a20" />
          {/* the corridor: a real architectural space, not the gap between cards */}
          <g className="hall">
            <rect x="0" y={FLOOR_Y + 40} width="1200" height="180" fill="url(#hallg)" />
            <rect x="0" y={DOOR_Y + 12} width="1200" height="6" fill="#0b1c52" /><rect x="0" y={DOOR_Y + 14} width="1200" height="2" fill="#5fd0ff" opacity=".55" />
            {Array.from({ length: 13 }, (_, i) => <line key={i} x1={i * 100} y1={DOOR_Y + 18} x2={600 + (i - 6) * 230} y2="620" stroke="rgba(120,180,255,.09)" />)}
            <line className="flow" x1="20" y1={HALL_Y} x2="1180" y2={HALL_Y} stroke="rgba(123,227,255,.35)" strokeWidth="2" strokeDasharray="3 16" />
            <rect x="0" y="596" width="1200" height="4" fill="#ffc94d" opacity=".4" />
            <text x="600" y="590" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing=".4em" fill="rgba(160,200,255,.45)">MAIN CORRIDOR</text>
            {(['desk', 'booking'] as Room[]).map((r) => <path key={r} className="link" d={`M600 ${DOOR_Y + 18}V${HALL_Y}H${AISLE[r]}V${DOOR_Y + 18}`} fill="none" stroke="rgba(123,227,255,.28)" strokeWidth="2.5" />)}
          </g>
          {WING_ROOMS.map((r) => <RoomShell key={r} r={r} live={r === 'hub' || AGENTS.some((a) => STATION[a.key]?.room === r && a.live)} kpis={kpis?.[r]} demo={demo} count={events.filter((e) => (e.dept === r) && e.at.slice(0, 10) === today).length} onOpen={() => onPickDept(r)} />)}

          {/* JARVIS core */}
          <g className={`core ${busy ? 'busy' : ''} ${waiting ? 'wait' : ''}`} transform="translate(600 205)">
            <polygon points="-34,-18 34,-18 80,110 -80,110" fill="url(#cone)" />
            <ellipse cx="0" cy="112" rx="92" ry="18" fill="#0b2a75" stroke="#5fd0ff" strokeWidth="1.5" /><ellipse cx="0" cy="110" rx="62" ry="11" fill="none" stroke="#ffc94d" strokeWidth="1.2" opacity=".8" />
            <circle className="orb" cx="0" cy="0" r="46" fill="url(#coreg)" />
            <ellipse className="ring r1" cx="0" cy="0" rx="72" ry="19" fill="none" stroke="#7be3ff" strokeWidth="2" /><ellipse className="ring r2" cx="0" cy="0" rx="62" ry="15" fill="none" stroke="#ffc94d" strokeWidth="1.6" /><ellipse className="ring r3" cx="0" cy="0" rx="54" ry="48" fill="none" stroke="#7be3ff" strokeWidth="1.2" strokeDasharray="4 6" />
            <text y="9" textAnchor="middle" fontSize="26" fontWeight="900" fill="#fff" style={{ filter: 'drop-shadow(0 0 6px #4fc4ff)' }}>AI</text>
            <text y="86" textAnchor="middle" fontSize="10" fontWeight="800" letterSpacing=".25em" fill="#ffd98a">JARVIS CORE</text>
            {waiting > 0 && <g className="amber" transform="translate(0 -66)"><rect x="-70" y="-11" width="140" height="21" rx="10.5" fill="rgba(255,176,32,.2)" stroke="#ffb020" /><text y="4" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#ffcf70">{waiting} WAITING FOR YOU</text></g>}
          </g>

          {/* desks, robots */}
          {AGENTS.filter((a) => STATION[a.key]).map((a) => { const s = STATION[a.key]; return <HqBot key={a.key} a={a} x={s.x} y={s.y} side={s.side} state={views[a.key]?.state ?? 'idle'} dept={s.room} planned={!a.live} screen={SCREEN[s.room]} selected={selectedAgent === a.key} away={fl.some((f) => f.from === a.key && f.away)} onPick={() => onPickAgent(a.key)} />; })}

          {/* walking agents and routing pulses, under the front glass wall so the doors really occlude them */}
          <g className="flights" pointerEvents="none">
            {pu.map((p) => { const pts = [{ x: 600, y: DOOR_Y + 18 }, { x: 600, y: HALL_Y }, { x: AISLE[p.room], y: HALL_Y }, { x: AISLE[p.room], y: DOOR_Y + 14 }]; const q = along(pts, p.p * 1000); return <circle key={`p${p.id}`} className="pulse" cx={q.x} cy={q.y} r="5" />; })}
            {fl.filter((f) => f.away).map((f) => <HqWalker key={f.id} a={AGENTS.find((q) => q.key === f.from)!} x={f.pos!.x} y={f.pos!.y + 30} dir={f.dir} moving={f.moving} carrying={f.carrying} give={f.phase === 'handover'} />)}
          </g>

          {/* front glass walls with the automatic doors */}
          {WING_ROOMS.map((r) => { const b = ROOM_BOX[r], cx = AISLE[r]; return (
            <g key={r} className="front">
              <rect x={b.x} y={FLOOR_Y + 8} width={cx - 52 - b.x} height="42" fill="rgba(70,130,255,.2)" stroke="#5fd0ff" strokeWidth="1" /><rect x={cx + 52} y={FLOOR_Y + 8} width={b.x + b.w - cx - 52} height="42" fill="rgba(70,130,255,.2)" stroke="#5fd0ff" strokeWidth="1" />
              <rect x={b.x} y={FLOOR_Y + 8} width={b.w} height="3" fill="#ffc94d" opacity=".8" />
              <Door cx={cx} open={dr[r].open} light={dr[r].light} />
              <text x={cx} y={DOOR_Y + 40} textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing=".2em" fill="rgba(190,220,255,.65)">{dr[r].open ? 'OPEN' : dr[r].light === 'amber' ? 'WAITING' : 'ENTRANCE'}</text>
            </g>); })}
          {active && <g transform="translate(600 568)"><rect x="-190" y="-13" width="380" height="24" rx="12" fill="rgba(6,16,48,.88)" stroke="rgba(123,227,255,.6)" /><text y="3.5" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#dff6ff">{describeFlight(active)}</text></g>}
        </motion.svg>
      </div>
      <p className="sr" aria-live="polite">{active ? describeFlight(active) : `${busy} busy, ${waiting} waiting for approval`}</p>
      <div className="wing-legend"><span><i className="d idle" /> Door idle</span><span><i className="d open" /> Opens only for a hand-over</span><span><i className="d amber" /> Waiting for you</span><span><i className="d green" /> Just finished</span><span><i className="d red" /> Problem</span><span className="grow">{demo ? 'Sample scenario: press Start above.' : `${busy} agent(s) busy · ${waiting} waiting`}</span></div>
    </div>
  );
}

const CSS = `
.wing{position:relative}.wing-cam{width:100%;border-radius:16px;overflow:hidden;border:1px solid rgba(120,170,255,.3);box-shadow:0 0 50px rgba(40,110,255,.18) inset,0 14px 40px rgba(0,0,0,.35);background:#040a20}
.wing-cam svg{width:100%;height:100%;display:block}
.wing-tag{position:absolute;z-index:3;left:12px;top:10px;font:800 11px/1 system-ui,sans-serif;letter-spacing:.06em;padding:6px 10px;border-radius:999px;pointer-events:none}
.wing-tag[data-mode=demo]{background:rgba(255,176,32,.18);border:1px solid #ffb020;color:#ffd07a}.wing-tag[data-mode=live]{background:rgba(60,220,140,.16);border:1px solid #3fdc94;color:#8bf3bd}
.wing-snd{position:absolute;z-index:3;right:12px;top:8px;font:600 11px system-ui,sans-serif;padding:6px 10px;border-radius:999px;background:rgba(8,20,62,.8);color:#cfe0ff;border:1px solid rgba(120,170,255,.4);cursor:pointer}
.room{cursor:pointer;outline:none}
@media (max-width:760px){.wing-tag{font-size:9px;padding:5px 8px;left:8px;top:8px;max-width:calc(100% - 16px)}.wing-snd{top:auto;bottom:8px;right:8px}}.room:hover .rim,.room:focus-visible .rim{stroke:#9fe7ff;stroke-width:2.5}
.wing .flow{animation:flow 2.4s linear infinite}@keyframes flow{to{stroke-dashoffset:-38}}
.wing .link{stroke-dasharray:2 7}
.wing .card rect{fill:#bdf3ff;stroke:#fff;stroke-width:1.2;filter:drop-shadow(0 0 7px #4fc4ff)}.wing .pulse{fill:#ffe28a;filter:drop-shadow(0 0 7px #ffc94d)}.wing .trail{filter:drop-shadow(0 0 5px #4fc4ff)}
.wing .core .orb{animation:orbp 4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes orbp{50%{transform:scale(1.05)}}
.wing .core .ring{transform-box:fill-box;transform-origin:center;animation:spin 14s linear infinite}.wing .core .r2{animation-duration:9s;animation-direction:reverse}.wing .core .r3{animation-duration:22s}.wing .core.busy .ring{animation-duration:4s}.wing .core.wait .orb{filter:drop-shadow(0 0 16px #ffb020)}
.wing .amber{animation:blink-a 1.4s infinite}
.wing.still .flow,.wing.still .core *{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.wing .flow,.wing .core *,.wing .amber{animation:none!important}}
.wing .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.wing-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:#9fb3d9;margin-top:8px}.wing-legend .grow{margin-left:auto}.wing-legend .d{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.wing-legend .idle{background:#2f6dff}.wing-legend .open{background:#7be3ff}.wing-legend .amber{background:#ffb020}.wing-legend .green{background:#4dffa0}.wing-legend .red{background:#ff5d5d}
`;
