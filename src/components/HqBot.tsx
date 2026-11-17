// The reusable seated robot of the Living Office. A rigged SVG character (head, visor eyes, torso, two-segment arms) driven by named animation POSES.
// The pose comes from the agent's real state (see poseOf); only breathing, blinking and a slow look-around are decorative and always allowed.
import type { AgentDef, AgentState } from '@/lib/hq';
import { STATE_LABEL, hash } from '@/lib/hq';

export type Pose = 'idle' | 'typing' | 'review' | 'notify' | 'handoff' | 'waiting' | 'cheer' | 'blocked' | 'rest' | 'social';
/** The single place where an operational state becomes a pose. A planned (not connected) agent can only rest. */
export function poseOf(state: AgentState, planned: boolean, key: string, dept: string): Pose {
  if (planned) return 'rest';
  switch (state) {
    case 'received': return 'notify';
    case 'working': return dept === 'booking' ? (hash(key) % 2 === 0 ? 'review' : 'typing') : dept === 'creative' || dept === 'ads' || dept === 'board' ? 'review' : 'typing';
    case 'coordinating': return 'handoff';
    case 'awaiting': return 'waiting';
    case 'done': return 'cheer';
    case 'error': case 'blocked': return 'blocked';
    default: return 'idle';
  }
}

export type ScreenKind = 'chat' | 'calendar' | 'core' | 'mail' | 'photo' | 'chart' | 'list';
function Screen({ kind, on }: { kind: ScreenKind; on: boolean }) {
  return (
    <g className={`scr ${on ? 'on' : ''}`}>
      <rect x="-23" y="-17" width="46" height="34" rx="3" fill="#06122e" />
      {kind === 'chat' && <><rect className="m m1" x="-19" y="-13" width="22" height="6" rx="3" fill="#3fa9ff" /><rect className="m m2" x="-3" y="-4" width="21" height="6" rx="3" fill="#7be3ff" /><rect className="m m3" x="-19" y="5" width="16" height="6" rx="3" fill="#3fa9ff" /><g className="dots"><circle cx="9" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" /><circle cx="17" cy="8" r="1.3" /></g></>}
      {kind === 'calendar' && <>{[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} className={r === 1 && c === 2 ? 'cell hot' : 'cell'} x={-19 + c * 10} y={-12 + r * 9.5} width="8" height="7.5" rx="1.6" />))}</>}
      {kind === 'mail' && <>{[0, 1, 2].map((i) => <g key={i}><rect className="m" x="-19" y={-13 + i * 10} width="6" height="6" rx="1.5" fill="#3fa9ff" /><rect className={`m m${i + 1}`} x="-10" y={-12 + i * 10} width={26 - i * 4} height="4" rx="2" fill="#7be3ff" /></g>)}</>}
      {kind === 'photo' && <><rect x="-19" y="-13" width="18" height="26" rx="2" fill="#2a3f78" /><rect className="m m2" x="1" y="-13" width="18" height="26" rx="2" fill="#7be3ff" /><circle cx="-10" cy="-3" r="4" fill="#4a5f98" /><circle cx="10" cy="-3" r="4" fill="#ffe28a" /></>}
      {kind === 'chart' && <>{[8, 15, 11, 22, 17].map((h, i) => <rect key={i} className={`m m${(i % 3) + 1}`} x={-18 + i * 8} y={14 - h} width="5.5" height={h} rx="1.2" fill="#7be3ff" />)}</>}
      {kind === 'list' && <>{[0, 1, 2].map((i) => <g key={i}><rect className={`cell ${i === 1 ? 'hot' : ''}`} x="-19" y={-12 + i * 9.5} width="7" height="7" rx="1.5" /><rect className={`m m${i + 1}`} x="-9" y={-10.5 + i * 9.5} width={24 - i * 5} height="4" rx="2" fill="#3fa9ff" /></g>)}</>}
      {kind === 'core' && <><circle cx="0" cy="0" r="10" fill="none" stroke="#7be3ff" strokeWidth="1.4" /><circle className="spin" cx="0" cy="0" r="6" fill="none" stroke="#ffd86b" strokeWidth="1.2" strokeDasharray="5 4" /></>}
      <rect className="sweep" x="-23" y="-17" width="46" height="4" fill="rgba(180,240,255,.35)" />
      <rect x="-23" y="-17" width="46" height="34" rx="3" fill="none" stroke="#5fd0ff" strokeWidth="1.2" opacity={on ? 1 : 0.45} />
    </g>
  );
}


// ── the look: glossy toy robots (round white head, big dark visor, a lens ring on the side, chunky joints in the agent's own accent colour, a prop in the hand that tells the job)
export type PropKind = 'phone' | 'envelope' | 'clip' | 'tablet' | 'camera' | 'laptop' | 'magnifier' | 'orb';
const PROP_OF: Record<string, PropKind> = {
  jarvis: 'orb', messenger: 'phone', qualifier: 'clip', support: 'phone', router: 'tablet', quote: 'clip', booking: 'tablet', scheduler: 'tablet', joborders: 'clip',
  inbox: 'envelope', mailer: 'envelope', followup: 'phone', photo: 'camera', video: 'camera', creative: 'clip', qc: 'magnifier', campaign: 'clip', strategist: 'laptop', attrib: 'magnifier',
  records: 'clip', attendance: 'magnifier', training: 'clip', growth: 'tablet', industry: 'clip', cfo: 'laptop', ops: 'tablet',
};
export const propOf = (key: string): PropKind => PROP_OF[key] ?? 'tablet';
function Prop({ kind, accent }: { kind: PropKind; accent: string }) {
  switch (kind) {
    case 'phone': return <g><rect x="-3.6" y="-13" width="7.2" height="14" rx="1.9" fill="#1b2750" stroke="#d6def3" strokeWidth=".8" /><rect x="-2.4" y="-11" width="4.8" height="9" rx=".8" fill={accent} opacity=".75" /></g>;
    case 'envelope': return <g><rect x="-8.5" y="-11" width="17" height="11.5" rx="1.6" fill="#f4f7ff" stroke="#cfd8ee" strokeWidth=".8" /><path d="M-8.5 -11L0 -4.2L8.5 -11" fill="none" stroke={accent} strokeWidth="1.2" /></g>;
    case 'clip': return <g><rect x="-7.5" y="-16" width="15" height="18" rx="2" fill="#d9993f" stroke="#a87325" strokeWidth=".7" /><rect x="-5.5" y="-13" width="11" height="13.5" rx="1" fill="#fff" /><rect x="-2.5" y="-17.5" width="5" height="3.4" rx="1" fill="#6b7a99" />{[-9, -6, -3].map((y) => <rect key={y} x="-4" y={y} width="8" height="1.1" fill={accent} opacity=".85" />)}</g>;
    case 'tablet': return <g><rect x="-6.5" y="-16" width="13" height="17" rx="2" fill="#12204a" stroke="#d6def3" strokeWidth=".8" />{[-12, -8, -4].map((y, i) => <rect key={y} x="-4.5" y={y} width={9 - i * 2} height="2" rx="1" fill={accent} opacity=".85" />)}</g>;
    case 'camera': return <g><rect x="-8.5" y="-10" width="17" height="11" rx="2.2" fill="#1b2233" stroke="#4a5778" strokeWidth=".7" /><rect x="-4" y="-12.5" width="6" height="3" rx="1" fill="#2c3550" /><circle cx="0" cy="-4.5" r="4.4" fill="#0a0f1c" stroke={accent} strokeWidth="1.5" /><circle cx="-1" cy="-5.5" r="1" fill="#fff" opacity=".7" /></g>;
    case 'laptop': return <g><rect x="-9.5" y="-14" width="19" height="11.5" rx="1.4" fill="#0f1a3d" stroke={accent} strokeWidth="1" /><rect x="-10.5" y="-2.5" width="21" height="2.8" rx="1" fill="#cfd8ee" /></g>;
    case 'magnifier': return <g><circle cx="-2" cy="-10" r="5.6" fill="rgba(160,220,255,.28)" stroke="#d6def3" strokeWidth="1.8" /><line x1="2" y1="-6" x2="6.5" y2="0" stroke="#8fa8d8" strokeWidth="2.6" strokeLinecap="round" /><path d="M-5 -12q2 -3 5 -2" fill="none" stroke="#fff" strokeWidth="1" opacity=".7" /></g>;
    case 'orb': return <g><circle cx="0" cy="-8" r="6.4" fill="url(#coreg)" style={{ filter: 'drop-shadow(0 0 5px #4fc4ff)' }} /><ellipse cx="0" cy="-8" rx="8.4" ry="2.6" fill="none" stroke={accent} strokeWidth="1" /></g>;
  }
}
function Joint({ cx = 0, cy = 0, accent, r = 5 }: { cx?: number; cy?: number; accent: string; r?: number }) {
  return <g><circle cx={cx} cy={cy} r={r} fill="#dfe6f5" stroke="#8fa8d8" strokeWidth=".8" /><circle cx={cx} cy={cy} r={r * 0.42} fill={accent} /></g>;
}
/** One arm: upper arm, elbow joint, forearm, a grey gripper hand and (right hand only) the prop. */
function ToyArm({ cls, accent, prop, held }: { cls: string; accent: string; prop?: PropKind; held?: boolean }) {
  return (
    <g className={`arm ${cls}`}><rect x="-4.8" y="0" width="9.6" height="20" rx="4.8" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".6" />
      <g transform="translate(0 19)"><g className="fore"><Joint accent={accent} r={4.6} /><rect x="-4.2" y="2" width="8.4" height="15" rx="4.2" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".6" /><circle cx="0" cy="18" r="5" fill="#4a5778" stroke="#9fb4de" strokeWidth=".7" /><circle cx="0" cy="18" r="2" fill={accent} opacity=".9" />
        {prop && <g className={held ? 'held' : ''} transform="translate(0 18)"><Prop kind={prop} accent={accent} /></g>}</g></g></g>
  );
}
/** The round head, seen from the front: glossy shell, big dark visor with glowing eyes, a lens ring on the side, an accent stripe. */
function ToyHead({ accent, ant }: { accent: string; ant: boolean }) {
  return (
    <>
      <rect x="-4.5" y="-4" width="9" height="6" rx="2" fill="#9fb4de" />
      {ant && <g><line x1="0" y1="-39" x2="0" y2="-46" stroke="#9fb4de" strokeWidth="1.6" /><circle className="ant" cx="0" cy="-47" r="2.8" /></g>}
      <circle cx="-22" cy="-20" r="5.4" fill="#25304f" stroke="#9fb4de" strokeWidth="1.2" /><circle cx="-22" cy="-20" r="2.4" fill={accent} opacity=".9" />
      <ellipse cx="0" cy="-21" rx="22" ry="19.5" fill="url(#shell)" stroke="#9fb4de" strokeWidth=".9" />
      <path d="M-15 -34Q0 -43 15 -34" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="-1" cy="-21" rx="16.5" ry="12.8" fill="url(#visor)" stroke="#0b1230" strokeWidth="1" />
      <path d="M-11 -28Q-3 -33.5 6 -30.5" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round" />
      <g transform="translate(-1 -21)"><g className="eyes"><circle className="eye" cx="-6.4" cy="0" r="3.4" /><circle className="eye" cx="6.4" cy="0" r="3.4" /><circle cx="-7.4" cy="-1.1" r=".9" fill="#fff" opacity=".85" /><circle cx="5.4" cy="-1.1" r=".9" fill="#fff" opacity=".85" /></g></g>
      <path className="mouth" d="M-4 -12.6q4 2.4 8 0" fill="none" strokeWidth="1.1" />
      <circle cx="22" cy="-20" r="8" fill="#1b2750" stroke="#9fb4de" strokeWidth="1.4" /><circle cx="22" cy="-20" r="5.3" fill="none" stroke={accent} strokeWidth="1.8" /><circle cx="22" cy="-20" r="2.6" fill="#070d24" /><circle cx="21" cy="-21" r=".9" fill="#fff" opacity=".8" />
    </>
  );
}
function ToyTorso({ accent }: { accent: string }) {
  return (
    <>
      <rect x="-17" y="-53" width="34" height="55" rx="14" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".8" />
      <circle cx="0" cy="-35" r="8" fill="#0b1b45" stroke="#9fb4de" strokeWidth="1" /><circle cx="0" cy="-35" r="4" fill={accent} style={{ filter: `drop-shadow(0 0 4px ${accent})` }} /><circle cx="-1" cy="-36" r="1.1" fill="#fff" opacity=".8" />
      <rect x="-17" y="-19" width="34" height="5" fill={accent} opacity=".9" />
    </>
  );
}

export interface BotProps { scale?: number; desk?: boolean; social?: boolean; bubble?: string | null; a: AgentDef; x: number; y: number; side: 1 | -1; state: AgentState; dept: string; planned: boolean; screen: ScreenKind; selected: boolean; away?: boolean; onPick: () => void }
export function HqBot({ scale = 0.74, desk = true, social = false, bubble, a, x, y, side, state, dept, planned, screen, selected, away, onPick }: BotProps) {
  const pose: Pose = social ? 'social' : poseOf(state, planned, a.key, dept); const h = hash(a.key);
  const sty = { ['--d' as string]: `${-(h % 70) / 10}s`, ['--p' as string]: `${4 + (h % 30) / 10}s`, ['--tp' as string]: `${0.24 + (h % 17) / 100}s`, ['--side' as string]: side };
  const label = `${a.name}, ${a.role}: ${planned ? 'planned, not connected yet' : STATE_LABEL[state]}`;
  const on = !planned && (state === 'working' || state === 'received' || state === 'coordinating');
  const badge = planned ? '' : state === 'received' ? '🔔' : state === 'awaiting' ? '⏸' : state === 'done' ? '✔' : state === 'error' || state === 'blocked' ? '!' : '';
  return (
    <g className={`bot pose-${pose} dept-${dept} ${selected ? 'sel' : ''} ${planned ? 'planned' : ''}`} data-agent={a.key} data-pose={pose} data-side={side} style={sty} transform={`translate(${x} ${y}) scale(${scale})`} role="button" tabIndex={0} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onPick(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(); } }}>
      <title>{label}</title>
      <ellipse className="focusring" cx="0" cy="-30" rx="56" ry="66" fill="none" stroke="#ffd86b" strokeWidth="2" strokeDasharray="5 4" />
      <ellipse cx="0" cy="34" rx="64" ry="9" fill="rgba(0,0,0,.35)" />
      {desk && <rect x="-22" y="-66" width="44" height="68" rx="14" fill="#101c46" stroke="#2a4a9a" strokeWidth="1" />}
      <g className="body" style={away ? { display: 'none' } : undefined}>
        <g transform="translate(-20 -44)"><ToyArm cls="armL" accent={a.shirt} /><Joint accent={a.shirt} r={5.4} /></g>
        <g transform="translate(20 -44)"><ToyArm cls="armR" accent={a.shirt} prop={propOf(a.key)} held /><Joint accent={a.shirt} r={5.4} /></g>
        <ToyTorso accent={a.shirt} />
        <g transform="translate(0 -54)"><g className="head"><ToyHead accent={a.shirt} ant={hash(a.key) % 3 === 0} /></g></g>
      </g>
      {bubble && <g className="bub" transform="translate(0 -118)"><rect x="-62" y="-12" width="124" height="22" rx="11" fill="#f4f7ff" /><text y="3" textAnchor="middle" fontSize="9" fontWeight="700" fill="#10204f">{bubble}</text></g>}
      {badge && !away && <g className="badge" transform="translate(30 -92)"><circle r="9" /><text y="3.6" textAnchor="middle" fontSize="10" fontWeight="800">{badge}</text></g>}
      {desk && <><rect x="-66" y="0" width="132" height="9" rx="3" fill="url(#desktop)" stroke="#5fd0ff" strokeWidth=".8" />
      <rect x="-66" y="9" width="132" height="22" rx="3" fill="#0a1740" stroke="#2a4a9a" strokeWidth=".8" opacity=".94" />
      <g className="kb"><rect x="-22" y="1.5" width="44" height="6" rx="2" fill="#12295f" />{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} className={`key k${i % 4}`} x={-20 + i * 5} y="3" width="3.6" height="3" rx=".8" />)}</g>
      <g transform={`translate(${side * 50} -22)`}><rect x="-3" y="14" width="6" height="8" fill="#2a4a9a" /><Screen kind={screen} on={on} /></g></>}
      {social && <g className="cup" transform={`translate(${side * -22} -46)`}><rect x="-5" y="-6" width="10" height="11" rx="2" fill="#f4f7ff" /><path d="M5 -3q5 1 0 6" fill="none" stroke="#f4f7ff" strokeWidth="1.6" /><path className="steam" d="M-2 -9q-3 -4 0 -7" fill="none" stroke="rgba(220,240,255,.7)" strokeWidth="1.2" /></g>}
      <text className="nm" x="0" y="25" textAnchor="middle" fontSize="11" fontWeight="700">{a.name}{planned && !social ? ' · PLANNED' : ''}</text>
    </g>
  );
}

export const BOT_CSS = `
.bot{cursor:pointer;outline:none;--eye:#7fe4ff}.bot .focusring{opacity:0}.bot:focus-visible .focusring,.bot.sel .focusring{opacity:1}
.bot .eye{fill:var(--eye)}.bot .ant{fill:var(--eye)}.bot .mouth{stroke:var(--eye)}
.bot .body{animation:b-breathe var(--p) ease-in-out infinite;animation-delay:var(--d)}
.bot .eyes{animation:b-blink var(--p) infinite;animation-delay:var(--d)}
.bot .head{animation:b-look calc(var(--p) * 2.2) ease-in-out infinite;animation-delay:var(--d)}
.bot .arm{transform:rotate(7deg)}.bot .armR{transform:rotate(-7deg)}.bot .fore{transform:rotate(-12deg)}.bot .armR .fore{transform:rotate(12deg)}
.bot .held{transition:opacity .3s}.bot.pose-typing .held,.bot.pose-review .held{opacity:0}.bot .badge circle{fill:#ffd86b}.bot .badge text{fill:#1b1200}.bot .nm{fill:#dbe8ff;paint-order:stroke;stroke:#050d26;stroke-width:3px}.bot .pl{fill:#9fb3d9;paint-order:stroke;stroke:#050d26;stroke-width:3px;letter-spacing:.1em}
.bot .key{fill:#2a4f9a}.bot.planned{opacity:.5}
.bot .scr .m,.bot .scr .cell{fill:#1c3a73}.bot .scr .dots circle{fill:#7be3ff;opacity:0}.bot .scr .sweep{opacity:0}.bot .scr .cell.hot{fill:#2a4f9a}.bot .scr .spin{transform-box:fill-box;transform-origin:center}
.bot .scr.on .m1{animation:s-pop 3.2s infinite}.bot .scr.on .m2{animation:s-pop 3.2s .9s infinite}.bot .scr.on .m3{animation:s-pop 3.2s 1.8s infinite}.bot .scr.on .dots circle{animation:s-dot 1s infinite}.bot .scr.on .dots circle:nth-child(2){animation-delay:.18s}.bot .scr.on .dots circle:nth-child(3){animation-delay:.36s}
.bot .scr.on .cell{fill:#2c64c4}.bot .scr.on .cell.hot{fill:#ffd86b;animation:s-hot 1.4s infinite}.bot .scr.on .sweep{opacity:1;animation:s-sweep 2.4s linear infinite}.bot .scr.on .spin{animation:spin 3s linear infinite}
@keyframes b-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}
@keyframes b-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}
@keyframes b-look{0%,100%{transform:rotate(0)}22%{transform:rotate(-6deg)}48%{transform:rotate(5deg) translateY(.6px)}74%{transform:rotate(1.5deg)}}
@keyframes s-pop{0%,8%{opacity:.25}18%,70%{opacity:1}90%,100%{opacity:.25}}@keyframes s-dot{0%,100%{opacity:.2}50%{opacity:1}}@keyframes s-hot{50%{fill:#fff3b8}}@keyframes s-sweep{from{transform:translateY(-4px)}to{transform:translateY(36px)}}@keyframes spin{to{transform:rotate(360deg)}}
/* working: typing (messenger desk) */
.bot.pose-typing .head{animation:h-screen 5.48s ease-in-out infinite;animation-delay:var(--d)}
.bot.pose-typing .armL{transform:rotate(12deg)}.bot.pose-typing .armR{transform:rotate(-12deg)}
.bot.pose-typing .armL .fore{animation:tap-l var(--tp) ease-in-out infinite alternate;animation-delay:var(--d)}.bot.pose-typing .armR .fore{animation:tap-r calc(var(--tp) * 1.31) ease-in-out infinite alternate;animation-delay:var(--d)}
.bot.pose-typing .key.k0{animation:key .3s infinite}.bot.pose-typing .key.k1{animation:key .4s .1s infinite}.bot.pose-typing .key.k2{animation:key .35s .2s infinite}.bot.pose-typing .key.k3{animation:key .5s .05s infinite}
@keyframes h-screen{0%,100%{transform:rotate(calc(var(--side) * 7deg))}40%{transform:rotate(calc(var(--side) * 9deg)) translateY(1px)}70%{transform:rotate(calc(var(--side) * 3deg))}}
@keyframes tap-l{from{transform:rotate(-26deg)}to{transform:rotate(-40deg)}}@keyframes tap-r{from{transform:rotate(26deg)}to{transform:rotate(40deg)}}@keyframes key{50%{fill:#9fe7ff}}
/* working: reviewing (booking desk) - one hand follows the screen, the head scans it */
.bot.pose-review .head{animation:h-scan 6s ease-in-out infinite;animation-delay:var(--d)}
.bot[data-side="1"].pose-review .armR{animation:point 2.6s ease-in-out infinite;animation-delay:var(--d)}.bot[data-side="-1"].pose-review .armL{animation:point-l 2.6s ease-in-out infinite;animation-delay:var(--d)}
.bot.pose-review .armR .fore,.bot.pose-review .armL .fore{transform:rotate(0)}
.bot[data-side="1"].pose-review .armL .fore{animation:tap-l calc(var(--tp) * 2) ease-in-out infinite alternate}.bot[data-side="-1"].pose-review .armR .fore{animation:tap-r calc(var(--tp) * 2) ease-in-out infinite alternate}
@keyframes h-scan{0%,100%{transform:rotate(calc(var(--side) * 4deg))}25%{transform:rotate(calc(var(--side) * 10deg))}55%{transform:rotate(calc(var(--side) * 8deg)) translateY(1px)}80%{transform:rotate(calc(var(--side) * 2deg))}}
@keyframes point{0%,100%{transform:rotate(-62deg)}50%{transform:rotate(-74deg)}}@keyframes point-l{0%,100%{transform:rotate(62deg)}50%{transform:rotate(74deg)}}
/* hub: JARVIS works by conducting the hologram */
.bot.pose-typing.dept-hub .armL{animation:conduct-l 3s ease-in-out infinite}.bot.pose-typing.dept-hub .armR{animation:conduct-r 3s ease-in-out infinite .4s}
@keyframes conduct-l{0%,100%{transform:rotate(60deg)}50%{transform:rotate(95deg)}}@keyframes conduct-r{0%,100%{transform:rotate(-60deg)}50%{transform:rotate(-95deg)}}
/* new task */
.bot.pose-notify{--eye:#ffd86b}.bot.pose-notify .head{animation:h-notify 1.2s ease-out 2}.bot.pose-notify .armR{animation:wave .48s ease-in-out infinite alternate}.bot.pose-notify .ant{animation:blink-a .5s infinite}
@keyframes h-notify{0%{transform:rotate(0)}30%{transform:rotate(calc(var(--side) * -8deg)) translateY(-1px)}100%{transform:rotate(calc(var(--side) * 8deg))}}@keyframes wave{from{transform:rotate(-120deg)}to{transform:rotate(-150deg)}}@keyframes blink-a{50%{opacity:.2}}
/* hand-over: the arm passes the task toward the corridor */
.bot.pose-handoff .armR{transform:rotate(-34deg);animation:pass 1.1s ease-in-out infinite alternate}.bot.pose-handoff .head{animation:none;transform:rotate(0)}
@keyframes pass{from{transform:rotate(-24deg)}to{transform:rotate(-52deg)}}
/* waiting for approval: turns to the owner, arms folded, amber */
.bot.pose-waiting{--eye:#ffb347}.bot.pose-waiting .head{animation:h-wait 3s ease-in-out infinite}.bot.pose-waiting .arm{transform:rotate(-22deg)}.bot.pose-waiting .armR{transform:rotate(22deg)}.bot.pose-waiting .armL .fore{transform:rotate(-95deg)}.bot.pose-waiting .armR .fore{transform:rotate(95deg)}.bot.pose-waiting .ant{animation:blink-a 1.2s infinite}
@keyframes h-wait{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg) translateY(-1px)}}
/* finished */
.bot.pose-cheer{--eye:#7dffb2}.bot.pose-cheer .body{animation:cheer .7s ease-in-out 3}.bot.pose-cheer .armL{transform:rotate(155deg)}.bot.pose-cheer .armR{transform:rotate(-155deg)}.bot.pose-cheer .armL .fore,.bot.pose-cheer .armR .fore{animation:cheer-w .35s ease-in-out infinite alternate}
@keyframes cheer{0%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}@keyframes cheer-w{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
/* problem */
.bot.pose-blocked{--eye:#ff6b6b}.bot.pose-blocked .head{animation:shake .48s ease-in-out infinite}.bot.pose-blocked .arm{transform:rotate(36deg)}.bot.pose-blocked .armR{transform:rotate(-36deg)}
@keyframes shake{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
/* café: relaxed, a cup in one hand, turning toward the neighbour; a sip now and then */
.bot.pose-social{--eye:#9fe7ff}.bot.pose-social .head{animation:h-chat calc(var(--p) * 1.6) ease-in-out infinite;animation-delay:var(--d)}.bot.pose-social .armR{transform:rotate(-24deg)}.bot.pose-social .armR .fore{transform:rotate(-96deg);animation:sip 8s ease-in-out infinite;animation-delay:var(--d)}.bot.pose-social .armL{animation:gest 5s ease-in-out infinite;animation-delay:var(--d)}.bot .steam{animation:blink-a 2s infinite}.bot .bub text{font-family:system-ui,sans-serif}
@keyframes h-chat{0%,100%{transform:rotate(calc(var(--side) * -6deg))}35%{transform:rotate(calc(var(--side) * -10deg)) translateY(.6px)}70%{transform:rotate(calc(var(--side) * 4deg))}}
@keyframes sip{0%,70%,100%{transform:rotate(-96deg)}80%,88%{transform:rotate(-128deg)}}@keyframes gest{0%,60%,100%{transform:rotate(8deg)}72%{transform:rotate(-40deg)}84%{transform:rotate(-30deg)}}
/* planned = resting, nothing connected */
.bot.pose-rest{--eye:#5a6d99}.bot.pose-rest .eyes{animation:none;transform:scaleY(.16)}.bot.pose-rest .head{animation:none;transform:rotate(6deg)}.bot.pose-rest .body{animation:none}
@media (prefers-reduced-motion:reduce){.bot *{animation:none!important}}
.still .bot *{animation-play-state:paused!important}
`;

/** A standing robot that walks. Seen from the side when it walks along the corridor (real stepping legs), from the front or back when it walks toward or away from the viewer. Same toy-robot look as the seated ones. */
export function HqWalker({ a, x, y, dir, moving, carrying, give, prop, scale = 0.74 }: { scale?: number; prop?: 'card' | 'cup' | 'mop'; a: AgentDef; x: number; y: number; dir: { x: number; y: number }; moving: boolean; carrying: boolean; give: boolean }) {
  const view: 'side' | 'front' | 'back' = Math.abs(dir.x) > 0 ? 'side' : dir.y < 0 ? 'back' : 'front'; const f = dir.x < 0 ? -1 : 1; const h = hash(a.key); const ac = a.shirt;
  const card = <g className="wk-card" transform="translate(0 -4)"><rect x="-12" y="-8" width="24" height="16" rx="4" /><path d="M-6 -3l6 4.5l6 -4.5" fill="none" stroke="#06122e" strokeWidth="1.3" /></g>;
  const leg = (cls: string, x0: number) => <g transform={`translate(${x0} -36)`}><g className={`wk-leg ${cls}`}><rect x="-5" y="0" width="10" height="19" rx="5" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".6" /><g transform="translate(0 18)"><g className="wk-shin"><circle r="4.4" fill="#dfe6f5" stroke="#8fa8d8" strokeWidth=".7" /><circle r="1.8" fill={ac} /><rect x="-4.6" y="2" width="9.2" height="14" rx="4.6" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".6" /><rect x={view === 'side' ? -5 : -7} y="13" width={view === 'side' ? 16 : 14} height="8" rx="4" fill={ac} stroke="#0b1230" strokeWidth=".7" /></g></g></g></g>;
  const arm = (cls: string, x0: number, withProp = false) => <g transform={`translate(${x0} -78)`}><g className={`wk-arm ${cls}`}><rect x="-4.6" y="0" width="9.2" height="19" rx="4.6" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".6" /><g transform="translate(0 18)"><g className="wk-fore"><Joint accent={ac} r={4.4} /><rect x="-4" y="2" width="8" height="14" rx="4" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".6" /><circle cy="17" r="4.8" fill="#4a5778" stroke="#9fb4de" strokeWidth=".7" />{withProp && view !== 'back' && !prop && <g transform="translate(0 17)" className="wk-tool"><Prop kind={propOf(a.key)} accent={ac} /></g>}</g></g></g></g>;
  const lift = give && !moving;
  return (
    <g className={`walker v-${view} ${moving ? 'go' : 'stand'} ${lift ? 'give' : ''}`} transform={`translate(${x} ${y}) scale(${scale})`} style={{ ['--wd' as string]: `${-(h % 5) / 10}s` }} pointerEvents="none" aria-hidden>
      <ellipse cx="0" cy="1" rx="22" ry="5.5" fill="rgba(0,0,0,.38)" />
      <g transform={`scale(${view === 'side' ? f : 1} 1)`}>
        <g className="wk-bob">
          {view === 'side' ? <>
            {leg('far', 3)}{arm('far', 0)}
            <rect x="-12" y="-87" width="24" height="53" rx="11" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".8" /><circle cx="6" cy="-66" r="6.2" fill="#0b1b45" stroke="#9fb4de" strokeWidth=".9" /><circle cx="6" cy="-66" r="3" fill={ac} style={{ filter: `drop-shadow(0 0 3px ${ac})` }} /><rect x="-12" y="-52" width="24" height="4.5" fill={ac} opacity=".9" />
            <g transform="translate(0 -86)"><g className="wk-head"><rect x="-3.5" y="-4" width="7" height="6" rx="2" fill="#9fb4de" /><ellipse cx="0" cy="-21" rx="19" ry="19.5" fill="url(#shell)" stroke="#9fb4de" strokeWidth=".9" /><path d="M-12 -34Q0 -42 12 -34" fill="none" stroke={ac} strokeWidth="2.6" strokeLinecap="round" /><ellipse cx="7" cy="-21" rx="11.5" ry="12.6" fill="url(#visor)" stroke="#0b1230" strokeWidth="1" /><circle cx="11" cy="-21" r="3.6" fill="#7fe4ff" /><circle cx="10" cy="-22.2" r=".9" fill="#fff" opacity=".85" /><circle cx="-5" cy="-20" r="7" fill="#1b2750" stroke="#9fb4de" strokeWidth="1.3" /><circle cx="-5" cy="-20" r="4.6" fill="none" stroke={ac} strokeWidth="1.7" /><circle cx="-5" cy="-20" r="2.2" fill="#070d24" /></g></g>
            {leg('near', -3)}{arm('near', 0, true)}
          </> : <>
            {leg('far', 8)}{leg('near', -8)}
            <rect x="-17" y="-87" width="34" height="53" rx="14" fill="url(#botg)" stroke="#9fb4de" strokeWidth=".8" />
            {view === 'front' ? <><circle cx="0" cy="-69" r="8" fill="#0b1b45" stroke="#9fb4de" strokeWidth="1" /><circle cx="0" cy="-69" r="4" fill={ac} style={{ filter: `drop-shadow(0 0 4px ${ac})` }} /></> : <rect x="-8" y="-76" width="16" height="12" rx="4" fill="#cfd8ee" stroke="#9fb4de" strokeWidth=".7" />}
            <rect x="-17" y="-52" width="34" height="5" fill={ac} opacity=".9" />
            {arm('far', 21, true)}{arm('near', -21)}
            <g transform="translate(0 -86)"><g className="wk-head"><rect x="-4" y="-4" width="8" height="6" rx="2" fill="#9fb4de" />
              <circle cx="-22" cy="-20" r="5.4" fill="#25304f" stroke="#9fb4de" strokeWidth="1.2" /><circle cx="22" cy="-20" r="8" fill="#1b2750" stroke="#9fb4de" strokeWidth="1.4" /><circle cx="22" cy="-20" r="5.3" fill="none" stroke={ac} strokeWidth="1.8" /><circle cx="22" cy="-20" r="2.6" fill="#070d24" />
              <ellipse cx="0" cy="-21" rx="22" ry="19.5" fill="url(#shell)" stroke="#9fb4de" strokeWidth=".9" /><path d="M-15 -34Q0 -43 15 -34" fill="none" stroke={ac} strokeWidth="2.6" strokeLinecap="round" />
              {view === 'front' ? <><ellipse cx="-1" cy="-21" rx="16.5" ry="12.8" fill="url(#visor)" stroke="#0b1230" strokeWidth="1" /><circle cx="-7.4" cy="-21" r="3.4" fill="#7fe4ff" /><circle cx="5.4" cy="-21" r="3.4" fill="#7fe4ff" /></> : <><rect x="-9" y="-30" width="18" height="9" rx="4.5" fill="#cfd8ee" stroke="#9fb4de" strokeWidth=".7" /><rect x="-5" y="-18" width="10" height="3" rx="1.5" fill={ac} opacity=".85" /></>}
            </g></g>
          </>}
          {(carrying || (prop && prop !== 'card')) && (() => { const what = prop ?? 'card'; const at = view === 'side' ? 'translate(18 -46)' : view === 'front' ? 'translate(-24 -46)' : 'translate(24 -46)';
            return what === 'card' ? <g className="wk-held" transform={view === 'side' ? 'translate(16 -50)' : 'translate(0 -52)'}>{card}</g>
              : what === 'cup' ? <g className="wk-held" transform={at}><rect x="-4.5" y="-6" width="9" height="10" rx="2" fill="#f4f7ff" /><path d="M4.5 -3q4 1 0 5" fill="none" stroke="#f4f7ff" strokeWidth="1.4" /></g>
              : <g className="wk-held" transform={view === 'side' ? 'translate(16 -46)' : view === 'front' ? 'translate(-26 -48)' : 'translate(26 -48)'}><line x1="0" y1="-6" x2={view === 'side' ? 22 : 0} y2="46" stroke="#b78a4a" strokeWidth="3" strokeLinecap="round" /><rect x={view === 'side' ? 14 : -9} y="42" width="20" height="7" rx="3" fill="#7fe4ff" /></g>; })()}
        </g>
      </g>
    </g>
  );
}

export const WALK_CSS = `
.walker .wk-bob{animation:none}.walker.go .wk-bob{animation:wk-bob .48s ease-in-out infinite;animation-delay:var(--wd)}
.walker.go.v-side .wk-leg.near{animation:wk-near .48s ease-in-out infinite}.walker.go.v-side .wk-leg.far{animation:wk-far .48s ease-in-out infinite}
.walker.go.v-side .wk-leg.near .wk-shin{animation:wk-knee .48s ease-in-out infinite}.walker.go.v-side .wk-leg.far .wk-shin{animation:wk-knee .48s ease-in-out infinite .25s}
.walker.go.v-side .wk-arm.near{animation:wk-far .48s ease-in-out infinite;transform-origin:0 0}.walker.go.v-side .wk-arm.far{animation:wk-near .48s ease-in-out infinite}
.walker.go.v-side .wk-fore{transform:rotate(-14deg)}.walker.v-side .wk-leg.far,.walker.v-side .wk-arm.far{opacity:.82}
.walker.go:not(.v-side) .wk-leg.near{animation:wk-lift .48s ease-in-out infinite}.walker.go:not(.v-side) .wk-leg.far{animation:wk-lift .48s ease-in-out infinite .25s}
.walker.go:not(.v-side) .wk-arm.near{animation:wk-sway .48s ease-in-out infinite}.walker.go:not(.v-side) .wk-arm.far{animation:wk-sway .48s ease-in-out infinite .25s}
.walker .wk-head{animation:none}.walker.go .wk-head{animation:wk-nod .48s ease-in-out infinite}
.walker .wk-held{transition:none}.walker.give .wk-arm.near{transform:rotate(-70deg)}.walker.give.v-side .wk-arm.near .wk-fore{transform:rotate(-10deg)}
.walker .wk-tool{transition:opacity .2s}.walker.go .wk-tool{opacity:0}.walker .wk-card rect{fill:#bdf3ff;stroke:#fff;stroke-width:1;filter:drop-shadow(0 0 5px #4fc4ff)}
@keyframes wk-near{0%,100%{transform:rotate(34deg)}50%{transform:rotate(-34deg)}}@keyframes wk-far{0%,100%{transform:rotate(-34deg)}50%{transform:rotate(34deg)}}
@keyframes wk-knee{0%,40%{transform:rotate(0)}70%{transform:rotate(-34deg)}100%{transform:rotate(0)}}
@keyframes wk-bob{0%,50%,100%{transform:translateY(0)}25%,75%{transform:translateY(-1.8px)}}
@keyframes wk-lift{0%,100%{transform:translateY(0)}25%{transform:translateY(-4px)}50%{transform:translateY(0)}}
@keyframes wk-sway{0%,100%{transform:rotate(7deg)}50%{transform:rotate(-7deg)}}@keyframes wk-nod{0%,100%{transform:rotate(0)}50%{transform:rotate(.8deg)}}
@media (prefers-reduced-motion:reduce){.walker *{animation:none!important}}
.still .walker *{animation-play-state:paused!important}
`;
