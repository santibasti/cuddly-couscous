// The miniature robots of the cinematic headquarters. Every agent is a small animated robot that really walks across the picture (along the walkways, never through the art in a straight line),
// sits down and types at its desk when it has real work, stands waiting with a gold ⏸ when it needs your approval, walks over to hand work to another desk, cheers when it finishes,
// shakes when something failed, and otherwise strolls to the AI café or the plaza. What they DO comes from real events (lib/hq.ts); how they MOVE is lib/hqsim.ts.
import { memo, useEffect, useRef } from 'react';
import { AGENTS, cafeLine, hash, type AgentDef, type AgentView } from '@/lib/hq';
import { PICTURE, advance, nextWander, routeBetween, wantFor, type Layout, type P, type Pose, type Where } from '@/lib/hqsim';

const BADGE: Record<string, string> = { awaiting: '⏸', error: '⚠', done: '✓', received: '!' };

const Sprite = memo(function Sprite({ a }: { a: AgentDef }) {
  return (
    <svg viewBox="0 0 40 58" width="100%" height="100%" style={{ ['--ac' as string]: a.shirt, overflow: 'visible' }} aria-hidden>
      <ellipse className="sh" cx="20" cy="56" rx="10" ry="2.4" fill="rgba(0,0,0,.5)" />
      <g className="bd">
        <g className="lgL"><rect x="13" y="40" width="6" height="14" rx="3" fill="#a9bbdf" /><rect x="12" y="51" width="8.4" height="4.4" rx="2.2" fill="#6f86b8" /></g>
        <g className="lgR"><rect x="21" y="40" width="6" height="14" rx="3" fill="#a9bbdf" /><rect x="19.6" y="51" width="8.4" height="4.4" rx="2.2" fill="#6f86b8" /></g>
        <g className="tor">
          <g className="amL"><rect x="4.4" y="25" width="5.6" height="15" rx="2.8" fill="url(#rbBody)" stroke="#8fa2c8" strokeWidth=".6" /></g>
          <g className="amR"><rect x="30" y="25" width="5.6" height="15" rx="2.8" fill="url(#rbBody)" stroke="#8fa2c8" strokeWidth=".6" /></g>
          <rect x="10" y="23" width="20" height="21" rx="7" fill="url(#rbBody)" stroke="#8fa2c8" strokeWidth=".6" />
          <rect x="14" y="28" width="12" height="9" rx="3" fill="#0b1b45" /><rect x="14" y="28" width="12" height="9" rx="3" style={{ fill: 'none', stroke: 'var(--ac)', strokeWidth: 0.8 }} />
          <text x="20" y="35" textAnchor="middle" fontSize="6.4" fontWeight="800" fontFamily="system-ui,sans-serif" style={{ fill: 'var(--ac)' }}>AI</text>
          <g className="hd">
            <g className="an"><line x1="20" y1="4" x2="20" y2="0.6" stroke="#8fa2c8" strokeWidth="1" /><circle className="ant" cx="20" cy="1.2" r="1.7" style={{ fill: 'var(--eye)' }} /></g>
            <rect x="8" y="3.6" width="24" height="19" rx="8" fill="url(#rbBody)" stroke="#8fa2c8" strokeWidth=".6" />
            <rect x="5.6" y="10" width="3" height="7" rx="1.5" fill="#8fa2c8" /><rect x="31.4" y="10" width="3" height="7" rx="1.5" fill="#8fa2c8" />
            <rect x="11.5" y="8" width="17" height="10.5" rx="5" fill="#0b1b45" />
            <g className="eyes"><circle cx="16.5" cy="13.2" r="2.2" style={{ fill: 'var(--eye)' }} /><circle cx="23.5" cy="13.2" r="2.2" style={{ fill: 'var(--eye)' }} /></g>
            <path className="mouth" d="M17.3 15.9q2.7 2 5.4 0" stroke="#7fe7ff" strokeWidth="1" fill="none" style={{ stroke: 'var(--eye)' }} />
          </g>
        </g>
        <g className="holo"><rect x="24" y="30" width="15" height="10" rx="1.6" fill="rgba(80,190,255,.28)" stroke="#7fe7ff" strokeWidth=".7" /><line x1="26" y1="33" x2="37" y2="33" stroke="#9ff0ff" strokeWidth=".8" /><line x1="26" y1="36" x2="34" y2="36" stroke="#9ff0ff" strokeWidth=".8" /></g>
      </g>
    </svg>
  );
});

interface Sim { pos: P; route: P[]; moving: boolean; dir: number; wander: Where; until: number; n: number; atSeat: boolean; target: P | null; pose: Pose; doneAt: number }

export function HqRobots({ views, onPickAgent, focusDept, still, layout = PICTURE, hold = false, selectedAgent = '' }: { views: Record<string, AgentView>; onPickAgent: (k: string) => void; focusDept: string; still: boolean; layout?: Layout; hold?: boolean; selectedAgent?: string }) {
  const layer = useRef<HTMLDivElement>(null); const els = useRef<Record<string, HTMLDivElement | null>>({});
  const viewsRef = useRef(views); viewsRef.current = views; const focusRef = useRef(focusDept); focusRef.current = focusDept; const holdRef = useRef(hold); holdRef.current = hold; const selRef = useRef(selectedAgent); selRef.current = selectedAgent; const visible = useRef(true);

  useEffect(() => {
    const L = layer.current; if (!L) return; const SEATS = layout.seats;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((en) => { visible.current = en.some((x) => x.isIntersecting); }) : null; io?.observe(L);
    const reduce = still || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const size = { w: L.clientWidth, h: L.clientHeight }; const ro = new ResizeObserver(() => { size.w = L.clientWidth; size.h = L.clientHeight; }); ro.observe(L);
    const sim: Record<string, Sim> = {}; const t0 = performance.now();
    for (const a of AGENTS) sim[a.key] = { pos: { ...SEATS[a.key] }, route: [], moving: false, dir: 1, wander: 'seat', until: 3 + (hash(a.key) % 9), n: 0, atSeat: true, target: null, pose: 'idle', doneAt: 0 };
    const near = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y) < 0.35;
    const paint = (a: AgentDef, s: Sim, t: number) => {
      const e = els.current[a.key]; if (!e) return; const v = viewsRef.current[a.key] ?? { state: 'idle' as const };
      const hS = Math.max(30, Math.min(64, size.w * 0.036)); const wS = (hS * 40) / 58; const k = 0.8 + (s.pos.y / 100) * 0.5;
      e.style.transform = `translate(${(s.pos.x / 100) * size.w - wS / 2}px, ${(s.pos.y / 100) * size.h - hS}px) scale(${k})`; e.style.zIndex = String(Math.round(s.pos.y * 10));
      e.style.width = `${wS}px`; e.style.height = `${hS}px`;
      const flip = e.firstElementChild as HTMLElement; flip.style.transform = `scaleX(${s.dir < 0 ? -1 : 1})`;
      const pose: Pose = s.moving ? 'walk' : s.pose; if (e.dataset.pose !== pose) e.dataset.pose = pose; if (e.dataset.state !== v.state) e.dataset.state = v.state;
      const focus = focusRef.current; const show = v.state !== 'idle' || (focus && a.dept === focus) || selRef.current === a.key; e.dataset.show = show ? '1' : '';
      const bdg = e.querySelector('.rbt-bdg') as HTMLElement; const txt = !s.moving ? BADGE[v.state] ?? '' : ''; if (bdg.textContent !== txt) bdg.textContent = txt;
      const bub = e.querySelector('.rbt-bub') as HTMLElement; const chatting = !s.moving && s.pose === 'chat' && v.state === 'idle' && (hash(a.key + Math.floor(t / 9)) % 4 === 0) && (t % 9) < 4.2;
      const bt = chatting ? cafeLine(a.key, t * 1000) : ''; if (bub.textContent !== bt) bub.textContent = bt; bub.style.display = bt ? 'block' : 'none';
    };
    if (reduce) { for (const a of AGENTS) { const v = viewsRef.current[a.key]; const w = wantFor(v ?? { state: 'idle' }, a.key, 'seat', layout); sim[a.key].pos = { ...w.spot }; sim[a.key].pose = w.pose; paint(a, sim[a.key], 0); } return () => { ro.disconnect(); io?.disconnect(); }; }

    let last = t0; let raf = 0; let acc = 0;
    const frame = (ts: number) => {
      if (!visible.current || document.hidden) { last = ts; raf = requestAnimationFrame(frame); return; }   // nothing is drawn while the scene is off screen or the tab is hidden
      const dt = Math.min(0.1, (ts - last) / 1000); last = ts; const t = (ts - t0) / 1000; acc += dt;
      for (const a of AGENTS) {
        const s = sim[a.key]; const v = viewsRef.current[a.key] ?? { state: 'idle' as const };
        if (v.state === 'idle' && !holdRef.current && t >= s.until) { const w = nextWander(a.key, a.live, s.n++); s.wander = w.where; s.until = t + w.after; } else if (v.state !== 'idle') { s.wander = 'seat'; s.until = t + 6 + (hash(a.key) % 5); }
        if (holdRef.current && v.state === 'idle') s.wander = 'seat';
        const want = wantFor(v, a.key, s.wander, layout);
        if (!s.target || !near(s.target, want.spot)) {
          s.target = { ...want.spot };
          s.route = routeBetween(s.atSeat ? a.key : null, s.pos, want.spot, want.at === 'seat' ? a.key : want.at === 'partner' ? want.partnerKey ?? null : null, layout); s.atSeat = false;
        }
        if (s.route.length) { const speed = v.state === 'idle' ? 5.2 : 8.5; const r = advance(s.pos, s.route, dt, speed); s.pos = r.pos; s.route = r.route; s.moving = r.moving; if (r.dir) s.dir = r.dir; }
        else s.moving = false;
        if (!s.moving) { s.pose = want.pose; if (want.at === 'seat') s.atSeat = true; if (want.partnerKey && s.target) { const pp = SEATS[want.partnerKey]; if (pp) s.dir = pp.x >= s.pos.x ? 1 : -1; } }
        paint(a, s, t);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect(); };
  }, [still, layout]);

  return (
    <div ref={layer} className="rbt-layer">
      <style>{CSS}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden><defs><linearGradient id="rbBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#dbe6fb" /><stop offset="1" stopColor="#9fb3dc" /></linearGradient></defs></svg>
      {AGENTS.map((a) => (
        <div key={a.key} ref={(el) => { els.current[a.key] = el; }} className={`rbt ${a.live ? '' : 'planned'}`} data-pose="idle" data-state="idle" role="button" tabIndex={0} aria-label={`${a.name}, ${a.role}`} onClick={() => onPickAgent(a.key)} onKeyDown={(e) => { if (e.key === 'Enter') onPickAgent(a.key); }}>
          <div className="rbt-flip"><Sprite a={a} /></div>
          <span className="rbt-bdg" /><span className="rbt-nm">{a.name}</span><span className="rbt-bub" />
        </div>
      ))}
    </div>
  );
}

const CSS = `
.rbt-layer{position:absolute;inset:0;pointer-events:none;z-index:8}
.rbt{position:absolute;left:0;top:0;transform-origin:50% 100%;pointer-events:auto;cursor:pointer;will-change:transform;--eye:#7fe7ff;filter:drop-shadow(0 0 5px rgba(120,210,255,.55)) drop-shadow(0 3px 3px rgba(0,0,0,.6))}
.rbt.planned{filter:drop-shadow(0 0 4px rgba(150,170,220,.4)) drop-shadow(0 3px 3px rgba(0,0,0,.6));--eye:#a9c3ee}
.rbt[data-state=awaiting]{--eye:#ffc233}.rbt[data-state=error]{--eye:#ff6a5a}.rbt[data-state=done]{--eye:#5dff9c}.rbt[data-state=coordinating]{--eye:#b69bff}
.rbt:hover,.rbt:focus-visible{outline:none;filter:drop-shadow(0 0 9px #ffd37a) drop-shadow(0 3px 3px rgba(0,0,0,.6))}
.rbt-flip{width:100%;height:100%;transition:transform .18s ease-out}
.rbt-flip svg g,.rbt-flip svg ellipse{transform-box:fill-box}
.rbt-nm{position:absolute;left:50%;top:102%;transform:translateX(-50%);font:700 9px/1 system-ui,sans-serif;color:#eaf3ff;background:rgba(4,12,40,.72);padding:2px 5px;border-radius:999px;white-space:nowrap;opacity:0;transition:opacity .2s;pointer-events:none;border:1px solid rgba(130,180,255,.4)}
.rbt[data-show='1'] .rbt-nm,.rbt:hover .rbt-nm{opacity:1}
.rbt-bdg{position:absolute;left:50%;top:-34%;transform:translateX(-50%);font:800 13px/1 system-ui,sans-serif;pointer-events:none}.rbt[data-state=awaiting] .rbt-bdg{color:#ffc233;text-shadow:0 0 8px #ffc233;animation:rbpulse 1.1s ease-in-out infinite}.rbt[data-state=error] .rbt-bdg{color:#ff7a6a;text-shadow:0 0 8px #ff6a5a}.rbt[data-state=done] .rbt-bdg{color:#5dff9c;text-shadow:0 0 8px #5dff9c}.rbt[data-state=received] .rbt-bdg{color:#7fe7ff}
.rbt-bub{position:absolute;left:50%;bottom:118%;transform:translateX(-50%);display:none;width:max-content;max-width:150px;padding:3px 8px;border-radius:10px;background:rgba(255,255,255,.95);color:#14224a;font:500 10px/1.25 system-ui,sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.5);pointer-events:none;z-index:3}
.rbt .holo{opacity:0}.rbt .mouth{opacity:.95}
/* animation: every part has its own pivot so the limbs swing like limbs */
.rbt .lgL,.rbt .lgR{transform-origin:50% 0}.rbt .amL,.rbt .amR{transform-origin:50% 8%}.rbt .hd{transform-origin:50% 100%}.rbt .an{transform-origin:50% 100%}.rbt .bd{transform-origin:50% 100%}.rbt .tor{transform-origin:50% 100%}
.rbt .eyes{transform-origin:50% 50%;animation:rbblink 4.6s infinite}.rbt .an{animation:rbwig 2.6s ease-in-out infinite}.rbt .ant{animation:rbpulse 1.8s ease-in-out infinite}
.rbt[data-pose=idle] .bd{animation:rbbreathe 3.2s ease-in-out infinite}.rbt[data-pose=idle] .hd{animation:rblook 7s ease-in-out infinite}
.rbt[data-pose=walk] .bd{animation:rbbob .42s ease-in-out infinite}.rbt[data-pose=walk] .lgL{animation:rbleg .42s ease-in-out infinite}.rbt[data-pose=walk] .lgR{animation:rbleg .42s ease-in-out infinite reverse}
.rbt[data-pose=walk] .amL{animation:rbarm .42s ease-in-out infinite reverse}.rbt[data-pose=walk] .amR{animation:rbarm .42s ease-in-out infinite}.rbt[data-pose=walk] .hd{animation:rbtilt .42s ease-in-out infinite}.rbt[data-pose=walk] .sh{animation:rbsh .42s ease-in-out infinite;transform-origin:50% 50%}
.rbt[data-pose=type] .bd{transform:translateY(9%) scaleY(.93)}.rbt[data-pose=type] .lgL,.rbt[data-pose=type] .lgR{opacity:.0}.rbt[data-pose=type] .holo{opacity:1;animation:rbpulse 1.4s ease-in-out infinite}
.rbt[data-pose=type] .amL{animation:rbtype .22s ease-in-out infinite;transform:rotate(-32deg)}.rbt[data-pose=type] .amR{animation:rbtype .22s ease-in-out infinite .11s;transform:rotate(32deg)}.rbt[data-pose=type] .hd{animation:rbnod 2.4s ease-in-out infinite}
.rbt[data-pose=wait] .bd{animation:rbbreathe 2.4s ease-in-out infinite}.rbt[data-pose=wait] .amR{transform:rotate(150deg);animation:rbwave 1.2s ease-in-out infinite}.rbt[data-pose=wait] .hd{animation:rblook 3s ease-in-out infinite}
.rbt[data-pose=cheer] .bd{animation:rbjump .6s ease-out 4}.rbt[data-pose=cheer] .amL{transform:rotate(-150deg)}.rbt[data-pose=cheer] .amR{transform:rotate(150deg)}
.rbt[data-pose=shake] .hd{animation:rbshake .35s ease-in-out infinite}.rbt[data-pose=shake] .bd{animation:rbjit .25s ease-in-out infinite}
.rbt[data-pose=chat] .bd{animation:rbbreathe 2.8s ease-in-out infinite}.rbt[data-pose=chat] .amR{animation:rbgest 2.2s ease-in-out infinite}.rbt[data-pose=chat] .hd{animation:rbnod 1.8s ease-in-out infinite}
@keyframes rbbreathe{50%{transform:scale(1,1.025)}}@keyframes rblook{0%,100%{transform:rotate(0)}30%{transform:rotate(5deg)}65%{transform:rotate(-5deg)}}@keyframes rbbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4%)}}
@keyframes rbleg{0%,100%{transform:rotate(-30deg)}50%{transform:rotate(30deg)}}@keyframes rbarm{0%,100%{transform:rotate(26deg)}50%{transform:rotate(-26deg)}}@keyframes rbtilt{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}@keyframes rbsh{50%{transform:scale(.82)}}
@keyframes rbtype{0%,100%{transform:rotate(-34deg)}50%{transform:rotate(-18deg)}}@keyframes rbnod{50%{transform:rotate(4deg) translateY(2%)}}@keyframes rbwave{50%{transform:rotate(128deg)}}@keyframes rbjump{0%{transform:translateY(0) scale(1,1)}20%{transform:translateY(0) scale(1.08,.9)}55%{transform:translateY(-22%) scale(.95,1.08)}100%{transform:translateY(0) scale(1,1)}}
@keyframes rbshake{25%{transform:rotate(-10deg)}75%{transform:rotate(10deg)}}@keyframes rbjit{25%{transform:translateX(-3%)}75%{transform:translateX(3%)}}@keyframes rbgest{0%,100%{transform:rotate(8deg)}45%{transform:rotate(-70deg)}}
@keyframes rbblink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}@keyframes rbwig{50%{transform:rotate(9deg)}}@keyframes rbpulse{50%{opacity:.5}}
@media (prefers-reduced-motion:reduce){.rbt *{animation:none!important}}
`;
