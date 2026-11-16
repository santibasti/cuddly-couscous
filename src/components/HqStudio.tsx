// The Studio: a coded 2.5D glass-walled office. Nine rooms (seven departments, the JARVIS command centre, the AI café) with real desks, chairs and glowing monitors, glass corridors between them,
// and the miniature robots walking in it. A department that has no real feed yet is dimmed and marked PLANNED; a monitor only glows and scrolls while its agent really has work (from real events).
// The camera (Motion) can zoom into a room; everything else is CSS/SVG, so it stays light.
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AGENTS, DEPTS, agentByKey, type AgentView, type DeptKey, type HqEvent, type Kpi } from '@/lib/hq';
import { STUDIO, routeBetween } from '@/lib/hqsim';
import { HqRobots } from '@/components/HqRobots';
import { deptLive } from '@/components/HqCinematic';

const MON: Partial<Record<string, string>> = { email: 'inbox', creative: 'photo', ads: 'chart', desk: 'chat', booking: 'calendar', hr: 'check' };
const WIN: Record<string, string> = { email: 'INBOX · DRAFTS', creative: 'PHOTO · VIDEO', ads: 'CAMPAIGNS', desk: 'MESSAGES', booking: 'BOOKINGS · QUOTES', hr: 'PEOPLE', board: 'BOARD MEETINGS' };
const CAMERA_ASPECT = 16 / 12; const DESIGN_W = 1200, DESIGN_H = 900;

export interface StudioProps { demo: boolean; events: HqEvent[]; views: Record<string, AgentView>; kpis: Partial<Record<DeptKey, Kpi[]>>; now: number; focus: string; selectedAgent: string; still: boolean; hold: boolean; mobile: boolean; inset?: number; onPickDept: (d: string) => void; onPickAgent: (k: string) => void }

export function HqStudio({ demo, events, views, kpis, now, focus, selectedAgent, still, hold, mobile, inset = 0, onPickDept, onPickAgent }: StudioProps) {
  const box = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ w: 1200, h: 900 }); const reduce = useReducedMotion();
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const fd = DEPTS.find((d) => d.key === focus);
  // The office is drawn on a fixed 1200 x 900 design canvas and the camera scales it to fit, so text and props look the same at every screen size.
  // Focused on a room, the camera zooms to it and leaves `inset` pixels free on the right for the slide-over panel.
  const f = size.w / DESIGN_W;
  const cam = (() => { if (!fd) return { s: f, x: 0, y: 0 }; const avail = Math.max(300, size.w - inset); const rx = (fd.x / 100) * DESIGN_W, ry = (fd.y / 100) * DESIGN_H, rw = (fd.w / 100) * DESIGN_W, rh = (fd.h / 100) * DESIGN_H;
    const s = Math.min((0.94 * avail) / rw, (0.94 * size.h) / rh, 3.2 * f); return { s, x: avail / 2 - (rx + rw / 2) * s, y: size.h / 2 - (ry + rh / 2) * s }; })();
  const today = new Date(now).toISOString().slice(0, 10);
  const trails = events.filter((e) => now - Date.parse(e.at) >= 0 && now - Date.parse(e.at) < 4200 && (e.to_agent || e.kind === 'start') && agentByKey(e.agent));
  const jarvisLast = events.filter((e) => e.agent === 'jarvis' && Date.parse(e.at) <= now).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const aspect = mobile && fd ? (fd.w * 16) / (fd.h * 12) : CAMERA_ASPECT;

  return (
    <div className="stu" ref={box} style={{ aspectRatio: String(aspect) }} role="group" aria-label="TOPMOP AI Headquarters office">
      <style>{CSS}</style>
      <motion.div className="stu-cam" initial={false} animate={{ scale: cam.s, x: cam.x, y: cam.y }} transition={reduce || still ? { duration: 0 } : { type: 'spring', stiffness: 80, damping: 22 }} style={{ transformOrigin: '0 0' }}>
        <div className="stu-floor" />
        {[33.5, 66.5].map((x) => <i key={`v${x}`} className="stu-cor v" style={{ left: `${x}%` }} />)}{[33, 66].map((y) => <i key={`h${y}`} className="stu-cor h" style={{ top: `${y}%` }} />)}

        {DEPTS.map((d) => {
          const mates = AGENTS.filter((a) => a.dept === d.key); const live = mates.some((a) => a.live); const L = deptLive(views, d.key); const k = kpis[d.key as DeptKey]; const n = events.filter((e) => e.dept === d.key && e.at.slice(0, 10) === today && Date.parse(e.at) <= now).length;
          const room = (
            <div className="rm-in">
              <div className="rm-hd"><span className="ic">{d.icon}</span><div><h2>{d.name}</h2><small>{d.blurb}</small></div>
                {d.key !== 'cafe' && <span className={`pill ${live ? 'live' : 'plan'} ${L.state}`}>{!live ? 'PLANNED' : L.state === 'awaiting' ? `WAITING ${L.awaiting}` : L.state === 'working' ? 'WORKING' : L.state === 'error' ? 'PROBLEM' : `LIVE${n ? ` · ${n}` : ''}`}</span>}
                {d.key === 'cafe' && <span className="pill ambient">AMBIENT</span>}</div>
              {d.key === 'hub' ? (
                <div className="hubstage"><div className="orb"><b>JARVIS</b><i /><i /></div><div className="hubmsg"><b>AI CHIEF OF STAFF</b><span>{jarvisLast ? jarvisLast.title : 'Watching every department.'}</span></div></div>
              ) : d.key === 'cafe' ? (
                <div className="cafestage"><div className="sign">☕ AI CAFÉ</div><div className="shelf"><i /><i /><i /><i /></div><div className="tbl a" /><div className="tbl b" /><div className="sofa l" /><div className="sofa r" /></div>
              ) : (
                <div className={`win ${live ? '' : 'dim'}`}>
                  <div className="gr"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="0,32 14,24 28,29 42,12 58,21 72,8 86,13 100,3" /></svg><span>{WIN[d.key]}</span></div>
                  <div className="kp"><em>{k ? (demo ? 'SAMPLE DATA' : 'LIVE DATA') : 'PLANNED'}</em>{k ? <div>{k.map((x) => <div key={x.label}><b>{x.value}</b><span>{x.label}</span></div>)}</div> : <div className="off">Not connected yet</div>}</div>
                </div>
              )}
              {d.key === 'board' && <div className="oval"><div className="holo"><i /><i /><i /><i /><i /></div></div>}
              <i className="plant p1" /><i className="plant p2" /><div className="rim" />
            </div>);
          return (
            <section key={d.key} className={`rm r-${d.key} ${live || d.key === 'cafe' || d.key === 'hub' ? '' : 'planned'} ${L.state} ${focus === d.key ? 'focus' : ''}`} style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }}>
              {d.key === 'cafe' ? room : <button type="button" className="rm-hit" aria-label={`${d.name}: ${live ? 'live' : 'planned'}. Open its work queue`} onClick={() => onPickDept(focus === d.key ? '' : d.key)} />}
              {d.key !== 'cafe' && room}
            </section>);
        })}

        {/* chairs and monitors sit behind the robots, desk tops in front of them (the robot sits behind its desk) */}
        {AGENTS.filter((a) => a.dept !== 'hub' && a.dept !== 'board').map((a) => { const p = STUDIO.seats[a.key]; const v = views[a.key]; const on = a.live && ['working', 'received', 'coordinating', 'done'].includes(v?.state ?? ''); const wait = v?.state === 'awaiting';
          return (<div key={`b-${a.key}`} className="stn back" style={{ left: `${p.x}%`, top: `${p.y}%` }}><i className="chair" /><i className={`mon v-${MON[a.dept] ?? 'chart'} ${on ? 'on' : wait ? 'wait' : a.live ? 'idle' : 'dim'}`} /></div>); })}
        {AGENTS.filter((a) => a.dept !== 'hub' && a.dept !== 'board').map((a) => { const p = STUDIO.seats[a.key]; return <div key={`f-${a.key}`} className="stn front" style={{ left: `${p.x}%`, top: `${p.y}%` }}><i className="desk" /></div>; })}

        <svg className="stu-trails" viewBox="0 0 160 120" preserveAspectRatio="none" aria-hidden>
          <defs><filter id="sg"><feGaussianBlur stdDeviation=".9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {trails.map((e) => { const from = STUDIO.seats[e.agent]; const toKey = e.to_agent ?? 'jarvis'; const to = STUDIO.seats[toKey]; if (!from || !to || toKey === e.agent) return null;
            const pts = routeBetween(e.agent, from, to, toKey, STUDIO); const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${(p.x * 1.6).toFixed(2)} ${(p.y * 1.2).toFixed(2)}`).join(' '); const col = e.kind === 'approval' ? '#ffc233' : e.kind === 'fail' ? '#ff6a5a' : '#7fe7ff';
            return (<g key={String(e.id)}><path d={d} className="trail" style={{ stroke: col }} /><circle r="1.5" fill={col} filter="url(#sg)"><animateMotion dur="2.2s" fill="freeze" path={d} /><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur="2.2s" fill="freeze" /></circle></g>); })}
        </svg>

        <HqRobots layout={STUDIO} views={views} onPickAgent={onPickAgent} focusDept={focus} still={still} hold={hold} selectedAgent={selectedAgent} />
      </motion.div>
    </div>
  );
}

const CSS = `
.stu{position:relative;width:100%;overflow:hidden;border-radius:16px;border:1px solid rgba(120,170,255,.3);background:radial-gradient(ellipse at 50% 20%,#0f2c63 0,#071638 48%,#030a1e 100%);box-shadow:0 0 50px rgba(40,100,255,.2),inset 0 0 60px rgba(30,90,200,.15)}
.stu-cam{position:absolute;left:0;top:0;width:1200px;height:900px;container-type:inline-size;will-change:transform}
.stu-floor{position:absolute;inset:0;background-image:linear-gradient(rgba(110,170,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(110,170,255,.05) 1px,transparent 1px);background-size:6.25% 8.33%;pointer-events:none}
.stu-cor{position:absolute;background:linear-gradient(90deg,transparent,rgba(110,210,255,.5),transparent);pointer-events:none;box-shadow:0 0 14px rgba(90,190,255,.55)}.stu-cor.v{top:0;bottom:0;width:.5%;transform:translateX(-50%)}.stu-cor.h{left:0;right:0;height:.7%;transform:translateY(-50%);background:linear-gradient(90deg,transparent,rgba(110,210,255,.5),transparent)}
.rm{position:absolute;box-sizing:border-box;border-radius:1.4cqw;border:1px solid rgba(120,185,255,.42);background:linear-gradient(172deg,rgba(18,58,108,.92),rgba(7,20,46,.94) 40%,rgba(3,12,28,.96));box-shadow:inset 0 1px rgba(150,220,255,.2),0 .8cqw 3cqw rgba(0,0,0,.28);overflow:hidden}
.rm:before{content:"";position:absolute;left:6%;right:6%;top:0;height:.35cqw;border-radius:50%;background:linear-gradient(90deg,transparent,#ffbf7c,#4cd5ff,transparent);box-shadow:0 0 1.4cqw #4cabf7,0 0 2.4cqw #de894c80;z-index:2}
.rm:after{content:"";position:absolute;left:-10%;right:-10%;top:46%;bottom:0;background:repeating-linear-gradient(0deg,transparent 0 1.7cqw,rgba(40,120,200,.12) 1.75cqw 1.85cqw),linear-gradient(0deg,rgba(60,150,190,.18),transparent 70%);transform:perspective(40cqw) rotateX(52deg);transform-origin:bottom;pointer-events:none}
.rm.planned{filter:saturate(.7)}.rm.awaiting{border-color:rgba(255,200,90,.9);box-shadow:inset 0 0 3cqw rgba(255,190,70,.22),0 0 2.4cqw rgba(255,190,70,.3)}.rm.working{border-color:rgba(110,230,255,.85);box-shadow:inset 0 0 3cqw rgba(80,200,255,.2),0 0 2cqw rgba(80,200,255,.26)}.rm.error{border-color:rgba(255,110,90,.9);box-shadow:0 0 2.4cqw rgba(255,90,70,.35)}.rm.focus{border-color:#fff}
.rm-hit{position:absolute;inset:0;z-index:3;border:0;background:transparent;cursor:pointer;border-radius:inherit}.rm-hit:hover{background:rgba(80,160,255,.06)}.rm-hit:focus-visible{outline:2px solid #92edff;outline-offset:-3px}
.rm-in{position:absolute;inset:0;pointer-events:none}
.rm-hd{display:flex;align-items:center;gap:.7cqw;padding:.55cqw .9cqw;height:3.6cqw;background:linear-gradient(90deg,rgba(20,50,92,.9),rgba(12,36,69,.55),transparent);border-bottom:1px solid rgba(65,125,165,.3)}
.rm-hd .ic{font-size:1.9cqw;filter:drop-shadow(0 0 .7cqw #2ea4f7)}.rm-hd h2{margin:0;font:850 max(9px,1.02cqw)/1.1 system-ui,sans-serif;letter-spacing:.06em;color:#e9f7ff;text-transform:uppercase}.rm-hd small{display:block;font:500 max(7px,.68cqw)/1.2 system-ui,sans-serif;color:#79a3c5;margin-top:.25cqw}
.pill{margin-left:auto;font:850 max(7px,.7cqw)/1 system-ui,sans-serif;letter-spacing:.12em;padding:.35cqw .6cqw;border-radius:.4cqw;white-space:nowrap}.pill.live{background:#063e39;color:#61f0b9;border:1px solid #208c72}.pill.plan{background:#223044;color:#98b0c6;border:1px solid #40516e}.pill.ambient{background:#3a2a10;color:#f3c27a;border:1px solid #8a6330}.pill.live.working{background:#122c57;color:#70d4ff;border-color:#396fa7}.pill.live.awaiting{background:#3a2a05;color:#ffd37a;border-color:#c9964a;animation:stub 1.2s ease-in-out infinite}.pill.live.error{background:#3a0f0f;color:#ff9a8a;border-color:#ff6a5a}
.win{position:absolute;left:4%;right:4%;top:19%;height:27%;border-radius:.7cqw;background:repeating-linear-gradient(90deg,rgba(58,126,196,.1) 0 .15cqw,transparent .15cqw 4.2cqw),linear-gradient(180deg,#0a1d39,#12304e);border:1px solid rgba(40,100,150,.6);box-shadow:inset 0 0 1.6cqw #133958,0 0 1.6cqw rgba(17,123,196,.22);display:flex;gap:2%;padding:.6cqw .9cqw;overflow:hidden}.win.dim{opacity:.75}
.win .gr{position:relative;flex:1;min-width:0;border-bottom:1px solid rgba(40,111,156,.4)}.win .gr svg{position:absolute;inset:0;width:100%;height:100%}.win .gr polyline{fill:none;stroke:#46ccff;stroke-width:1.6;stroke-linecap:round;stroke-dasharray:180;animation:studraw 4s ease-in-out infinite alternate;vector-effect:non-scaling-stroke}.win .gr span{position:absolute;left:0;top:0;font:700 max(7px,.7cqw)/1 system-ui,sans-serif;letter-spacing:.14em;color:#6aa6d4}
.win .kp{flex:none;min-width:42%;background:rgba(7,26,53,.85);border:1px solid rgba(45,109,163,.7);border-radius:.5cqw;padding:.45cqw .7cqw;display:flex;flex-direction:column;justify-content:center}.win .kp em{font:800 max(6.5px,.62cqw)/1 system-ui,sans-serif;letter-spacing:.16em;font-style:normal;color:#5dd7a0;margin-bottom:.25cqw}.win .kp>div{display:flex;gap:.9cqw;justify-content:space-around}.win .kp>div>div{display:flex;flex-direction:column;align-items:center}.win .kp b{font:800 max(11px,1.6cqw)/1 system-ui,sans-serif;color:#8ff0ff;text-shadow:0 0 .9cqw rgba(100,210,255,.8)}.win .kp span{font:500 max(6.5px,.62cqw)/1.15 system-ui,sans-serif;color:#9ab9d6;text-align:center}.win .kp .off{font:italic 500 max(8px,.85cqw)/1.2 system-ui,sans-serif;color:#9ab0c8;align-self:center}
.hubstage{position:absolute;left:0;right:0;top:3.6cqw;bottom:0;display:flex;flex-direction:column;align-items:center}.orb{position:relative;margin-top:1.3cqw;width:8.6cqw;height:8.6cqw;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 36% 30%,#7be8ff,#1f6fe0 42%,#0b2574 74%);box-shadow:0 0 1.8cqw #38adffbd,inset -1cqw -1.1cqw 2cqw #030d42,0 0 5cqw rgba(21,107,196,.55);animation:stufloat 3.6s ease-in-out infinite}.orb b{font:900 1.6cqw/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 1.2cqw #b1eaff;letter-spacing:.08em}.orb i{position:absolute;inset:-1.4cqw;border:1px solid rgba(63,210,255,.55);border-radius:50%;transform:rotateX(67deg) rotate(-20deg);animation:stuorbit 8s linear infinite}.orb i+i{inset:-2.2cqw;border-color:rgba(231,169,103,.5);transform:rotateY(67deg) rotate(35deg);animation-duration:12s;animation-direction:reverse}
.hubmsg{margin-top:2.6cqw;max-width:76%;text-align:center;padding:.55cqw .9cqw;border-radius:.6cqw;background:rgba(12,41,75,.85);border:1px solid rgba(38,128,191,.55)}.hubmsg b{display:block;font:850 max(8px,.9cqw)/1.2 system-ui,sans-serif;color:#f8fcff;letter-spacing:.1em}.hubmsg span{display:block;font:500 max(7px,.75cqw)/1.35 system-ui,sans-serif;color:#a6d9ef;margin-top:.2cqw}
.cafestage{position:absolute;left:0;right:0;top:3.6cqw;bottom:0}.cafestage .sign{position:absolute;left:50%;top:.8cqw;transform:translateX(-50%);font:800 max(9px,1.1cqw)/1 system-ui,sans-serif;letter-spacing:.22em;color:#ffd9a0;padding:.4cqw 1.2cqw;border:1px solid #c9964a;border-radius:.6cqw;background:linear-gradient(#5b3a1a,#3d2610);box-shadow:0 0 1.6cqw rgba(255,180,80,.4)}.cafestage .shelf{position:absolute;left:12%;right:12%;top:3.6cqw;height:2.4cqw;display:flex;gap:2%;align-items:flex-end}.cafestage .shelf i{flex:1;height:70%;border-radius:.3cqw;background:linear-gradient(#e8c38a,#8a5a2c);box-shadow:0 0 .8cqw rgba(255,190,100,.5);border:1px solid rgba(255,220,170,.4)}
.cafestage .tbl{position:absolute;width:7cqw;height:2.4cqw;border-radius:50%;background:linear-gradient(#c99a6b,#6c442e);border:.2cqw solid #efc9a3;box-shadow:0 1.2cqw #513c2a,0 1.4cqw 1.4cqw #0007}.cafestage .tbl.a{left:26%;top:58%}.cafestage .tbl.b{right:26%;top:58%}.cafestage .sofa{position:absolute;bottom:3%;width:9cqw;height:2.2cqw;border-radius:1cqw;background:linear-gradient(#3b5f95,#1d3361);box-shadow:0 0 1.2cqw rgba(60,130,255,.4)}.cafestage .sofa.l{left:6%}.cafestage .sofa.r{right:6%}
.oval{position:absolute;left:50%;top:62%;width:60%;height:24%;transform:translate(-50%,0);border-radius:50%;background:radial-gradient(ellipse,#1a3e8c,#0c2257 72%);border:.2cqw solid #4f8bff;box-shadow:0 0 2cqw rgba(60,130,255,.5)}.holo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:6%;align-items:flex-end;height:60%;width:50%}.holo i{flex:1;background:linear-gradient(#7fe7ff,rgba(80,150,255,.3));border-radius:2px;animation:stubars 2.6s ease-in-out infinite;transform-origin:bottom}.holo i:nth-child(2){animation-delay:.3s}.holo i:nth-child(3){animation-delay:.6s}.holo i:nth-child(4){animation-delay:.9s}.holo i:nth-child(5){animation-delay:1.2s}
.plant{position:absolute;bottom:2%;width:1.9cqw;height:2.6cqw;pointer-events:none;background:radial-gradient(circle at 30% 30%,#52c27a,#1d6b43 70%);border-radius:60% 40% 55% 45%;box-shadow:0 .9cqw 0 -.35cqw #6b4326}.plant.p1{right:3%}.plant.p2{left:2.5%;transform:scale(.8)}
.rim{position:absolute;left:12%;right:12%;bottom:0;height:.3cqw;background:linear-gradient(90deg,transparent,#2ab8ff,#edb373,transparent);box-shadow:0 0 1.3cqw #249af2}
.stn{position:absolute;pointer-events:none}.stn.back{z-index:5}.stn.front{z-index:9}
.stn .chair{position:absolute;left:0;top:0;width:2.5cqw;height:3cqw;transform:translate(-50%,-100%);border-radius:1.2cqw 1.2cqw .5cqw .5cqw;background:linear-gradient(#233a66,#101c38);border:1px solid rgba(100,160,230,.45)}
.stn .mon{position:absolute;left:0;top:0;width:5cqw;height:2.9cqw;transform:translate(-50%,-195%);border-radius:.5cqw;border:.2cqw solid #2a9fdb;background:linear-gradient(150deg,#123b70,#03162a);box-shadow:0 0 1.2cqw rgba(7,119,196,.5),inset 0 0 1.4cqw rgba(11,113,171,.35);overflow:hidden}
.stn .mon:before{content:"";position:absolute;inset:.45cqw;opacity:.9;background:repeating-linear-gradient(0deg,rgba(70,210,255,.55) 0 .16cqw,transparent .16cqw .52cqw)}
.mon.v-photo:before{background:linear-gradient(90deg,#3d8fd1 0 45%,transparent 45% 55%,#5ad0a0 55%);opacity:.8}.mon.v-chart:before{background:linear-gradient(135deg,transparent 40%,#46ccff 41% 46%,transparent 47%),repeating-linear-gradient(0deg,rgba(70,210,255,.25) 0 .16cqw,transparent .16cqw .6cqw)}.mon.v-chat:before{background:linear-gradient(90deg,rgba(90,200,255,.7) 0 55%,transparent 55%) 0 15%/100% 30% no-repeat,linear-gradient(90deg,transparent 40%,rgba(120,230,170,.7) 40%) 0 65%/100% 30% no-repeat}.mon.v-calendar:before{background:repeating-linear-gradient(90deg,rgba(80,210,255,.5) 0 .5cqw,transparent .5cqw .75cqw),repeating-linear-gradient(0deg,rgba(80,210,255,.3) 0 .4cqw,transparent .4cqw .62cqw)}.mon.v-check:before{background:repeating-linear-gradient(0deg,rgba(90,230,170,.6) 0 .3cqw,transparent .3cqw .62cqw)}
.mon.on:after,.mon.idle:after{content:"";position:absolute;left:0;right:0;height:30%;top:-30%;background:linear-gradient(180deg,transparent,rgba(140,230,255,.5),transparent);animation:stuscan 1.6s linear infinite}.mon.idle:after{animation-duration:6s;opacity:.4}.mon.on{border-color:#7fe7ff;box-shadow:0 0 1.8cqw rgba(110,230,255,.85),inset 0 0 1.4cqw rgba(60,190,255,.5)}.mon.on:before{animation:stublink .5s steps(2) infinite}.mon.wait{border-color:#ffc233;box-shadow:0 0 1.8cqw rgba(255,190,60,.75)}.mon.dim{opacity:.45;filter:grayscale(.6);border-color:#4c6a86;box-shadow:none}
.stn .desk{position:absolute;left:0;top:0;width:7.6cqw;height:1.9cqw;transform:translate(-50%,-70%);border-radius:.5cqw .5cqw 1cqw 1cqw;background:linear-gradient(180deg,#2c4f7e,#0e203f 70%);border:1px solid rgba(130,205,255,.6);box-shadow:0 .8cqw 1.8cqw rgba(0,0,0,.55),0 0 1.3cqw rgba(70,170,255,.4),inset 0 1px rgba(200,240,255,.35)}.stn .desk:after{content:"";position:absolute;left:18%;right:18%;top:28%;height:.34cqw;border-radius:1px;background:repeating-linear-gradient(90deg,rgba(130,225,255,.7) 0 .35cqw,transparent .35cqw .55cqw);opacity:.8}
.stu-trails{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7}.stu-trails .trail{fill:none;stroke-width:.5;stroke-dasharray:1.2 2.4;opacity:.8;animation:stuflow 1s linear infinite;vector-effect:non-scaling-stroke}
@keyframes stuscan{to{top:110%}}@keyframes stublink{50%{opacity:.5}}@keyframes stufloat{50%{transform:translateY(-.7cqw)}}@keyframes stuorbit{to{rotate:360deg}}@keyframes stubars{50%{transform:scaleY(.45)}}@keyframes stuflow{to{stroke-dashoffset:-7}}@keyframes studraw{to{stroke-dashoffset:45}}@keyframes stub{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.stu *{animation:none!important}}
`;
