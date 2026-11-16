// The animated headquarters: nine rooms (seven departments, the Chief of Staff's hub and the café) with the agents moving between them.
// Everything the characters do comes from agentState() / agentPos() in lib/hq.ts, i.e. from real events (or the labelled demo script). Idle motion is CSS only, never an AI call.
import { useEffect, useRef, useState } from 'react';
import { AGENTS, DEPTS, STATE_LABEL, agentPos, agentState, cafeLine, deskPos, hash, inCafe, type AgentDef, type AgentState, type AgentView, type DeptKey, type HqEvent, type Kpi } from '@/lib/hq';

const EYE: Partial<Record<AgentState, string>> = { error: '#ff5a5a', blocked: '#ff5a5a', awaiting: '#ffc233', done: '#5dff9c', working: '#7fe7ff', received: '#7fe7ff', coordinating: '#a98bff' };
function Avatar({ a, state, moving }: { a: AgentDef; state: AgentState; moving: boolean }) {
  const eye = EYE[state] ?? a.shirt;
  return (
    <svg className={`av ${moving ? 'walk' : ''}`} viewBox="0 0 40 58" width="100%" aria-hidden>
      <defs><linearGradient id={`bd-${a.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#b9c7e3" /></linearGradient></defs>
      <ellipse cx="20" cy="55.5" rx="11" ry="2.4" fill="rgba(0,0,0,.4)" />
      <rect className="leg l" x="13" y="41" width="5.8" height="13" rx="2.6" fill="#8fa2c8" /><rect className="leg r" x="21.2" y="41" width="5.8" height="13" rx="2.6" fill="#8fa2c8" />
      <rect className="arm l" x="4.5" y="25" width="5.5" height="15" rx="2.7" fill={`url(#bd-${a.key})`} stroke="#8fa2c8" strokeWidth=".6" /><rect className="arm r" x="30" y="25" width="5.5" height="15" rx="2.7" fill={`url(#bd-${a.key})`} stroke="#8fa2c8" strokeWidth=".6" />
      <rect x="10" y="23" width="20" height="21" rx="7" fill={`url(#bd-${a.key})`} stroke="#8fa2c8" strokeWidth=".6" />
      <rect x="14" y="28" width="12" height="9" rx="3" fill="#0b1b45" /><text x="20" y="35" textAnchor="middle" fontSize="6.4" fontWeight="800" fill={a.shirt} fontFamily="system-ui,sans-serif">AI</text>
      <line x1="20" y1="3.5" x2="20" y2="0.5" stroke="#8fa2c8" strokeWidth="1" /><circle className="ant" cx="20" cy="1.2" r="1.6" fill={eye} />
      <rect x="8" y="3.5" width="24" height="19" rx="8" fill={`url(#bd-${a.key})`} stroke="#8fa2c8" strokeWidth=".6" />
      <rect x="5.6" y="10" width="3" height="7" rx="1.5" fill="#8fa2c8" /><rect x="31.4" y="10" width="3" height="7" rx="1.5" fill="#8fa2c8" />
      <rect x="11.5" y="8" width="17" height="10.5" rx="5" fill="#0b1b45" />
      <g className="eyes"><circle cx="16.5" cy="13.2" r="2.1" fill={eye} /><circle cx="23.5" cy="13.2" r="2.1" fill={eye} /></g>
      {state === 'error' || state === 'blocked' ? <path d="M17 16.4q3-1.8 6 0" stroke={eye} strokeWidth="1" fill="none" /> : <path d="M17.3 15.9q2.7 2 5.4 0" stroke={eye} strokeWidth="1" fill="none" />}
    </svg>
  );
}

const BADGE: Partial<Record<AgentState, string>> = { received: '🔔', awaiting: '⏸', done: '✅', error: '⚠️', blocked: '⛔', working: '' };

function Agent({ a, view, now, selected, onPick, still }: { a: AgentDef; view: AgentView; now: number; selected: boolean; onPick: () => void; still: boolean }) {
  const pos = agentPos(a.key, view, now); const prev = useRef(pos); const [mv, setMv] = useState(false);
  useEffect(() => {
    if (Math.abs(prev.current.x - pos.x) + Math.abs(prev.current.y - pos.y) > 0.4) { prev.current = pos; setMv(true); const t = setTimeout(() => setMv(false), 2600); return () => clearTimeout(t); }
  }, [pos.x, pos.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const atCafe = view.state === 'idle' && a.key !== 'jarvis' && inCafe(a.key, now);
  const state: AgentState = atCafe ? 'social' : view.state;
  const talk = atCafe && hash(a.key + Math.floor(now / 15_000)) % 6 === 0;
  return (
    <button type="button" className={`hq-ag s-${state} ${mv && !still ? 'moving' : ''} ${selected ? 'sel' : ''} ${a.live ? '' : 'planned'} ${a.key === 'jarvis' ? 'boss' : ''}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }} onClick={onPick} aria-label={`${a.name}, ${a.role}: ${STATE_LABEL[state]}`}>
      {state === 'working' && <span className="scr"><i /><i /><i /></span>}
      {BADGE[state] ? <span className={`bdg b-${state}`}>{BADGE[state]}</span> : null}
      {talk && <span className="bub">{cafeLine(a.key, now)}</span>}
      {view.state === 'coordinating' && <span className="bub dots">…</span>}
      <span className="av-wrap"><Avatar a={a} state={state} moving={mv && !still} /></span>
      <span className="nm">{a.name}</span>
    </button>
  );
}

export function HqOffice({ events, now, selected, onPick, still, onRoom, kpis }: { events: HqEvent[]; now: number; selected: string | null; onPick: (k: string) => void; still: boolean; onRoom?: (dept: string) => void; kpis?: Partial<Record<DeptKey, Kpi[]>> }) {
  const views = Object.fromEntries(AGENTS.map((a) => [a.key, agentState(a.key, events, now)])) as Record<string, AgentView>;
  const packets = events.filter((e) => e.to_agent && now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) < 4000);
  const today = new Date(now).toISOString().slice(0, 10);
  return (
    <div className={`hq-scene ${still ? 'still' : ''}`}>
      <style>{CSS}</style>
      {DEPTS.map((d) => {
        const mates = AGENTS.filter((a) => a.dept === d.key); const live = mates.some((a) => a.live); const n = events.filter((e) => e.dept === d.key && e.at.slice(0, 10) === today && Date.parse(e.at) <= now).length;
        return (
          <div key={d.key} className={`hq-room r-${d.key}`} style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }} onClick={() => onRoom?.(d.key)}>
            <div className="hd"><span>{d.icon} {d.name}</span>{d.key !== 'cafe' && <em className={live ? 'on' : ''}>{live ? `LIVE${n ? ` · ${n} today` : ''}` : 'PLANNED'}</em>}</div>
            {d.key === 'cafe' && <><div className="table"><span /><span /></div><div className="counter">☕ AI CAFÉ <i>🥐</i><i>🍩</i></div></>}
            {d.key === 'hub' && <div className="globe"><div className="orb" /><div className="ring r1" /><div className="ring r2" /><b>AI</b></div>}
            {d.key === 'board' && <><div className="oval" /><div className="holo"><i /><i /><i /><i /><i /></div></>}
            {!['cafe', 'hub', 'board'].includes(d.key) && <><div className="wall">{kpis?.[d.key] ? kpis[d.key]!.map((k) => <div key={k.label} className="kpi"><b>{k.value}</b><span>{k.label}</span></div>) : <div className="kpi off"><span>Not connected yet</span></div>}</div><div className="desks">{mates.map((a) => { const p = deskPos(a.key); return <i key={a.key} style={{ left: `${((p.x - d.x) / d.w) * 100}%`, top: `${((p.y - d.y) / d.h) * 100 - 5}%` }} />; })}</div></>}
            <span className="plant">🪴</span>
          </div>
        );
      })}
      {packets.map((e) => { const a = deskPos(e.agent), b = deskPos(e.to_agent!); return <span key={`p${e.id}`} className="hq-pkt" style={{ ['--x0' as string]: `${a.x}%`, ['--y0' as string]: `${a.y}%`, ['--x1' as string]: `${b.x}%`, ['--y1' as string]: `${b.y}%` }} />; })}
      {AGENTS.map((a) => <Agent key={a.key} a={a} view={views[a.key]} now={now} selected={selected === a.key} onPick={() => onPick(a.key)} still={still} />)}
    </div>
  );
}

const CSS = `
.hq-scene{position:relative;container-type:inline-size;width:100%;aspect-ratio:16/12;min-height:400px;border-radius:16px;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#0e2a6b 0,#08163d 55%,#040b22 100%);border:1px solid rgba(120,160,255,.25);box-shadow:0 0 40px rgba(40,90,255,.15) inset;--u:clamp(30px,3.7cqw,58px)}
.hq-scene:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(120,160,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,255,.06) 1px,transparent 1px);background-size:5% 8%;pointer-events:none}
.hq-room{position:absolute;box-sizing:border-box;border:1px solid rgba(130,170,255,.28);border-radius:12px;background:linear-gradient(180deg,rgba(20,45,120,.45),rgba(10,24,70,.35));cursor:pointer}
.hq-room:hover{border-color:rgba(180,210,255,.7)}
.hq-room .hd{display:flex;justify-content:space-between;gap:6px;align-items:center;padding:.5cqw .9cqw;font:600 max(10px,1.05cqw)/1.2 system-ui,sans-serif;color:#cfe0ff;letter-spacing:.04em;text-transform:uppercase}
.hq-room .hd em{font-style:normal;font-size:.85em;padding:1px 6px;border-radius:999px;background:rgba(150,170,210,.18);color:#9fb3d9;white-space:nowrap}
.hq-room .hd em.on{background:rgba(60,220,140,.18);color:#7ff0b4}
.r-creative{border-color:rgba(212,160,23,.4)}.r-hub{border-color:rgba(120,200,255,.6);background:radial-gradient(circle at 50% 60%,rgba(40,110,255,.35),rgba(10,24,70,.4) 70%)}
.hq-room .wall{position:absolute;left:5%;right:5%;top:17%;height:25%;display:flex;gap:2.5%;align-items:stretch;padding:2% 3%;border-radius:8px;background:linear-gradient(180deg,rgba(8,30,90,.9),rgba(8,22,64,.9));border:1px solid rgba(90,160,255,.55);box-shadow:0 0 14px rgba(60,130,255,.35),inset 0 0 12px rgba(60,130,255,.2)}
.hq-room .kpi{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:0}.hq-room .kpi b{font:800 max(12px,1.9cqw)/1 system-ui,sans-serif;color:#7fe7ff;text-shadow:0 0 8px rgba(80,200,255,.6)}.hq-room .kpi span{font:500 max(8px,.85cqw)/1.15 system-ui,sans-serif;color:#9fb3d9;text-align:center;margin-top:2px}.hq-room .kpi.off span{font-style:italic;opacity:.8}
.hq-room .plant{position:absolute;right:3%;bottom:1%;font-size:max(14px,2cqw);opacity:.9;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));pointer-events:none}
.hq-room .globe{position:absolute;left:50%;top:44%;width:42%;aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none}.hq-room .globe .orb{position:absolute;inset:14%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bff3ff,#2f8bff 45%,#0a2a8f 100%);box-shadow:0 0 28px 8px rgba(70,160,255,.7),inset 0 0 24px rgba(180,240,255,.6);animation:hqglow 3s ease-in-out infinite}
.hq-room .globe .ring{position:absolute;inset:3%;border-radius:50%;border:1.5px solid rgba(150,220,255,.55)}.hq-room .globe .r1{animation:hqspin 14s linear infinite;border-style:dashed}.hq-room .globe .r2{inset:-4%;border-color:rgba(255,211,122,.55);transform:rotate(60deg) scaleY(.35);animation:none}
.hq-room .globe b{position:absolute;inset:0;display:grid;place-items:center;font:900 max(16px,3.2cqw)/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 14px #7fd0ff,0 0 4px #1b6bff}
.hq-room .counter{position:absolute;left:8%;right:8%;top:20%;padding:3px 8px;border-radius:8px;background:linear-gradient(#5b3a1a,#3d2610);border:1px solid #c9964a;color:#ffd9a0;font:700 max(9px,1cqw)/1.2 system-ui,sans-serif;letter-spacing:.08em;text-align:center;box-shadow:0 0 14px rgba(255,180,80,.3)}.hq-room .counter i{font-style:normal;margin-left:6px}
.hq-room .oval{position:absolute;left:50%;top:84%;width:62%;height:44%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,#1a3e8c,#0c2257 70%);border:2px solid #4f8bff;box-shadow:0 0 20px rgba(60,130,255,.5)}
.hq-room .holo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:4%;align-items:flex-end;height:22%;width:34%}.hq-room .holo i{flex:1;background:linear-gradient(#7fe7ff,rgba(80,150,255,.3));border-radius:2px;animation:hqbars 2.6s ease-in-out infinite;transform-origin:bottom}.hq-room .holo i:nth-child(2){animation-delay:.3s}.hq-room .holo i:nth-child(3){animation-delay:.6s}.hq-room .holo i:nth-child(4){animation-delay:.9s}.hq-room .holo i:nth-child(5){animation-delay:1.2s}
.hq-room .desks i{position:absolute;width:5.2cqw;height:2cqw;transform:translate(-50%,0);border-radius:6px;background:linear-gradient(#8a6a46,#5a4128);opacity:.9;z-index:2;pointer-events:none;box-shadow:0 3px 6px rgba(0,0,0,.35)}
.hq-room .table{position:absolute;left:50%;top:74%;width:10cqw;height:4.5cqw;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(#8a5a2b,#5b3a1a);box-shadow:0 0 14px rgba(255,190,90,.25)}
.hq-room .table span{position:absolute;top:-14%;width:1.1cqw;height:1.1cqw;border-radius:50%;background:#fff;opacity:.85}.hq-room .table span:first-child{left:25%}.hq-room .table span:last-child{right:25%}
.hq-ag{position:absolute;transform:translate(-50%,-92%);width:var(--u);padding:0;border:0;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;transition:left 2.4s ease-in-out,top 2.4s ease-in-out;z-index:3;font:inherit;color:inherit}
.hq-ag .av-wrap{display:block;width:100%;transform-origin:50% 100%;animation:hqbreathe 3.4s ease-in-out infinite}
.hq-ag.planned .av-wrap{opacity:.62;filter:saturate(.7)}
.hq-ag .nm{margin-top:-2px;font:600 max(9px,.95cqw)/1 system-ui,sans-serif;color:#e8f0ff;text-shadow:0 1px 3px #000;white-space:nowrap}
.hq-ag.sel .nm{color:#ffd37a}.hq-ag.sel .av-wrap{filter:drop-shadow(0 0 6px #ffd37a)}
.hq-ag.boss .av-wrap{filter:drop-shadow(0 0 8px #7fd0ff)}
.hq-ag .bdg{position:absolute;top:-14%;right:-14%;font-size:max(12px,1.5cqw);animation:hqpop .5s ease-out}
.hq-ag .b-awaiting{animation:hqpulse 1.2s ease-in-out infinite;filter:drop-shadow(0 0 5px #ffc233)}.hq-ag .b-error{animation:hqshake .5s ease-in-out infinite}.hq-ag .b-received{animation:hqring .6s ease-in-out infinite}
.hq-ag .bub{position:absolute;bottom:108%;left:50%;transform:translateX(-50%);max-width:13cqw;width:max-content;padding:2px 7px;border-radius:10px;background:#fff;color:#16254d;font:500 max(9px,.95cqw)/1.25 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);animation:hqpop .4s ease-out;white-space:normal;text-align:center;z-index:5}
.hq-ag .bub.dots{background:#1b2f6b;color:#9fd0ff;letter-spacing:.2em}
.hq-ag .scr{position:absolute;top:-30%;left:50%;transform:translateX(-50%);width:62%;height:26%;border-radius:4px;background:#0b1f4a;border:1px solid #3f78ff;box-shadow:0 0 10px rgba(60,130,255,.7);display:flex;flex-direction:column;gap:2px;padding:3px;overflow:hidden}
.hq-ag .scr i{display:block;height:2px;border-radius:2px;background:#7fd0ff;animation:hqtype 1.1s ease-in-out infinite}.hq-ag .scr i:nth-child(2){animation-delay:.25s;width:70%}.hq-ag .scr i:nth-child(3){animation-delay:.5s;width:85%}
.hq-ag.s-working .arm.l{transform-origin:7px 26px;animation:hqtypel .35s ease-in-out infinite}.hq-ag.s-working .arm.r{transform-origin:33px 26px;animation:hqtyper .35s ease-in-out infinite .1s}
.hq-ag.s-received .av-wrap{animation:hqhop .5s ease-in-out infinite}.hq-ag.s-done .av-wrap{animation:hqcheer .6s ease-in-out 3}
.hq-ag.s-error .av-wrap{animation:hqshake .45s ease-in-out infinite}.hq-ag.s-awaiting .av-wrap{animation:none}
.hq-ag.s-social .av-wrap{animation:hqsway 2.8s ease-in-out infinite}.hq-ag.s-coordinating .av-wrap{animation:hqhop .8s ease-in-out infinite}
.hq-ag.moving .av-wrap{animation:hqwalk .32s ease-in-out infinite}
.av .eyes{animation:hqblink 5s infinite;transform-origin:20px 15px}.av.walk .leg.l{animation:hqleg .32s ease-in-out infinite}.av.walk .leg.r{animation:hqleg .32s ease-in-out infinite reverse}.av .core{animation:hqpulse 1.6s ease-in-out infinite}
.hq-pkt{position:absolute;width:1.3cqw;height:1.3cqw;border-radius:50%;background:#ffd37a;box-shadow:0 0 12px 3px rgba(255,211,122,.8);transform:translate(-50%,-50%);z-index:4;animation:hqpkt 3.2s ease-in-out forwards;pointer-events:none}
@keyframes hqpkt{from{left:var(--x0);top:var(--y0);opacity:1}85%{opacity:1}to{left:var(--x1);top:var(--y1);opacity:0}}
@keyframes hqglow{50%{box-shadow:0 0 40px 14px rgba(90,180,255,.85),inset 0 0 26px rgba(200,245,255,.7)}}@keyframes hqbars{50%{transform:scaleY(.45)}}
@keyframes hqspin{to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes hqbreathe{50%{transform:scale(1,1.03)}}@keyframes hqsway{50%{transform:rotate(3deg) translateY(-2px)}}@keyframes hqwalk{50%{transform:translateY(-6%) rotate(2deg)}}
@keyframes hqhop{50%{transform:translateY(-10%)}}@keyframes hqcheer{50%{transform:translateY(-18%) scale(1.08)}}@keyframes hqshake{25%{transform:translateX(-3%)}75%{transform:translateX(3%)}}
@keyframes hqpulse{50%{opacity:.55}}@keyframes hqpop{from{transform:scale(0)}to{transform:scale(1)}}@keyframes hqring{25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}
@keyframes hqtype{50%{transform:translateX(30%);opacity:.4}}@keyframes hqtypel{50%{transform:rotate(-14deg)}}@keyframes hqtyper{50%{transform:rotate(14deg)}}
@keyframes hqleg{50%{transform:translateY(-8%)}}@keyframes hqblink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.hq-scene.still *,.hq-scene.still *:before{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){.hq-scene *,.hq-scene *:before{animation:none!important}.hq-ag{transition:none}}
@media (max-width:640px){.hq-scene{aspect-ratio:3/4;min-height:430px;--u:clamp(24px,8cqw,38px)}.hq-room .hd em{display:none}.hq-room .hd{font-size:8px;letter-spacing:0}.hq-ag .nm{font-size:8px}}
`;
