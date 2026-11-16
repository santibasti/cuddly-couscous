// The cinematic headquarters: concept art of the AI headquarters as the stage, with the LIVE layer on top of it. The art is only a picture; everything that moves or shows a number
// comes from real events and the app's own records: glowing rings on departments that are working or waiting for you, light packets travelling to the AI core when something
// really happens, and "holographic" screens that replace the painted dashboards with real figures (or say "Not connected yet").
import { ServicesPill, SVC_PILL_CSS, type ServicesSummary } from './HqServicesPill';
import { AGENTS, hash, type AgentView, type DeptKey, type HqEvent, type Kpi } from '@/lib/hq';
import { HqRobots } from '@/components/HqRobots';

const W = 1569, H = 882;
interface Zone { dept: DeptKey; name: string; hot: [number, number, number, number]; scr: [number, number, number, number]; chip: [number, number, 'l' | 'r']; path: string }
// percentages of the picture; `path` runs from the AI core to the department in picture pixels
const ZONES: Zone[] = [
  { dept: 'email', name: 'Email Ops', hot: [1.5, 1.5, 34, 31], scr: [2.8, 9.8, 32.6, 17.2], chip: [21.5, 3.7, 'l'], path: 'M 720 250 C 600 240 520 235 430 262' },
  { dept: 'creative', name: 'Creative Studio', hot: [64, 1.5, 35, 31], scr: [67.6, 9.6, 29.8, 17.6], chip: [76.5, 3.7, 'r'], path: 'M 850 250 C 970 240 1050 235 1140 262' },
  { dept: 'ads', name: 'Ads Manager Team', hot: [0, 33.5, 36, 27], scr: [1.3, 38.8, 33.8, 14.4], chip: [22.5, 34.6, 'l'], path: 'M 700 290 C 560 330 500 380 440 420' },
  { dept: 'desk', name: 'Messaging Inquiry Desk', hot: [65, 33.5, 35, 27], scr: [66, 38, 33, 16.6], chip: [72.4, 34.8, 'r'], path: 'M 870 290 C 1010 330 1070 380 1130 430' },
  { dept: 'booking', name: 'Booking, Quotation & Scheduling', hot: [35, 54.5, 41, 28], scr: [36.6, 59, 38.4, 13.4], chip: [67.6, 54.8, 'l'], path: 'M 785 360 C 785 420 785 480 785 560' },
  { dept: 'hr', name: 'HR Team', hot: [0, 61, 37, 37], scr: [1.6, 65.4, 34.4, 16.2], chip: [16.5, 62.8, 'l'], path: 'M 700 330 C 600 450 560 560 470 650' },
  { dept: 'board', name: 'Board Room', hot: [62, 61, 38, 38], scr: [70.6, 71.4, 28.4, 9.4], chip: [78.4, 62.4, 'r'], path: 'M 870 330 C 980 460 1060 580 1120 700' },
];
const HUB = { x: 50.1, y: 30.4 };

type DeptLive = { state: 'idle' | 'working' | 'awaiting' | 'error'; awaiting: number; busy: number };
export function deptLive(views: Record<string, AgentView>, dept: string): DeptLive {
  const mates = AGENTS.filter((a) => a.dept === dept); const st = mates.map((a) => views[a.key]?.state);
  const awaiting = st.filter((s) => s === 'awaiting').length, busy = st.filter((s) => ['working', 'received', 'coordinating', 'done'].includes(s as string)).length;
  return { state: st.includes('error') ? 'error' : awaiting ? 'awaiting' : busy ? 'working' : 'idle', awaiting, busy };
}

export function HqCinematic({ services, demo = false, events, views, kpis, now, selected, onPick, onPickAgent, still }: { services?: ServicesSummary; events: HqEvent[]; views: Record<string, AgentView>; kpis: Partial<Record<DeptKey, Kpi[]>>; now: number; selected: string; onPick: (d: string) => void; onPickAgent: (k: string) => void; still: boolean; demo?: boolean }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const packets = events.filter((e) => now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) < 4200 && ZONES.some((z) => z.dept === e.dept));
  const lastCore = events.filter((e) => e.dept === 'hub' || e.agent === 'jarvis').map((e) => Date.parse(e.at)).filter((t) => t <= now).sort((a, b) => b - a)[0];
  const hubHot = lastCore !== undefined && now - lastCore < 6000;
  const zoneOf = (dept: string) => ZONES.find((z) => z.dept === dept);

  return (
    <div className="cin" role="img" aria-label="TOPMOP AI Headquarters: departments with live activity">
      <style>{CSS}{SVC_PILL_CSS}{'.cin-scr .hd{display:flex;align-items:center;gap:6px}.cin-scr .hd .svcpill{margin-left:auto;padding:1px 8px}'}</style>
      <div className="cin-stage">
        <img className="cin-art" src="/hq/headquarters.webp" alt="" draggable={false} />
        <div className="cin-grade" />
        {ZONES.map((z) => { const k = kpis[z.dept]; return (
          <div key={`s-${z.dept}`} className="cin-scr" style={{ left: `${z.scr[0]}%`, top: `${z.scr[1]}%`, width: `${z.scr[2]}%`, height: `${z.scr[3]}%` }}>
            <div className="hd"><i />{k ? (demo ? 'SAMPLE DATA' : 'LIVE DATA') : 'PLANNED'}{z.dept === 'booking' && services && <ServicesPill compact s={services} onOpen={() => onPick('booking')} />}</div>
            <div className="kp">{k ? k.map((x) => <div key={x.label}><b>{x.value}</b><span>{x.label}</span></div>) : <div className="off"><span>Not connected yet</span></div>}</div>

          </div>); })}

        <svg className="cin-streams" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs><filter id="cg"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {ZONES.map((z) => <path key={z.dept} d={z.path} className={`flow ${deptLive(views, z.dept).state}`} />)}
          {packets.flatMap((e) => { const z = zoneOf(e.dept)!; const to = e.to_agent ? zoneOf(AGENTS.find((a) => a.key === e.to_agent)?.dept ?? '') : undefined; const colour = e.kind === 'fail' ? '#ff6a5a' : e.kind === 'approval' ? '#ffc233' : '#7fe7ff';
            const dot = (key: string, d: string, rev: boolean, begin: string) => <circle key={key} r="7" fill={colour} filter="url(#cg)"><animateMotion dur="1.9s" begin={begin} fill="freeze" path={d} keyPoints={rev ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear" /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur="1.9s" begin={begin} fill="freeze" /></circle>;
            return [dot(`${e.id}a`, z.path, true, '0s'), ...(to && to.dept !== z.dept ? [dot(`${e.id}b`, to.path, false, '1.9s')] : [])]; })}
        </svg>

        {ZONES.map((z) => { const L = deptLive(views, z.dept); const n = events.filter((e) => e.dept === z.dept && e.at.slice(0, 10) === today && Date.parse(e.at) <= now).length; const live = AGENTS.some((a) => a.dept === z.dept && a.live);
          return (
            <button key={z.dept} type="button" className={`cin-hot ${L.state} ${selected === z.dept ? 'sel' : ''}`} style={{ left: `${z.hot[0]}%`, top: `${z.hot[1]}%`, width: `${z.hot[2]}%`, height: `${z.hot[3]}%` }} onClick={() => onPick(selected === z.dept ? '' : z.dept)} aria-label={`${z.name}: ${live ? 'live' : 'planned'}`}>
              <span className="cb tl" /><span className="cb tr" /><span className="cb bl" /><span className="cb br" />
            </button>); })}
        {ZONES.map((z) => { const L = deptLive(views, z.dept); const n = events.filter((e) => e.dept === z.dept && e.at.slice(0, 10) === today && Date.parse(e.at) <= now).length; const live = AGENTS.some((a) => a.dept === z.dept && a.live);
          return (
            <div key={`c-${z.dept}`} className={`cin-chip ${L.state} ${z.chip[2]}`} style={{ [z.chip[2] === 'l' ? 'left' : 'right']: z.chip[2] === 'l' ? `${z.chip[0]}%` : `${100 - z.chip[0]}%`, top: `${z.chip[1]}%` }}>
              <em className={live ? 'on' : ''}>{live ? `LIVE${n ? ` · ${n}` : ''}` : 'PLANNED'}</em>{L.awaiting > 0 && <strong title="Waiting for your approval">⏸ {L.awaiting}</strong>}{L.state === 'error' && <strong className="bad">⚠</strong>}
            </div>); })}

        <div className={`cin-core ${hubHot ? 'hot' : ''}`} style={{ left: `${HUB.x}%`, top: `${HUB.y}%` }} key={`core-${hubHot ? lastCore : 'idle'}`}><i /><i /><i /><span>JARVIS</span></div>
        <div className="cin-steam" style={{ left: '55.5%', top: '47.5%' }}><i /><i /><i /></div>
        <HqRobots views={views} onPickAgent={onPickAgent} focusDept={selected} still={still} />
        <div className="cin-motes" aria-hidden>{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ left: `${(hash(`m${i}`) % 1000) / 10}%`, top: `${(hash(`n${i}`) % 1000) / 10}%`, animationDelay: `${(i * 0.9) % 12}s`, animationDuration: `${9 + (i % 7)}s`, width: `${2 + (i % 3)}px`, height: `${2 + (i % 3)}px` }} />)}</div>
        <div className="cin-note">Concept art · the glowing panels, rings and light packets are live</div>
      </div>
    </div>
  );
}

const CSS = `
.cin{width:100%;overflow-x:auto;border-radius:16px;border:1px solid rgba(120,160,255,.28);background:#030a22;box-shadow:0 0 50px rgba(40,100,255,.22)}
.cin-stage{position:relative;width:100%;min-width:900px;aspect-ratio:1569/882;overflow:hidden;container-type:inline-size;user-select:none}
.cin-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;animation:cinkb 38s ease-in-out infinite alternate;transform-origin:50% 40%}
.cin-grade{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 35%,transparent 45%,rgba(2,8,30,.55) 100%),linear-gradient(180deg,rgba(40,90,255,.07),transparent 40%,rgba(255,170,60,.05));mix-blend-mode:normal;animation:cinbloom 9s ease-in-out infinite}
.cin-scr{position:absolute;box-sizing:border-box;border-radius:10px;backdrop-filter:blur(9px) saturate(1.1) brightness(.78);background:linear-gradient(180deg,rgba(6,24,80,.62),rgba(4,14,52,.72));border:1px solid rgba(110,190,255,.55);box-shadow:0 0 22px rgba(60,150,255,.4),inset 0 0 22px rgba(60,150,255,.18);display:flex;flex-direction:column;justify-content:center;padding:.5cqw 1cqw;overflow:hidden}
.cin-scr:after{content:"";position:absolute;left:0;right:0;height:30%;top:-30%;background:linear-gradient(180deg,transparent,rgba(130,220,255,.16),transparent);animation:cinscan 5.5s linear infinite}
.cin-scr .hd{display:flex;align-items:center;gap:.5cqw;font:700 max(8px,.78cqw)/1 system-ui,sans-serif;letter-spacing:.2em;color:#7fb5ff;margin-bottom:.4cqw}.cin-scr .hd i{width:.55cqw;height:.55cqw;border-radius:50%;background:#5dff9c;box-shadow:0 0 8px #5dff9c;animation:cinblink 1.6s ease-in-out infinite}
.cin-scr .kp{display:flex;gap:1.2cqw;align-items:stretch;justify-content:space-around;flex:1}.cin-scr .kp>div{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;flex:1}
.cin-scr .kp b{font:800 max(15px,2.7cqw)/1 system-ui,sans-serif;color:#8ff0ff;text-shadow:0 0 14px rgba(100,210,255,.8)}.cin-scr .kp span{font:500 max(8px,.85cqw)/1.2 system-ui,sans-serif;color:#a9c3ee;text-align:center;margin-top:.3cqw}.cin-scr .off span{font-style:italic;font-size:max(10px,1.1cqw);opacity:.85}
.cin-streams{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cin-streams .flow{fill:none;stroke:rgba(110,200,255,.55);stroke-width:2.4;stroke-dasharray:6 16;filter:drop-shadow(0 0 5px rgba(90,190,255,.9));animation:cinflow 2.4s linear infinite;opacity:.55}
.cin-streams .flow.working{stroke:#7fe7ff;opacity:1;stroke-width:3.2;animation-duration:1s}.cin-streams .flow.awaiting{stroke:#ffc233;opacity:1;stroke-width:3.2;animation-duration:1.6s}.cin-streams .flow.error{stroke:#ff6a5a;opacity:1;stroke-width:3.2}
.cin-hot{position:absolute;box-sizing:border-box;padding:0;border:0;border-radius:14px;background:transparent;cursor:pointer;transition:background .25s,box-shadow .25s}
.cin-hot .cb{position:absolute;width:2.2cqw;height:2.2cqw;border:0 solid rgba(130,210,255,.0);transition:border-color .25s}.cin-hot .tl{left:0;top:0;border-width:2px 0 0 2px;border-top-left-radius:12px}.cin-hot .tr{right:0;top:0;border-width:2px 2px 0 0;border-top-right-radius:12px}.cin-hot .bl{left:0;bottom:0;border-width:0 0 2px 2px;border-bottom-left-radius:12px}.cin-hot .br{right:0;bottom:0;border-width:0 2px 2px 0;border-bottom-right-radius:12px}
.cin-hot:hover,.cin-hot.sel{background:rgba(80,160,255,.07)}.cin-hot:hover .cb,.cin-hot.sel .cb{border-color:rgba(150,225,255,.95)}
.cin-hot.working{box-shadow:0 0 0 1px rgba(110,220,255,.5),0 0 34px 4px rgba(80,200,255,.35) inset;animation:cinpulse 2s ease-in-out infinite}.cin-hot.working .cb{border-color:#7fe7ff}
.cin-hot.awaiting{box-shadow:0 0 0 1px rgba(255,200,80,.7),0 0 38px 6px rgba(255,190,60,.38) inset;animation:cinpulse 1.5s ease-in-out infinite}.cin-hot.awaiting .cb{border-color:#ffc233}
.cin-hot.error{box-shadow:0 0 0 1px rgba(255,110,90,.8),0 0 38px 6px rgba(255,90,70,.4) inset;animation:cinpulse 1s ease-in-out infinite}.cin-hot.error .cb{border-color:#ff6a5a}
.cin-chip{position:absolute;display:flex;gap:6px;align-items:center;z-index:5;pointer-events:none}.cin-chip em{font:800 max(8px,.8cqw)/1 system-ui,sans-serif;letter-spacing:.12em;font-style:normal;padding:.35cqw .8cqw;border-radius:999px;background:rgba(8,20,64,.85);color:#9fb3d9;border:1px solid rgba(130,170,255,.5);backdrop-filter:blur(4px)}.cin-chip em.on{color:#7ff0b4;border-color:rgba(90,230,150,.7);box-shadow:0 0 10px rgba(80,230,150,.4)}
.cin-chip strong{font:800 max(9px,.9cqw)/1 system-ui,sans-serif;padding:.35cqw .8cqw;border-radius:999px;background:#2a1a00;color:#ffd37a;border:1px solid #c9964a;box-shadow:0 0 12px rgba(255,190,70,.6);animation:cinblink 1.2s ease-in-out infinite}.cin-chip strong.bad{background:#3a0a0a;color:#ff9a8a;border-color:#ff6a5a}
.cin-core{position:absolute;width:15cqw;height:15cqw;transform:translate(-50%,-50%);pointer-events:none;z-index:4}.cin-core i{position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(130,220,255,.0)}.cin-core span{position:absolute;left:50%;bottom:-1.4cqw;transform:translateX(-50%);font:800 max(9px,.95cqw)/1 system-ui,sans-serif;letter-spacing:.24em;color:#bff3ff;text-shadow:0 0 12px #5ac8ff;padding:.3cqw .9cqw;border-radius:999px;background:rgba(6,20,70,.7);border:1px solid rgba(110,200,255,.5)}
.cin-core i:nth-child(1){inset:6%;border-color:rgba(130,220,255,.45);animation:cinorbit 16s linear infinite;border-style:dashed}.cin-core i:nth-child(2){inset:-6%;border-color:rgba(255,211,122,.4);transform:rotate(65deg) scaleY(.32);animation:cinorbit2 20s linear infinite}.cin-core i:nth-child(3){inset:0;border-color:rgba(130,230,255,.0)}
.cin-core.hot i:nth-child(3){animation:cinripple 1.8s ease-out 2}
.cin-steam{position:absolute;width:1.4cqw;height:3cqw;pointer-events:none}.cin-steam i{position:absolute;bottom:0;left:50%;width:.7cqw;height:.7cqw;border-radius:50%;background:rgba(255,255,255,.55);filter:blur(3px);animation:cinsteam 3.4s ease-out infinite}.cin-steam i:nth-child(2){animation-delay:1.1s;left:30%}.cin-steam i:nth-child(3){animation-delay:2.2s;left:70%}
.cin-bubble{position:absolute;transform:translateX(-50%);max-width:16cqw;padding:.45cqw .9cqw;border-radius:12px;background:rgba(255,255,255,.94);color:#14224a;font:500 max(9px,.95cqw)/1.3 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);animation:cinpop .45s ease-out;pointer-events:none;z-index:6}.cin-bubble b{color:#2f6df6}
.cin-motes{position:absolute;inset:0;pointer-events:none;overflow:hidden}.cin-motes i{position:absolute;border-radius:50%;background:radial-gradient(circle,#bff3ff,transparent);opacity:0;animation:cinmote 11s ease-in-out infinite}
.cin-note{position:absolute;left:.8cqw;bottom:.6cqw;font:500 max(8px,.8cqw)/1 system-ui,sans-serif;color:rgba(190,210,255,.8);background:rgba(4,10,34,.6);padding:.3cqw .8cqw;border-radius:999px;border:1px solid rgba(130,170,255,.3);pointer-events:none}
@keyframes cinkb{from{transform:scale(1.0)}to{transform:scale(1.045) translate(-.6%,-.4%)}}@keyframes cinbloom{50%{opacity:.82}}@keyframes cinscan{to{top:110%}}@keyframes cinblink{50%{opacity:.45}}@keyframes cinflow{to{stroke-dashoffset:-44}}
@keyframes cinpulse{50%{box-shadow:0 0 0 1px rgba(255,255,255,.35),0 0 54px 10px rgba(120,200,255,.5) inset}}@keyframes cinorbit{to{transform:rotate(360deg)}}@keyframes cinorbit2{to{transform:rotate(425deg) scaleY(.32)}}@keyframes cinripple{from{transform:scale(.6);opacity:.9;border-color:rgba(160,235,255,.9)}to{transform:scale(1.7);opacity:0;border-color:rgba(160,235,255,0)}}
@keyframes cinsteam{0%{transform:translateY(0) scale(.6);opacity:0}25%{opacity:.7}100%{transform:translateY(-3cqw) scale(1.6);opacity:0}}@keyframes cinpop{from{transform:translateX(-50%) scale(.6);opacity:0}}@keyframes cinmote{0%,100%{opacity:0;transform:translateY(0)}40%{opacity:.8}70%{opacity:.5;transform:translateY(-3cqw)}}
@media (prefers-reduced-motion:reduce){.cin *,.cin-art{animation:none!important}}
`;
