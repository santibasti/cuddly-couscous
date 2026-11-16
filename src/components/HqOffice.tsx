// The animated headquarters: nine rooms (seven departments, the Chief of Staff's hub and the café) with the agents moving between them.
// Everything the characters do comes from agentState() / agentPos() in lib/hq.ts, i.e. from real events (or the labelled demo script). Idle motion is CSS only, never an AI call.
import { useEffect, useRef, useState } from 'react';
import { AGENTS, DEPTS, STATE_LABEL, agentPos, agentState, cafeLine, deskPos, hash, inCafe, type AgentDef, type AgentState, type AgentView, type HqEvent } from '@/lib/hq';

function Avatar({ a, state, moving }: { a: AgentDef; state: AgentState; moving: boolean }) {
  return (
    <svg className={`av ${moving ? 'walk' : ''}`} viewBox="0 0 40 58" width="100%" aria-hidden>
      <ellipse cx="20" cy="55" rx="11" ry="2.6" fill="rgba(0,0,0,.35)" />
      <rect className="leg l" x="13" y="40" width="5.5" height="14" rx="2.5" fill="#22304f" /><rect className="leg r" x="21.5" y="40" width="5.5" height="14" rx="2.5" fill="#22304f" />
      <rect className="arm l" x="5" y="24" width="5.5" height="15" rx="2.7" fill={a.shirt} /><rect className="arm r" x="29.5" y="24" width="5.5" height="15" rx="2.7" fill={a.shirt} />
      <rect x="10" y="22" width="20" height="21" rx="6" fill={a.shirt} /><rect x="10" y="22" width="20" height="5" rx="2.5" fill="rgba(255,255,255,.18)" />
      <circle cx="20" cy="14" r="9.5" fill={a.skin} />
      <path d="M10 13.5a10 10 0 0 1 20 0q-10-6-20 0z" fill={a.hair} />
      <g className="eyes"><circle cx="16.3" cy="15" r="1.3" fill="#1b1b1b" /><circle cx="23.7" cy="15" r="1.3" fill="#1b1b1b" /></g>
      {state === 'error' || state === 'blocked' ? <path d="M16 20q4-3 8 0" stroke="#1b1b1b" strokeWidth="1.2" fill="none" /> : <path d="M16.5 19.5q3.5 3 7 0" stroke="#1b1b1b" strokeWidth="1.2" fill="none" />}
      {a.key === 'jarvis' && <circle cx="20" cy="32" r="3.4" fill="#9fe7ff" className="core" />}
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

export function HqOffice({ events, now, selected, onPick, still, onRoom }: { events: HqEvent[]; now: number; selected: string | null; onPick: (k: string) => void; still: boolean; onRoom?: (dept: string) => void }) {
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
            {d.key === 'cafe' && <div className="table"><span /><span /></div>}
            {d.key === 'hub' && <div className="ring" />}
            {d.key !== 'cafe' && d.key !== 'hub' && <div className="desks">{mates.map((a) => { const p = deskPos(a.key); return <i key={a.key} style={{ left: `${((p.x - d.x) / d.w) * 100}%`, top: `${((p.y - d.y) / d.h) * 100 - 6}%` }} />; })}</div>}
          </div>
        );
      })}
      {packets.map((e) => { const a = deskPos(e.agent), b = deskPos(e.to_agent!); return <span key={`p${e.id}`} className="hq-pkt" style={{ ['--x0' as string]: `${a.x}%`, ['--y0' as string]: `${a.y}%`, ['--x1' as string]: `${b.x}%`, ['--y1' as string]: `${b.y}%` }} />; })}
      {AGENTS.map((a) => <Agent key={a.key} a={a} view={views[a.key]} now={now} selected={selected === a.key} onPick={() => onPick(a.key)} still={still} />)}
    </div>
  );
}

const CSS = `
.hq-scene{position:relative;container-type:inline-size;width:100%;aspect-ratio:16/11;min-height:380px;border-radius:16px;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,#0e2a6b 0,#08163d 55%,#040b22 100%);border:1px solid rgba(120,160,255,.25);box-shadow:0 0 40px rgba(40,90,255,.15) inset;--u:clamp(26px,3.3cqw,50px)}
.hq-scene:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(120,160,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,255,.06) 1px,transparent 1px);background-size:5% 8%;pointer-events:none}
.hq-room{position:absolute;box-sizing:border-box;border:1px solid rgba(130,170,255,.28);border-radius:12px;background:linear-gradient(180deg,rgba(20,45,120,.45),rgba(10,24,70,.35));cursor:pointer}
.hq-room:hover{border-color:rgba(180,210,255,.7)}
.hq-room .hd{display:flex;justify-content:space-between;gap:6px;align-items:center;padding:.5cqw .9cqw;font:600 max(10px,1.05cqw)/1.2 system-ui,sans-serif;color:#cfe0ff;letter-spacing:.04em;text-transform:uppercase}
.hq-room .hd em{font-style:normal;font-size:.85em;padding:1px 6px;border-radius:999px;background:rgba(150,170,210,.18);color:#9fb3d9;white-space:nowrap}
.hq-room .hd em.on{background:rgba(60,220,140,.18);color:#7ff0b4}
.r-creative{border-color:rgba(212,160,23,.4)}.r-hub{border-color:rgba(120,200,255,.6);background:radial-gradient(circle at 50% 60%,rgba(40,110,255,.35),rgba(10,24,70,.4) 70%)}
.hq-room .ring{position:absolute;left:50%;top:60%;width:34%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:2px dashed rgba(150,210,255,.5);animation:hqspin 18s linear infinite}
.hq-room .desks i{position:absolute;width:5.2cqw;height:2cqw;transform:translate(-50%,0);border-radius:6px;background:linear-gradient(#8a6a46,#5a4128);opacity:.9;z-index:2;pointer-events:none;box-shadow:0 3px 6px rgba(0,0,0,.35)}
.hq-room .table{position:absolute;left:50%;top:70%;width:11cqw;height:5cqw;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(#8a5a2b,#5b3a1a);box-shadow:0 0 14px rgba(255,190,90,.25)}
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
.hq-ag .scr{position:absolute;top:-34%;left:50%;transform:translateX(-50%);width:62%;height:26%;border-radius:4px;background:#0b1f4a;border:1px solid #3f78ff;box-shadow:0 0 10px rgba(60,130,255,.7);display:flex;flex-direction:column;gap:2px;padding:3px;overflow:hidden}
.hq-ag .scr i{display:block;height:2px;border-radius:2px;background:#7fd0ff;animation:hqtype 1.1s ease-in-out infinite}.hq-ag .scr i:nth-child(2){animation-delay:.25s;width:70%}.hq-ag .scr i:nth-child(3){animation-delay:.5s;width:85%}
.hq-ag.s-working .arm.l{transform-origin:7px 26px;animation:hqtypel .35s ease-in-out infinite}.hq-ag.s-working .arm.r{transform-origin:33px 26px;animation:hqtyper .35s ease-in-out infinite .1s}
.hq-ag.s-received .av-wrap{animation:hqhop .5s ease-in-out infinite}.hq-ag.s-done .av-wrap{animation:hqcheer .6s ease-in-out 3}
.hq-ag.s-error .av-wrap{animation:hqshake .45s ease-in-out infinite}.hq-ag.s-awaiting .av-wrap{animation:none}
.hq-ag.s-social .av-wrap{animation:hqsway 2.8s ease-in-out infinite}.hq-ag.s-coordinating .av-wrap{animation:hqhop .8s ease-in-out infinite}
.hq-ag.moving .av-wrap{animation:hqwalk .32s ease-in-out infinite}
.av .eyes{animation:hqblink 5s infinite;transform-origin:20px 15px}.av.walk .leg.l{animation:hqleg .32s ease-in-out infinite}.av.walk .leg.r{animation:hqleg .32s ease-in-out infinite reverse}.av .core{animation:hqpulse 1.6s ease-in-out infinite}
.hq-pkt{position:absolute;width:1.3cqw;height:1.3cqw;border-radius:50%;background:#ffd37a;box-shadow:0 0 12px 3px rgba(255,211,122,.8);transform:translate(-50%,-50%);z-index:4;animation:hqpkt 3.2s ease-in-out forwards;pointer-events:none}
@keyframes hqpkt{from{left:var(--x0);top:var(--y0);opacity:1}85%{opacity:1}to{left:var(--x1);top:var(--y1);opacity:0}}
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
