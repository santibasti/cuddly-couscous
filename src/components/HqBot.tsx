// The reusable seated robot of the Living Office. A rigged SVG character (head, visor eyes, torso, two-segment arms) driven by named animation POSES.
// The pose comes from the agent's real state (see poseOf); only breathing, blinking and a slow look-around are decorative and always allowed.
import type { AgentDef, AgentState } from '@/lib/hq';
import { STATE_LABEL, hash } from '@/lib/hq';

export type Pose = 'idle' | 'typing' | 'review' | 'notify' | 'handoff' | 'waiting' | 'cheer' | 'blocked' | 'rest';
/** The single place where an operational state becomes a pose. A planned (not connected) agent can only rest. */
export function poseOf(state: AgentState, planned: boolean, key: string, dept: string): Pose {
  if (planned) return 'rest';
  switch (state) {
    case 'received': return 'notify';
    case 'working': return dept === 'booking' && hash(key) % 2 === 0 ? 'review' : 'typing';
    case 'coordinating': return 'handoff';
    case 'awaiting': return 'waiting';
    case 'done': return 'cheer';
    case 'error': case 'blocked': return 'blocked';
    default: return 'idle';
  }
}

export type ScreenKind = 'chat' | 'calendar' | 'core';
function Screen({ kind, on }: { kind: ScreenKind; on: boolean }) {
  return (
    <g className={`scr ${on ? 'on' : ''}`}>
      <rect x="-23" y="-17" width="46" height="34" rx="3" fill="#06122e" />
      {kind === 'chat' && <><rect className="m m1" x="-19" y="-13" width="22" height="6" rx="3" fill="#3fa9ff" /><rect className="m m2" x="-3" y="-4" width="21" height="6" rx="3" fill="#7be3ff" /><rect className="m m3" x="-19" y="5" width="16" height="6" rx="3" fill="#3fa9ff" /><g className="dots"><circle cx="9" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" /><circle cx="17" cy="8" r="1.3" /></g></>}
      {kind === 'calendar' && <>{[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} className={r === 1 && c === 2 ? 'cell hot' : 'cell'} x={-19 + c * 10} y={-12 + r * 9.5} width="8" height="7.5" rx="1.6" />))}</>}
      {kind === 'core' && <><circle cx="0" cy="0" r="10" fill="none" stroke="#7be3ff" strokeWidth="1.4" /><circle className="spin" cx="0" cy="0" r="6" fill="none" stroke="#ffd86b" strokeWidth="1.2" strokeDasharray="5 4" /></>}
      <rect className="sweep" x="-23" y="-17" width="46" height="4" fill="rgba(180,240,255,.35)" />
      <rect x="-23" y="-17" width="46" height="34" rx="3" fill="none" stroke="#5fd0ff" strokeWidth="1.2" opacity={on ? 1 : 0.45} />
    </g>
  );
}

export interface BotProps { a: AgentDef; x: number; y: number; side: 1 | -1; state: AgentState; dept: string; planned: boolean; screen: ScreenKind; selected: boolean; onPick: () => void }
export function HqBot({ a, x, y, side, state, dept, planned, screen, selected, onPick }: BotProps) {
  const pose = poseOf(state, planned, a.key, dept); const h = hash(a.key);
  const sty = { ['--d' as string]: `${-(h % 70) / 10}s`, ['--p' as string]: `${4 + (h % 30) / 10}s`, ['--tp' as string]: `${0.24 + (h % 17) / 100}s`, ['--side' as string]: side };
  const label = `${a.name}, ${a.role}: ${planned ? 'planned, not connected yet' : STATE_LABEL[state]}`;
  const on = !planned && (state === 'working' || state === 'received' || state === 'coordinating');
  const badge = planned ? '' : state === 'received' ? '🔔' : state === 'awaiting' ? '⏸' : state === 'done' ? '✔' : state === 'error' || state === 'blocked' ? '!' : '';
  return (
    <g className={`bot pose-${pose} dept-${dept} ${selected ? 'sel' : ''} ${planned ? 'planned' : ''}`} data-agent={a.key} data-pose={pose} data-side={side} style={sty} transform={`translate(${x} ${y}) scale(.86)`} role="button" tabIndex={0} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onPick(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(); } }}>
      <title>{label}</title>
      <ellipse className="focusring" cx="0" cy="-30" rx="56" ry="66" fill="none" stroke="#ffd86b" strokeWidth="2" strokeDasharray="5 4" />
      <ellipse cx="0" cy="34" rx="64" ry="9" fill="rgba(0,0,0,.35)" />
      <rect x="-21" y="-64" width="42" height="66" rx="12" fill="#101c46" stroke="#2a4a9a" strokeWidth="1" />
      <g className="body">
        <g transform="translate(-20 -44)"><g className="arm armL"><rect x="-4.5" y="0" width="9" height="20" rx="4.5" fill="url(#botg)" /><g transform="translate(0 19)"><g className="fore"><rect x="-4" y="0" width="8" height="18" rx="4" fill="url(#botg)" /><circle cx="0" cy="18" r="4.6" fill="#9fb4de" /></g></g></g></g>
        <g transform="translate(20 -44)"><g className="arm armR"><rect x="-4.5" y="0" width="9" height="20" rx="4.5" fill="url(#botg)" /><g transform="translate(0 19)"><g className="fore"><rect x="-4" y="0" width="8" height="18" rx="4" fill="url(#botg)" /><circle cx="0" cy="18" r="4.6" fill="#9fb4de" /></g></g></g></g>
        <rect x="-18" y="-54" width="36" height="56" rx="12" fill="url(#botg)" stroke="#8fa8d8" strokeWidth=".8" />
        <rect x="-10" y="-42" width="20" height="14" rx="4" fill="#0b1b45" /><text x="0" y="-31.6" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={a.shirt} fontFamily="system-ui,sans-serif">AI</text>
        <rect x="-18" y="-18" width="36" height="5" fill={a.shirt} opacity=".85" />
        <g transform="translate(0 -54)"><g className="head">
          <rect x="-4" y="-4" width="8" height="6" fill="#8fa8d8" />
          <line x1="0" y1="-38" x2="0" y2="-45" stroke="#8fa8d8" strokeWidth="1.5" /><circle className="ant" cx="0" cy="-46" r="2.8" />
          <rect x="-21.5" y="-24" width="4.5" height="12" rx="2.2" fill="#8fa8d8" /><rect x="17" y="-24" width="4.5" height="12" rx="2.2" fill="#8fa8d8" />
          <rect x="-18" y="-38" width="36" height="36" rx="13" fill="url(#botg)" stroke="#8fa8d8" strokeWidth=".8" />
          <rect x="-14.5" y="-31" width="29" height="19" rx="8" fill="#08153a" />
          <g transform="translate(0 -21.5)"><g className="eyes"><circle className="eye" cx="-6.2" cy="0" r="3.1" /><circle className="eye" cx="6.2" cy="0" r="3.1" /></g></g>
          <path className="mouth" d="M-3.5 -9.4q3.5 2.3 7 0" fill="none" strokeWidth="1.1" />
        </g></g>
      </g>
      {badge && <g className="badge" transform="translate(30 -92)"><circle r="9" /><text y="3.6" textAnchor="middle" fontSize="10" fontWeight="800">{badge}</text></g>}
      <rect x="-66" y="0" width="132" height="9" rx="3" fill="url(#desktop)" stroke="#5fd0ff" strokeWidth=".8" />
      <rect x="-66" y="9" width="132" height="22" rx="3" fill="#0a1740" stroke="#2a4a9a" strokeWidth=".8" opacity=".94" />
      <g className="kb"><rect x="-22" y="1.5" width="44" height="6" rx="2" fill="#12295f" />{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} className={`key k${i % 4}`} x={-20 + i * 5} y="3" width="3.6" height="3" rx=".8" />)}</g>
      <g transform={`translate(${side * 50} -22)`}><rect x="-3" y="14" width="6" height="8" fill="#2a4a9a" /><Screen kind={screen} on={on} /></g>
      <text className="nm" x="0" y="25" textAnchor="middle" fontSize="11" fontWeight="700">{a.name}{planned ? ' · PLANNED' : ''}</text>
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
.bot .badge circle{fill:#ffd86b}.bot .badge text{fill:#1b1200}.bot .nm{fill:#dbe8ff;paint-order:stroke;stroke:#050d26;stroke-width:3px}.bot .pl{fill:#9fb3d9;paint-order:stroke;stroke:#050d26;stroke-width:3px;letter-spacing:.1em}
.bot .key{fill:#2a4f9a}.bot.planned{opacity:.5}
.bot .scr .m,.bot .scr .cell{fill:#1c3a73}.bot .scr .dots circle{fill:#7be3ff;opacity:0}.bot .scr .sweep{opacity:0}.bot .scr .cell.hot{fill:#2a4f9a}.bot .scr .spin{transform-box:fill-box;transform-origin:center}
.bot .scr.on .m1{animation:s-pop 3.2s infinite}.bot .scr.on .m2{animation:s-pop 3.2s .9s infinite}.bot .scr.on .m3{animation:s-pop 3.2s 1.8s infinite}.bot .scr.on .dots circle{animation:s-dot 1s infinite}.bot .scr.on .dots circle:nth-child(2){animation-delay:.18s}.bot .scr.on .dots circle:nth-child(3){animation-delay:.36s}
.bot .scr.on .cell{fill:#2c64c4}.bot .scr.on .cell.hot{fill:#ffd86b;animation:s-hot 1.4s infinite}.bot .scr.on .sweep{opacity:1;animation:s-sweep 2.4s linear infinite}.bot .scr.on .spin{animation:spin 3s linear infinite}
@keyframes b-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}
@keyframes b-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}
@keyframes b-look{0%,100%{transform:rotate(0)}22%{transform:rotate(-6deg)}48%{transform:rotate(5deg) translateY(.6px)}74%{transform:rotate(1.5deg)}}
@keyframes s-pop{0%,8%{opacity:.25}18%,70%{opacity:1}90%,100%{opacity:.25}}@keyframes s-dot{0%,100%{opacity:.2}50%{opacity:1}}@keyframes s-hot{50%{fill:#fff3b8}}@keyframes s-sweep{from{transform:translateY(-4px)}to{transform:translateY(36px)}}@keyframes spin{to{transform:rotate(360deg)}}
/* working: typing (messenger desk) */
.bot.pose-typing .head{animation:h-screen 5.5s ease-in-out infinite;animation-delay:var(--d)}
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
.bot.pose-notify{--eye:#ffd86b}.bot.pose-notify .head{animation:h-notify 1.2s ease-out 2}.bot.pose-notify .armR{animation:wave .5s ease-in-out infinite alternate}.bot.pose-notify .ant{animation:blink-a .5s infinite}
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
.bot.pose-blocked{--eye:#ff6b6b}.bot.pose-blocked .head{animation:shake .5s ease-in-out infinite}.bot.pose-blocked .arm{transform:rotate(36deg)}.bot.pose-blocked .armR{transform:rotate(-36deg)}
@keyframes shake{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
/* planned = resting, nothing connected */
.bot.pose-rest{--eye:#5a6d99}.bot.pose-rest .eyes{animation:none;transform:scaleY(.16)}.bot.pose-rest .head{animation:none;transform:rotate(6deg)}.bot.pose-rest .body{animation:none}
@media (prefers-reduced-motion:reduce){.bot *{animation:none!important}}
.still .bot *{animation-play-state:paused!important}
`;
