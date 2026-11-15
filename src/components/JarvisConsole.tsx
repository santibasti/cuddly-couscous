// The Jarvis "console" view: a particle sphere that swirls and speaks (spikes follow the voice), a system-status block, a real activity log,
// a radar of today's jobs (placed by start time on a 12-hour dial), a voice waveform and the key figures. Everything shown comes from the live panel.
import { useEffect, useRef, useState } from 'react';
import type { CoreMode } from '@/components/JarvisCore';
import { ago, manilaClock, type JarvisPanel, type Summary } from '@/lib/jarvisview';

export type ConsoleTheme = 'blue' | 'cyan';
const TAU = Math.PI * 2;
const PAL: Record<ConsoleTheme, { disc0: string; disc1: string; dot: [number, number, number]; ring: string; warm: string; glow: [number, number, number] }> = {
  blue: { disc0: 'rgba(70,90,255,.55)', disc1: 'rgba(12,18,160,.55)', dot: [200, 220, 255], ring: 'rgba(238,243,255,.95)', warm: 'rgba(255,214,176,.9)', glow: [120, 150, 255] },
  cyan: { disc0: 'rgba(0,150,210,.5)', disc1: 'rgba(0,50,100,.55)', dot: [170, 245, 255], ring: 'rgba(210,250,255,.95)', warm: 'rgba(180,255,230,.85)', glow: [60, 210, 255] },
};

/** Particle sphere with rings and voice spikes. Audio drives the spikes when an analyser is given; otherwise a soft pattern plays. */
function ParticleCore({ mode, analyser, theme }: { mode: CoreMode; analyser: React.MutableRefObject<AnalyserNode | null>; theme: ConsoleTheme }) {
  const cv = useRef<HTMLCanvasElement>(null); const modeRef = useRef(mode); const themeRef = useRef(theme);
  useEffect(() => { modeRef.current = mode; themeRef.current = theme; }, [mode, theme]);
  useEffect(() => {
    const canvas = cv.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let size = 480, dpr = 1, raf = 0, last = performance.now(), spin = 0, level = 0, amp = 0.2;
    const bins = new Uint8Array(128); const N = 1500;
    let seed = 13; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const P = Array.from({ length: N }, () => ({ r: Math.pow(rnd(), 0.6), a: rnd() * TAU, tw: rnd() * TAU, s: 0.7 + rnd() * 1.5 }));
    const ripples: number[] = []; let lastRipple = 0;
    const fit = () => { const r = canvas.getBoundingClientRect(); size = Math.max(200, Math.round(r.width)); dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = size * dpr; canvas.height = size * dpr; };
    fit(); const ro = new ResizeObserver(fit); ro.observe(canvas);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame); if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000; const m = modeRef.current; const pal = PAL[themeRef.current];
      spin += dt * (m === 'thinking' ? 3.4 : m === 'speaking' ? 1.3 : m === 'listening' ? 0.9 : 0.35);
      let target = 0; const an = analyser.current;
      if (an && (m === 'speaking' || m === 'listening')) { an.getByteFrequencyData(bins); let s = 0; for (let i = 0; i < 40; i++) s += bins[i]; target = Math.min(1, s / 40 / 150); }
      else if (m === 'speaking') target = 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1)) + 0.15 * Math.sin(t * 13);
      else if (m === 'listening') target = 0.2 + 0.12 * Math.abs(Math.sin(t * 4.1));
      level += (target - level) * Math.min(1, dt * 14); amp += ((m === 'idle' ? 0.2 : m === 'thinking' ? 0.45 : 0.9) - amp) * Math.min(1, dt * 3);
      const breath = 0.5 + 0.5 * Math.sin(t * 1.1);
      const W = size * dpr; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, W); ctx.translate(W / 2, W / 2); ctx.scale(W / 2, W / 2);
      const [dr, dg, db] = pal.dot; const [gr, gg, gb] = pal.glow;
      // disc
      const dg0 = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.62); dg0.addColorStop(0, pal.disc0); dg0.addColorStop(1, pal.disc1); ctx.fillStyle = dg0; ctx.beginPath(); ctx.arc(0, 0, 0.62, 0, TAU); ctx.fill();
      // particle cloud: swirls faster near the centre, breathes with the voice
      const inward = m === 'thinking' ? 0.04 * Math.sin(t * 3) : 0;
      for (const p of P) {
        p.a += dt * (0.18 + (1 - p.r) * 0.9) * (m === 'thinking' ? 3.2 : m === 'speaking' ? 1.5 : 1) * (p.s > 1.6 ? -1 : 1);
        const rr = (p.r * (0.58 + inward) * (1 + level * 0.12 * Math.sin(t * 9 + p.tw)));
        const x = Math.cos(p.a + spin * 0.05) * rr, y = Math.sin(p.a + spin * 0.05) * rr; const near = 1 - p.r;
        const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + p.tw); const hot = m === 'thinking' && p.s > 1.9;
        ctx.fillStyle = hot ? `rgba(255,205,110,${0.5 + 0.5 * tw})` : `rgba(${dr},${dg},${db},${(0.22 + 0.7 * near) * tw})`;
        const sz = (0.0035 + 0.0055 * near) * p.s; ctx.fillRect(x, y, sz, sz);
      }
      // core glow
      const cr = 0.16 + 0.03 * breath + 0.12 * level; const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cr); cg.addColorStop(0, 'rgba(255,255,255,1)'); cg.addColorStop(0.3, `rgba(${dr},${dg},${db},.85)`); cg.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, cr, 0, TAU); ctx.fill();
      // rings with gaps
      ctx.lineCap = 'round'; ctx.save(); ctx.rotate(spin * 0.12); ctx.strokeStyle = pal.ring; ctx.lineWidth = 0.011;
      for (const [a0, l] of [[0.15, 2.7], [3.0, 1.2], [4.4, 1.0], [5.55, 0.5]]) { ctx.beginPath(); ctx.arc(0, 0, 0.665, a0, a0 + l); ctx.stroke(); } ctx.restore();
      ctx.save(); ctx.rotate(-spin * 0.2); ctx.strokeStyle = pal.warm; ctx.lineWidth = 0.007; ctx.beginPath(); ctx.arc(0, 0, 0.69, 0.9, 2.2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 0.69, 3.9, 4.6); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = `rgba(${dr},${dg},${db},.5)`; ctx.lineWidth = 0.005; ctx.setLineDash([0.006, 0.02]); ctx.save(); ctx.rotate(spin * 0.06); ctx.beginPath(); ctx.arc(0, 0, 0.77, 0, TAU); ctx.stroke(); ctx.restore(); ctx.setLineDash([]);
      // voice spikes
      ctx.save(); ctx.rotate(spin * 0.03);
      for (let i = 0; i < 84; i++) {
        const a = (i / 84) * TAU, bi = Math.floor((i < 42 ? i : 83 - i) * 1.4); const real = an && (m === 'speaking' || m === 'listening') ? bins[Math.min(127, bi)] / 255 : 0;
        const syn = (0.5 + 0.5 * Math.sin(i * 1.7 + t * 2.6)) * (0.5 + 0.5 * Math.cos(i * 0.45 - t * 1.7)); const v = (real > 0 ? real * 1.25 : syn * (0.25 + level)) * amp;
        const r0 = 0.81, r1 = r0 + 0.012 + v * 0.17; ctx.strokeStyle = `rgba(${dr + 25},${dg + 20},255,${0.4 + 0.6 * Math.min(1, v * 1.4)})`; ctx.lineWidth = 0.011;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
      }
      ctx.restore();
      // ripples
      if (m === 'speaking' && level > 0.55 && now - lastRipple > 320) { ripples.push(now); lastRipple = now; }
      for (let i = ripples.length - 1; i >= 0; i--) { const k = (now - ripples[i]) / 1200; if (k >= 1) { ripples.splice(i, 1); continue; } ctx.strokeStyle = `rgba(${dr},${dg},${db},${(1 - k) * 0.3})`; ctx.lineWidth = 0.004; ctx.beginPath(); ctx.arc(0, 0, 0.7 + k * 0.3, 0, TAU); ctx.stroke(); }
    };
    if (reduce) { frame(performance.now()); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [analyser]);
  return <canvas ref={cv} className="jc-canvas" aria-hidden />;
}

/** Small voice waveform: the real audio while Jarvis speaks or listens, a calm line otherwise. */
function Wave({ mode, analyser }: { mode: CoreMode; analyser: React.MutableRefObject<AnalyserNode | null> }) {
  const cv = useRef<HTMLCanvasElement>(null); const modeRef = useRef(mode); useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const c = cv.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return; let raf = 0; const buf = new Uint8Array(128);
    const fit = () => { const b = c.getBoundingClientRect(); c.width = Math.round(b.width * (window.devicePixelRatio || 1)); c.height = Math.round(b.height * (window.devicePixelRatio || 1)); }; fit(); const ro = new ResizeObserver(fit); ro.observe(c);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick); if (document.hidden) return; const w = c.width, h = c.height, t = now / 1000, m = modeRef.current; ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(235,242,255,.95)'; ctx.lineWidth = Math.max(1.5, h / 28); ctx.lineJoin = 'round'; ctx.beginPath();
      const an = analyser.current; const live = an && (m === 'speaking' || m === 'listening'); if (live) an.getByteTimeDomainData(buf);
      const n = 96; for (let i = 0; i <= n; i++) { const k = i / n; let v: number; if (live) v = (buf[Math.floor(k * 127)] - 128) / 128; else { const a = m === 'thinking' ? 0.35 : m === 'idle' ? 0.08 : 0.3; v = a * Math.sin(k * 14 + t * (m === 'thinking' ? 7 : 2)) * Math.sin(k * 3 - t); } const x = k * w, y = h / 2 + v * h * 0.42; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    };
    raf = requestAnimationFrame(tick); return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [analyser]);
  return <canvas ref={cv} className="jc-wave" aria-hidden />;
}

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <div className="jc-clk">{t.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Manila' })}</div>;
}

/** Thumbs up / down on the last answer. A thumbs-down can say why (optional); that becomes something Jarvis learns. */
function Rate({ rated, onRate }: { rated: number | null; onRate: (r: 1 | -1, reason?: string) => void }) {
  const [why, setWhy] = useState(false); const [reason, setReason] = useState('');
  if (rated !== null) return <div className="jc-fb"><span className="jc-mut">{rated === 1 ? 'Thanks, noted.' : 'Thanks, I will learn from that.'}</span></div>;
  if (why) return <form className="jc-fb" onSubmit={(e) => { e.preventDefault(); onRate(-1, reason.trim()); }}>
    <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="What was wrong? (optional)" />
    <button type="submit">Send</button><button type="button" onClick={() => onRate(-1)}>Skip</button></form>;
  return <div className="jc-fb"><span className="jc-mut">Was that helpful?</span><button type="button" aria-label="Helpful" onClick={() => onRate(1)}>👍</button><button type="button" aria-label="Not helpful" onClick={() => setWhy(true)}>👎</button></div>;
}

/** The company knowledge base: upload or paste a document; Jarvis looks up the right section when asked. Stored only in the database. */
function KnowledgeBox({ k, save }: { k: { num: number; title: string; chars: number }[]; save: (text: string | null) => Promise<string> }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const total = k.reduce((a, x) => a + x.chars, 0);
  const run = async (t: string | null) => { setBusy(true); setMsg(''); try { setMsg(await save(t)); if (t) { setText(''); setOpen(false); } } finally { setBusy(false); } };
  const pick = (f?: File | null) => { if (!f) return; if (f.size > 400_000) { setMsg('That file is too big (limit about 250,000 characters).'); return; } void f.text().then(setText); };
  return <section className="jc-box"><h6>KNOWLEDGE <em>{k.length ? `${k.length} SECTIONS · ${Math.max(1, Math.round(total / 1000))} KB` : 'EMPTY'}</em></h6>
    {!open && <div className="jc-mut">{k.length ? 'Jarvis reads the right section when you ask about the company.' : 'Add your company document so Jarvis knows the business.'}</div>}
    {open && <div className="jc-kn"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the document here (use # headings), or choose a .md / .txt file" rows={5} />
      <input type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" onChange={(e) => pick(e.target.files?.[0])} /></div>}
    <div className="jc-kb">{open ? <><button type="button" disabled={busy || text.trim().length < 200} onClick={() => void run(text)}>{busy ? 'Saving…' : 'Save (replaces old)'}</button><button type="button" onClick={() => { setOpen(false); setText(''); }}>Cancel</button></> : <><button type="button" onClick={() => setOpen(true)}>{k.length ? 'Replace document' : 'Add document'}</button>{k.length > 0 && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove the knowledge document from Jarvis?')) void run(null); }}>Remove</button>}</>}</div>
    {msg && <div className="jc-mut">{msg}</div>}</section>;
}

export interface ConsoleProps {
  S: Summary; panel: JarvisPanel; mode: CoreMode; analyser: React.MutableRefObject<AnalyserNode | null>; theme: ConsoleTheme;
  sub: string; say: string; idleHint: string; text: string; setText: (v: string) => void; submit: (e: React.FormEvent) => void; onCore: () => void; onBrief: () => void; onForget: (id: number) => void; onKnowledge: (text: string | null) => Promise<string>; canRate: boolean; rated: number | null; onRate: (rating: 1 | -1, reason?: string) => void; onProposal: (id: number, accept: boolean) => void; busy: boolean; live: boolean;
  money: (n: number) => string;
}
const KIND: Record<string, string> = { brief: 'BRIEF', alert: 'ALERT', inquiry: 'LEAD', search: 'WEB', answer: 'ANSWER', memory: 'LEARN', review: 'REVIEW', weather: 'WEATHER' };

export function JarvisConsole(p: ConsoleProps) {
  const { S, panel } = p;
  return (
    <div className={`jc ${p.theme}`}>
      <style>{CSS}</style>
      <div className="jc-grid">
        <aside className="jc-col">
          <section className="jc-box"><h6>SYSTEM STATUS</h6>
            <div className="jc-bars">{S.health.map((h) => <div key={h.label}><span>{h.label}</span><i style={{ ['--w' as string]: `${h.pct ?? 0}%` }} /><b>{h.pct === null ? '—' : `${h.pct}%`}</b></div>)}{!S.health.length && <div className="jc-mut">Waiting for the live system…</div>}</div></section>
          <section className="jc-box jc-logbox"><h6>ACTIVITY LOG</h6>
            <div className="jc-log">{!S.events.length && <div className="jc-mut">{p.live ? 'No activity yet. It fills as Jarvis works.' : 'Sample activity.'}</div>}
              {S.events.slice(0, 7).map((e, i) => <div key={`${e.at}-${i}`} className="ln"><span className="t">{manilaClock(e.at)}</span> <em className={e.kind === 'alert' ? 'am' : ''}>{KIND[e.kind] ?? e.kind.toUpperCase()}</em> {e.text}</div>)}</div></section>
          <section className="jc-box"><h6>MEMORY <em>{S.memory.length} LEARNED</em></h6>
            {S.proposals.length > 0 && <div className="jc-prop"><div className="jc-mut">I'D LIKE TO LEARN</div>{S.proposals.map((x) => <div key={x.id} className="mn" title={x.why}><span>{x.text}</span><span className="pb"><button type="button" title="Remember this" aria-label="Approve" onClick={() => p.onProposal(x.id, true)}>✓</button><button type="button" title="No" aria-label="Reject" onClick={() => p.onProposal(x.id, false)}>×</button></span></div>)}</div>}
            <div className="jc-mem">{!S.memory.length && <div className="jc-mut">Nothing yet. Tell Jarvis how you like things (for example "keep briefs short") and he will remember.</div>}
              {S.memory.slice(-5).reverse().map((n) => <div key={n.id} className="mn"><span>{n.text}</span><button type="button" title="Forget this" aria-label="Forget this note" onClick={() => p.onForget(n.id)}>×</button></div>)}</div></section>
          <KnowledgeBox k={S.knowledge} save={p.onKnowledge} />
          <section className="jc-box"><h6>NEEDS YOU <em>{S.attention || 'CLEAR'}</em></h6>
            {S.decisions.slice(0, 4).map((d, i) => <div className="row" key={i}><span className={d.tone === 'warn' ? 'am' : ''}>{d.label}</span><b>{d.value}</b></div>)}</section>
        </aside>

        <main className="jc-center">
          <div className={`jc-core ${p.mode}`} onClick={p.onCore} role="button" aria-label="Talk to Jarvis" title={p.live ? 'Tap to talk' : 'Tap to preview the states'}>
            <ParticleCore mode={p.mode} analyser={p.analyser} theme={p.theme} />
          </div>
          <div className="jc-state">{p.mode === 'idle' ? 'STANDING BY' : p.mode.toUpperCase()}</div>
          <div className="jc-say">{p.sub ? <span key={p.sub} className="jc-cap">{p.sub}</span> : !p.say && p.mode === 'idle' ? p.idleHint : ''}</div>
          {p.canRate && <Rate rated={p.rated} onRate={p.onRate} />}
          <form className="jc-bar" onSubmit={p.submit}>
            <button type="button" className={`mic ${p.mode === 'listening' ? 'on' : ''}`} onClick={p.onCore} aria-label="Microphone">🎙</button>
            <input value={p.text} onChange={(e) => p.setText(e.target.value)} placeholder="Ask Jarvis…" disabled={p.busy} />
            <button type="button" className="chip" onClick={p.onBrief} disabled={p.busy || !p.live}>Brief me</button>
            <button type="submit" className="chip" disabled={!p.text.trim() || p.busy}>Send</button>
          </form>
        </main>

        <aside className="jc-col">
          <section className="jc-box"><Clock /><div className="jc-sub">MANILA · UTC+8</div></section>
          <section className="jc-box"><h6>RADAR · TODAY'S JOBS <em>{S.jobs.length}</em></h6>
            <svg viewBox="-100 -100 200 200" className="jc-radar"><circle r="95" className="rd0" /><circle r="63" className="rd1" /><circle r="31" className="rd1" />
              {[0, 90, 180, 270].map((a) => <line key={a} x1="0" y1="0" x2={95 * Math.cos((a * Math.PI) / 180)} y2={95 * Math.sin((a * Math.PI) / 180)} className="rd1" />)}
              <g className="sweep"><path d="M0 0L95 0A95 95 0 0 0 80 -51Z" className="rdw" /><line x1="0" y1="0" x2="95" y2="0" className="rdl" /></g>
              {S.radar.map((r, i) => <circle key={i} cx={Math.cos(r.angle) * 66} cy={Math.sin(r.angle) * 66} r="4.5" className={r.warn ? 'dot warn' : 'dot'}><title>{r.label}</title></circle>)}
              <text x="0" y="-100" className="rdt" textAnchor="middle" dy="-2">12</text></svg>
            <div className="jc-mut">Placed by start time on a 12-hour dial. Amber = no leader.</div></section>
          <section className="jc-box"><h6>VOICE</h6><Wave mode={p.mode} analyser={p.analyser} /></section>
          <section className="jc-box"><h6>CASH · PIPELINE</h6>
            <div className="row"><span>Outstanding</span><b>{p.money(S.cash.outstanding)}</b></div><div className="row"><span>Overdue ({S.cash.overdueCount})</span><b className={S.cash.overdue ? 'am' : ''}>{p.money(S.cash.overdue)}</b></div>
            <div className="row"><span>Received today</span><b>{p.money(S.cash.today)}</b></div><div className="row"><span>New inquiries · 24h</span><b>{S.pipeline.total}</b></div><div className="row"><span>Jobs today · tomorrow</span><b>{S.jobs.length} · {S.tomorrow}</b></div></section>
        </aside>
      </div>
      <div className="jc-foot">Updated {manilaClock(panel.at)} · {ago(panel.at)}</div>
    </div>
  );
}

const CSS = `
.jc{--ink:#cfe0ff;--hi:#fff;--line:rgba(170,200,255,.5);--dim:#9fc0ff;--box:rgba(8,14,110,.5);--am:#ffd37a;position:relative;z-index:1;margin-top:10px;color:var(--ink);font-family:ui-monospace,Consolas,"Segoe UI",monospace;font-size:clamp(12px,calc(.3vw + .45vh + 6px),16px);flex:1;display:flex;flex-direction:column}
.jc.cyan{--ink:#bfefff;--line:rgba(0,220,255,.4);--dim:#59d6ff;--box:rgba(3,34,52,.6);--am:#ffc857}
.jc-grid{display:grid;grid-template-columns:minmax(230px,clamp(270px,22vw,400px)) 1fr minmax(230px,clamp(270px,22vw,400px));gap:18px;align-items:stretch;flex:1}
.jc-col{display:grid;gap:12px;align-content:start}
.jc-box{position:relative;border:1px solid var(--line);background:var(--box);padding:10px 12px;backdrop-filter:blur(3px)}
.jc-box:before{content:"";position:absolute;left:-1px;top:-1px;width:12px;height:12px;border-left:2px solid #fff;border-top:2px solid #fff}
.jc h6{margin:0 0 7px;font-size:.82em;letter-spacing:.22em;color:var(--dim);font-weight:600;display:flex;justify-content:space-between}.jc h6 em{font-style:normal;opacity:.8}
.jc .row{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px dashed rgba(170,200,255,.2)}.jc .row b{color:var(--hi)}.jc .am{color:var(--am)}.jc-mut{opacity:.65;font-size:.9em}
.jc-bars>div{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:.85em}.jc-bars span{width:5.2em;flex:none}.jc-bars i{flex:1;height:4px;background:rgba(170,200,255,.2);position:relative}.jc-bars i:after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--w);background:linear-gradient(90deg,#7fa8ff,#fff);transition:width .8s}.jc-bars b{width:3.2em;text-align:right;color:var(--hi);font-weight:500}
.jc-logbox{min-height:140px}.jc-log{max-height:calc(100vh - 560px);min-height:110px;overflow:hidden;line-height:1.7;font-size:.92em;color:#bcd0ff}.jc.cyan .jc-log{color:#a8e8fa}
.jc-log .ln{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:jcln .6s ease-out}.jc-log .t{color:#7f9cf5}.jc.cyan .jc-log .t{color:#4bc0dc}.jc-log em{font-style:normal;color:#fff;margin:0 4px}.jc-log em.am{color:var(--am)}
@keyframes jcln{from{opacity:0;transform:translateX(-8px);background:rgba(255,255,255,.2)}to{opacity:1;transform:none;background:transparent}}
.jc-center{display:grid;justify-items:center;align-content:center;gap:8px}
.jc-core{position:relative;width:min(640px,60vh,100%);aspect-ratio:1;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
.jc-core:before{content:"";position:absolute;inset:-6%;border-radius:50%;background:radial-gradient(circle,rgba(110,140,255,.25),transparent 62%);animation:jchalo 5s ease-in-out infinite;pointer-events:none}.jc.cyan .jc-core:before{background:radial-gradient(circle,rgba(40,210,255,.25),transparent 62%)}
.jc-core.speaking:before,.jc-core.thinking:before{animation-duration:1s}.jc-core.listening:before{animation-duration:1.5s}
@keyframes jchalo{0%,100%{transform:scale(.95);opacity:.8}50%{transform:scale(1.06);opacity:1}}
.jc-canvas{position:relative;width:100%;height:100%;display:block}
.jc-state{letter-spacing:.34em;font-size:.82em;color:#d9e6ff;text-shadow:0 0 10px rgba(150,180,255,.8)}
.jc-say{min-height:3.2em;max-width:min(760px,100%);text-align:center;font:1.25em "Segoe UI",system-ui,sans-serif;color:#fff}
.jc-cap{display:inline-block;letter-spacing:.01em;text-transform:none;font-size:.88em;max-width:100%;padding:.2em .7em;border-radius:6px;background:rgba(0,0,0,.55);font-weight:600;line-height:1.35;text-shadow:0 1px 2px #000,0 0 3px #000;animation:jccap .25s ease-out}
@keyframes jccap{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.jc-cap{animation:none}}
.jc .cur{display:inline-block;width:8px;height:1em;margin-left:3px;vertical-align:-2px;background:#dfe9ff;box-shadow:0 0 8px #aac;animation:jcblink .8s steps(2) infinite}@keyframes jcblink{50%{opacity:.2}}
.jc-bar{display:flex;gap:8px;align-items:center;width:min(720px,100%);border:1px solid rgba(190,210,255,.6);border-radius:26px;padding:6px 8px;background:rgba(8,14,110,.6);font-family:"Segoe UI",system-ui,sans-serif}.jc.cyan .jc-bar{background:rgba(2,30,48,.72);border-color:rgba(0,220,255,.45)}
.jc .jc-bar input{flex:1;min-width:0;background:transparent!important;border:0!important;box-shadow:none!important;outline:0;color:#f2f6ff;font-size:14px;padding:6px 4px}.jc-bar input::placeholder{color:#9fb4ee}
.jc-bar .mic{width:38px;height:38px;border-radius:50%;border:1px solid rgba(200,220,255,.6);background:rgba(60,80,230,.5);color:#fff;cursor:pointer;font-size:16px}.jc-bar .mic.on{background:#1aa37a;border-color:#5df0b0;animation:jchalo 1s infinite}
.jc-bar .chip{border:1px solid rgba(200,220,255,.5);background:rgba(60,80,230,.4);color:#e6eeff;border-radius:16px;padding:5px 12px;cursor:pointer;font-size:12px}.jc-bar .chip:disabled{opacity:.4;cursor:default}
.jc-clk{font-size:2em;color:#fff;letter-spacing:.08em;font-variant-numeric:tabular-nums}.jc-sub{font-size:.8em;letter-spacing:.2em;color:var(--dim)}
.jc-radar{display:block;width:min(100%,230px);margin:4px auto}.jc-radar .rd0{fill:rgba(20,40,200,.35);stroke:#bcd0ff;stroke-opacity:.7}.jc.cyan .jc-radar .rd0{fill:rgba(0,70,110,.4)}.jc-radar .rd1{fill:none;stroke:#bcd0ff;stroke-opacity:.3}.jc-radar .rdw{fill:rgba(210,230,255,.32)}.jc-radar .rdl{stroke:#fff;stroke-width:1.2}.jc-radar .rdt{fill:#bcd0ff;font-size:9px}
.jc-radar .sweep{animation:jcsweep 5s linear infinite;transform-origin:0 0}@keyframes jcsweep{to{transform:rotate(360deg)}}
.jc-radar .dot{fill:#fff;filter:drop-shadow(0 0 4px #fff)}.jc-radar .dot.warn{fill:var(--am);filter:drop-shadow(0 0 5px var(--am));animation:jcblink 1.2s infinite}
.jc-wave{display:block;width:100%;height:56px}
.jc-foot{text-align:center;margin-top:10px;font-size:.78em;letter-spacing:.15em;opacity:.55}
.jc-mem .mn,.jc-prop .mn{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;font-size:.88em;line-height:1.4;padding:3px 0;color:#d9e6ff;border-bottom:1px dashed rgba(150,180,255,.18)}.jc-mem .mn button,.jc-prop .mn button{background:none;border:0;color:#7f9cf5;cursor:pointer;font-size:1.1em;line-height:1;padding:0 2px}.jc-mem .mn button:hover,.jc-prop .mn button:hover{color:#fff}
.jc-fb{display:flex;gap:8px;align-items:center;justify-content:center;margin:6px 0;font-size:.85em}.jc-fb button{background:rgba(110,140,255,.15);border:1px solid rgba(150,180,255,.4);color:#e8eeff;border-radius:6px;padding:2px 9px;cursor:pointer}.jc-fb input{background:rgba(0,0,0,.35);color:#e8eeff;border:1px solid rgba(150,180,255,.3);border-radius:6px;padding:4px 8px;min-width:190px}.jc-prop{margin-bottom:6px}.jc-prop .pb{display:flex;gap:4px}.jc-prop .mn button{color:#9be6b4}.jc-prop .mn button+button{color:#7f9cf5}
.jc-kn textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.35);color:#e8eeff;border:1px solid rgba(150,180,255,.3);border-radius:6px;padding:6px;font:inherit;font-size:.85em;resize:vertical}.jc-kn input{margin-top:6px;font-size:.8em;color:#bcd0ff;max-width:100%}.jc-kb{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.jc-kb button{background:rgba(110,140,255,.15);border:1px solid rgba(150,180,255,.4);color:#e8eeff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:.82em}.jc-kb button:disabled{opacity:.45;cursor:default}
@media (max-width:1000px){.jc-grid{grid-template-columns:1fr}.jc-center{order:-1}.jc-core{width:min(420px,86vw)}.jc-log{max-height:260px}}
@media (prefers-reduced-motion:reduce){.jc-core:before,.jc-radar .sweep,.jc .cur,.jc-radar .dot.warn,.jc-log .ln{animation:none}}
`;
