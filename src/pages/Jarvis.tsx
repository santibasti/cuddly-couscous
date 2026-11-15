// Jarvis: the owner's command-center screen. A glowing core that pulses while Jarvis listens and speaks, live panels from the business, and a way to talk to it.
// Live system: figures, answers and the voice come from the `jarvis` Edge Function (owner login only, read-only). The demo build shows sample figures.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLOUD, fnFetch } from '@/lib/cloud';
import { JarvisBackdrop, JarvisCore, type CoreMode } from '@/components/JarvisCore';
import { JarvisConsole, type ConsoleTheme } from '@/components/JarvisConsole';
import { DEMO_PANEL, ago, manilaClock, summarize, type JarvisPanel } from '@/lib/jarvisview';
import { fmtDate } from '@/lib/util';

const money = (n: number) => `₱${Math.round(n || 0).toLocaleString('en-PH')}`;

type Mode = CoreMode;
type Turn = { role: 'user' | 'assistant'; content: string };
const STATUS: Record<Mode, string> = { idle: 'STANDING BY', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING' };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fnFetch('jarvis', { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? `Jarvis answered ${r.status}`);
  return j;
}

/** Numbers roll up to their value (a small "live" feel when figures arrive or change). */
function useCount(value: number, ms = 900) {
  const [v, setV] = useState(0); const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(value); return; }
    const a = from.current, t0 = performance.now(); let raf = 0;
    const step = (now: number) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); const x = a + (value - a) * e; setV(x); from.current = x; if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}
/** Text types itself out, like a console. */
function useTypewriter(text: string, cps = 70) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0); if (!text) return; if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (now: number) => { const k = Math.min(text.length, Math.floor(((now - t0) / 1000) * cps)); setN(k); if (k < text.length) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [text, cps]);
  return text.slice(0, n);
}

const BOOT_KEY = 'topmop-jarvis-booted';
const pref = <T extends string>(k: string, d: T, ok: T[]): T => { try { const v = localStorage.getItem(k) as T | null; return v && ok.includes(v) ? v : d; } catch { return d; } };
const savePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };
function Boot({ voice, live, done }: { voice: boolean | null; live: boolean; done: () => void }) {
  const lines = ['INITIALIZING J.A.R.V.I.S.', 'LINKING OPERATIONS DATA ........ ' + (live ? 'OK' : 'DEMO'), 'VOICE CHANNEL ................... ' + (voice === null ? '…' : voice ? 'ONLINE' : 'TEXT ONLY'), 'ALL SYSTEMS NOMINAL'];
  const [n, setN] = useState(0);
  useEffect(() => { const i = setInterval(() => setN((x) => x + 1), 380); const o = setTimeout(done, 2100); return () => { clearInterval(i); clearTimeout(o); }; }, [done]);
  return <div className="jv-boot" onClick={done}>{lines.slice(0, n).map((l, i) => <div key={i} className={i === lines.length - 1 ? 'last' : ''}>{l}</div>)}<span className="cur" /></div>;
}

export default function Jarvis() {
  const [panel, setPanel] = useState<JarvisPanel | null>(CLOUD ? null : DEMO_PANEL);
  const [err, setErr] = useState(''); const [mode, setMode] = useState<Mode>('idle');
  const [say, setSay] = useState(''); const [text, setText] = useState(''); const [history, setHistory] = useState<Turn[]>([]);
  const [full, setFull] = useState(false); const [muted, setMuted] = useState(false);
  const [view, setView] = useState<'console' | 'panels'>(() => pref('topmop-jarvis-view', 'console', ['console', 'panels']));
  const [theme, setTheme] = useState<ConsoleTheme>(() => pref('topmop-jarvis-theme', 'blue', ['blue', 'cyan']));
  const [booted, setBooted] = useState(() => { try { return sessionStorage.getItem(BOOT_KEY) === '1'; } catch { return false; } });
  const finishBoot = useCallback(() => { setBooted(true); try { sessionStorage.setItem(BOOT_KEY, '1'); } catch { /* fine */ } }, []);
  const root = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null); const ctx = useRef<AudioContext | null>(null); const analyser = useRef<AnalyserNode | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const raf = useRef(0);

  const load = useCallback(async () => {
    if (!CLOUD) return;
    try { setPanel(await call<JarvisPanel>({ action: 'panel' })); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach Jarvis.'); }
  }, []);
  useEffect(() => { void load(); const i = setInterval(() => void load(), 30_000); return () => clearInterval(i); }, [load]);
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);

  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); audio.current?.pause(); void ctx.current?.close(); }, []);
  const audioCtx = () => { if (!ctx.current) { const A = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; ctx.current = new A(); } if (ctx.current.state === 'suspended') void ctx.current.resume(); return ctx.current; };

  const speak = useCallback(async (reply: string) => {
    if (muted || !panel?.voice) { setMode('idle'); return; }
    try {
      const r = await fnFetch('jarvis', { body: JSON.stringify({ action: 'speak', text: reply }), headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error('voice');
      const url = URL.createObjectURL(await r.blob()); audio.current?.pause();
      const a = new Audio(url); audio.current = a; const c = audioCtx(); const src = c.createMediaElementSource(a); const an = c.createAnalyser(); an.fftSize = 128; src.connect(an); an.connect(c.destination); analyser.current = an;
      a.onended = () => { setMode('idle'); analyser.current = null; URL.revokeObjectURL(url); };
      setMode('speaking'); await a.play();
    } catch { setMode('idle'); analyser.current = null; }
  }, [muted, panel?.voice]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim(); if (!question) return;
    setMode('thinking'); setSay(''); setErr('');
    try {
      const { text: reply } = await call<{ text: string }>({ action: 'chat', text: question, history });
      setSay(reply); setHistory((h) => [...h, { role: 'user' as const, content: question }, { role: 'assistant' as const, content: reply }].slice(-8));
      await speak(reply);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Jarvis could not answer.'); setMode('idle'); }
  }, [history, speak]);

  const stopListening = () => { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); };
  const listen = async () => {
    if (!CLOUD) { const order: Mode[] = ['idle', 'listening', 'thinking', 'speaking']; const nx = order[(order.indexOf(mode) + 1) % 4]; setMode(nx); setSay(nx === 'speaking' ? 'Good morning. Two items need you: a discount request, and a handover still waiting for the client.' : ''); return; }
    if (mode === 'listening') return stopListening();
    if (!panel?.voice) { setErr('Voice needs a connected voice service. You can still type.'); return; }
    try {
      audio.current?.pause(); const c = audioCtx();
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = s;
      const an = c.createAnalyser(); an.fftSize = 128; c.createMediaStreamSource(s).connect(an); analyser.current = an;
      const chunks: Blob[] = []; const mr = new MediaRecorder(s); rec.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        s.getTracks().forEach((t) => t.stop()); analyser.current = null; setMode('thinking');
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const r = await fnFetch('jarvis', { body: blob, headers: { 'x-jarvis-action': 'transcribe', 'Content-Type': blob.type } });
          const j = await r.json().catch(() => ({})) as { text?: string; error?: string };
          if (!r.ok || j.error) throw new Error(j.error ?? 'I could not hear that.');
          if (!j.text) { setMode('idle'); setSay('Sorry, I could not make that out.'); return; }
          setText(''); await ask(j.text);
        } catch (e) { setErr(e instanceof Error ? e.message : 'I could not hear that.'); setMode('idle'); }
      };
      mr.start(); setMode('listening'); setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, 30_000);
    } catch { setErr('The microphone is blocked. Allow it in the browser, or type instead.'); setMode('idle'); }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); const q = text; setText(''); void ask(q); };
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void root.current?.requestFullscreen?.(); };

  const typed = useTypewriter(say);
  const S = useMemo(() => (panel ? summarize(panel) : null), [panel]);
  const cOut = useCount(S?.cash.outstanding ?? 0), cPipe = useCount(S?.pipeline.total ?? 0, 700);
  const clock = new Date().toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

  return (
    <div className={`jv ${full ? 'full' : ''} ${view === 'console' ? `is-console ${theme}` : ''}`} ref={root}>
      <style>{CSS}</style>
      <JarvisBackdrop /><div className="jv-scan" />
      {!booted && <Boot voice={panel ? panel.voice : null} live={CLOUD} done={finishBoot} />}
      <div className="jv-top"><span>J.A.R.V.I.S. · TOPMOP OPERATIONS</span><span className="jv-clock">{clock.toUpperCase()}</span>
        <span className="jv-acts"><button className={view === 'console' ? 'on' : ''} onClick={() => { setView('console'); savePref('topmop-jarvis-view', 'console'); }} title="Console view">Console</button><button className={view === 'panels' ? 'on' : ''} onClick={() => { setView('panels'); savePref('topmop-jarvis-view', 'panels'); }} title="Panels view">Panels</button>{view === 'console' && <button onClick={() => { const n = theme === 'blue' ? 'cyan' : 'blue'; setTheme(n); savePref('topmop-jarvis-theme', n); }} title="Change colour">◐</button>}<button onClick={() => void load()} title="Refresh">⟳</button><button onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute voice' : 'Mute voice'}>{muted ? '🔇' : '🔊'}</button><button onClick={toggleFull} title="Full screen">{full ? '⤡' : '⤢'}</button></span></div>
      {!CLOUD && <div className="jv-note">Demo data. On the live system Jarvis shows your real figures and talks.</div>}
      {err && <div className="jv-note err">{err}</div>}
      {view === 'console' && S && panel ? (
        <JarvisConsole S={S} panel={panel} mode={mode} analyser={analyser} theme={theme} typed={typed} say={say} idleHint={CLOUD ? 'Tap the core to talk, or type below.' : 'Tap the core to preview its states.'} text={text} setText={setText} submit={submit} onCore={() => void listen()} onBrief={() => void ask('Give me my brief for right now.')} busy={mode === 'thinking'} live={CLOUD} money={money} />
      ) : view === 'console' ? <div className="jv-note">Loading Jarvis…</div> : (
      <div className={`jv-grid ${booted ? 'in' : ''}`}>
        <div className="jv-col">
          <Panel title="NEEDS YOUR DECISION" tag={S ? (S.attention ? `${S.attention} ITEM${S.attention > 1 ? 'S' : ''}` : 'CLEAR') : ''}>
            {S?.decisions.map((d, i) => <div className="row" key={i}><span className={d.tone === 'warn' ? 'warn' : ''}>{d.label}</span><b>{d.value}</b></div>)}
          </Panel>
          <Panel title="TODAY'S JOBS" tag={S ? `${S.tomorrow} TOMORROW` : ''}>
            {S && !S.jobs.length && <div className="muted">Nothing scheduled today.</div>}
            {S?.jobs.slice(0, 7).map((j, i) => <div className="row" key={i}><span>{j.time} · {j.number}</span><b className={j.tone}>{j.note}</b></div>)}
          </Panel>
          <Panel title="HANDOVERS WAITING" tag={S ? `${S.handovers.length}` : ''}>
            {S && !S.handovers.length && <div className="muted">None. Every finished job is signed.</div>}
            {S?.handovers.slice(0, 5).map((h, i) => <div className="row" key={i}><span>{h.job}</span><b className="warn">{h.day ? fmtDate(h.day) : 'unsigned'}</b></div>)}
          </Panel>
          <Panel title="CREW TODAY">
            {S && <><div className="row"><span>Present</span><b>{S.crew.present}</b></div><div className="row"><span>Late</span><b className={S.crew.late.length ? 'warn' : ''}>{S.crew.late.length}</b></div><div className="row"><span>Absent</span><b className={S.crew.absent.length ? 'warn' : ''}>{S.crew.absent.length}</b></div></>}
          </Panel>
        </div>

        <div className="jv-center">
          <div className="jv-stage" ref={stage} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; e.currentTarget.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`); e.currentTarget.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`); }} onMouseLeave={(e) => { e.currentTarget.style.setProperty('--rx', '0deg'); e.currentTarget.style.setProperty('--ry', '0deg'); }}>
            <div className={`jv-core ${mode}`} onClick={() => void listen()} role="button" aria-label="Talk to Jarvis" title={CLOUD ? 'Tap to talk' : 'Tap to preview the states'}>
              <JarvisCore mode={mode} analyser={analyser} />
              <div className="jv-state">{STATUS[mode]}</div>
            </div>
          </div>
          <div className="jv-say">{typed || (mode === 'idle' ? (CLOUD ? 'Tap the core to talk, or type below.' : 'Tap the core to preview its states.') : '')}{mode === 'speaking' && typed.length < say.length && <span className="cur" />}</div>
          <form className="jv-bar" onSubmit={submit}>
            <button type="button" className={`mic ${mode === 'listening' ? 'on' : ''}`} onClick={() => void listen()} aria-label="Microphone">🎙</button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Jarvis…" disabled={mode === 'thinking'} />
            <button type="button" className="chip" onClick={() => void ask('Give me my brief for right now.')} disabled={mode === 'thinking' || !CLOUD}>Brief me</button>
            <button type="submit" className="chip" disabled={!text.trim() || mode === 'thinking'}>Send</button>
          </form>
        </div>

        <div className="jv-col">
          <Panel title="CASH" tag="APPROX.">
            {S && <><div className="big">{money(cOut)}</div><div className="small">outstanding on unpaid invoices</div>
              <div className="row"><span>Overdue ({S.cash.overdueCount})</span><b className={S.cash.overdue ? 'warn' : ''}>{money(S.cash.overdue)}</b></div>
              <div className="row"><span>Received today</span><b className="ok">{money(S.cash.today)}</b></div></>}
          </Panel>
          <Panel title="PIPELINE · LAST 24 H">
            {S && <><div className="big">{Math.round(cPipe)} <span className="small">new inquiries</span></div>
              {S.pipeline.stages.map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}
              <div className="row"><span>Quotes accepted · 7 days</span><b className="ok">{S.pipeline.approvedWeek}{S.pipeline.approvedValue ? ` · ${money(S.pipeline.approvedValue)}` : ''}</b></div></>}
          </Panel>
          <Panel title="TOMORROW" tag={S ? `${S.tomorrow} JOB${S.tomorrow === 1 ? '' : 'S'}` : ''}>
            {S && !S.tomorrowJobs.length && <div className="muted">{S.tomorrow ? 'Scheduled.' : 'Nothing scheduled.'}</div>}
            {S?.tomorrowJobs.slice(0, 5).map((j, i) => <div className="row" key={i}><span>{j.time} · {j.number}</span><b className={j.note === 'No leader' ? 'warn' : ''}>{j.note}</b></div>)}
          </Panel>
          <Panel title="ALERT LOG">
            {S && !S.alerts.length && <div className="muted">No alerts yet.</div>}
            {S?.alerts.slice(0, 6).map((a, i) => <div className="row" key={i}><span>{a.title}</span><b className="dim" title={`${fmtDate(a.when.slice(0, 10))} ${manilaClock(a.when)}`}>{ago(a.when)}</b></div>)}
          </Panel>
        </div>
      </div>
      )}
      {panel && view === 'panels' && <div className="jv-foot">Updated {manilaClock(panel.at)} · {panel.voice ? 'voice connected' : 'text only (no voice connected)'}</div>}
    </div>
  );
}

function Panel({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return <section className="jv-panel"><h4><span>{title}</span>{tag && <em>{tag}</em>}</h4>{children}</section>;
}

const CSS = `
.jv{--c:#35e0ff;position:relative;display:flex;flex-direction:column;min-height:calc(100vh - 60px);padding:18px 20px 22px;color:#bfefff;background:radial-gradient(ellipse at 50% 38%,#07334b 0,#04182a 48%,#010a12 100%);font-size:clamp(13px,calc(.35vw + .5vh + 6px),17px);line-height:1.45;overflow:hidden;isolation:isolate}
.jv:before{content:"";position:absolute;inset:0;z-index:-2;background-image:linear-gradient(rgba(0,200,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.045) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse at 50% 45%,#000 30%,transparent 80%)}
.jv:after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
.jv.is-console.blue{background:radial-gradient(ellipse at 50% 46%,#1a22d8 0,#0c0f9a 42%,#050760 100%)}.jv.is-console.blue:before{background-image:linear-gradient(rgba(160,190,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(160,190,255,.09) 1px,transparent 1px);background-size:48px 48px}.jv-acts button.on{background:rgba(120,150,255,.35);box-shadow:0 0 10px rgba(150,180,255,.5)}
.jv.full{position:fixed;inset:0;z-index:50;min-height:100vh}
.jv-backdrop{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
.jv-scan{position:absolute;left:0;right:0;height:140px;top:-140px;z-index:0;pointer-events:none;background:linear-gradient(to bottom,transparent,rgba(80,220,255,.07),transparent);animation:jvscan 9s linear infinite}
@keyframes jvscan{to{transform:translateY(calc(100vh + 200px))}}
.jv-top{position:relative;z-index:1;display:flex;gap:12px;justify-content:space-between;align-items:center;letter-spacing:.26em;font-size:11px;color:#59d6ff;flex-wrap:wrap;text-shadow:0 0 8px rgba(53,224,255,.6)}
.jv-acts{display:flex;gap:6px}.jv-acts button{background:rgba(2,30,48,.7);border:1px solid rgba(0,220,255,.45);color:#bfefff;border-radius:4px;padding:2px 9px;cursor:pointer;letter-spacing:0;transition:box-shadow .2s,background .2s}.jv-acts button:hover{box-shadow:0 0 12px rgba(53,224,255,.6);background:rgba(0,70,100,.7)}
.jv-note{position:relative;z-index:1;margin:10px 0 0;padding:6px 10px;border:1px solid rgba(255,200,87,.5);color:#ffe3a0;background:rgba(60,40,0,.35);border-radius:4px}.jv-note.err{border-color:rgba(255,120,120,.6);color:#ffb4b4;background:rgba(60,0,0,.35)}
.jv-grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(240px,clamp(280px,22vw,430px)) 1fr minmax(240px,clamp(280px,22vw,430px));gap:18px;margin-top:14px;align-items:center;flex:1}
.jv-col{display:grid;gap:14px;align-content:center}
.jv-panel{position:relative;border:1px solid rgba(0,220,255,.32);background:linear-gradient(160deg,rgba(6,46,70,.62),rgba(2,22,36,.55));backdrop-filter:blur(6px);box-shadow:inset 0 0 22px rgba(0,200,255,.10),0 0 22px rgba(0,160,220,.12);padding:11px 14px;border-radius:4px;opacity:0}
.jv-panel:before{content:"";position:absolute;left:-1px;top:-1px;width:16px;height:16px;border-left:2px solid var(--c);border-top:2px solid var(--c);filter:drop-shadow(0 0 4px var(--c))}
.jv-panel:after{content:"";position:absolute;right:-1px;bottom:-1px;width:16px;height:16px;border-right:2px solid var(--c);border-bottom:2px solid var(--c);filter:drop-shadow(0 0 4px var(--c))}
.jv-panel h4{margin:0 0 7px;font-size:.85em;letter-spacing:.2em;color:var(--c);font-weight:600;display:flex;justify-content:space-between;text-shadow:0 0 8px rgba(53,224,255,.7)}.jv-panel h4 em{font-style:normal;opacity:.7;letter-spacing:.1em}
.jv-grid.in .jv-col:first-child .jv-panel{animation:jvinL .7s cubic-bezier(.2,.8,.2,1) forwards}.jv-grid.in .jv-col:last-child .jv-panel{animation:jvinR .7s cubic-bezier(.2,.8,.2,1) forwards}
.jv-grid.in .jv-panel:nth-child(1){animation-delay:.15s}.jv-grid.in .jv-panel:nth-child(2){animation-delay:.35s}.jv-grid.in .jv-panel:nth-child(3){animation-delay:.55s}.jv-grid.in .jv-panel:nth-child(4){animation-delay:.75s}
@keyframes jvinL{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}@keyframes jvinR{from{opacity:0;transform:translateX(26px)}to{opacity:1;transform:none}}
.jv .row{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dashed rgba(0,220,255,.15)}.jv .row b{color:#fff;font-weight:600;text-align:right}
.jv .warn{color:#ffc857!important;text-shadow:0 0 8px rgba(255,200,87,.45)}.jv .ok{color:#5df0b0!important}.jv .dim{color:#7fb8c8!important;font-weight:400!important}.jv .muted,.jv .small{opacity:.7;font-size:.92em}.jv .big{font-size:2.15em;color:#fff;font-weight:300;letter-spacing:.03em;text-shadow:0 0 14px rgba(80,230,255,.7);font-variant-numeric:tabular-nums}
.jv-center{display:grid;justify-items:center;gap:12px;padding-top:2px}
.jv-stage{perspective:900px;display:grid;place-items:center;padding:20px}
.jv-core{position:relative;width:min(560px,46vh,78vw);min-width:260px;aspect-ratio:1;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out}
.jv-core:before{content:"";position:absolute;inset:-22%;border-radius:50%;background:radial-gradient(circle,rgba(40,200,255,.25),rgba(0,120,200,.08) 45%,transparent 66%);animation:jvhalo 5s ease-in-out infinite;pointer-events:none}
.jv-core.listening:before{background:radial-gradient(circle,rgba(60,255,190,.28),rgba(0,160,120,.08) 45%,transparent 66%);animation-duration:1.6s}
.jv-core.thinking:before{background:radial-gradient(circle,rgba(255,196,80,.2),rgba(0,140,220,.1) 45%,transparent 66%);animation-duration:1.1s}
.jv-core.speaking:before{background:radial-gradient(circle,rgba(150,245,255,.34),rgba(0,160,230,.12) 45%,transparent 66%);animation-duration:.9s}
@keyframes jvhalo{0%,100%{transform:scale(.94);opacity:.8}50%{transform:scale(1.08);opacity:1}}
.jv-canvas{position:relative;width:100%;height:100%;display:block}
.jv-state{position:absolute;left:0;right:0;bottom:-10px;text-align:center;letter-spacing:.34em;font-size:11px;color:#8be9ff;text-shadow:0 0 10px rgba(53,224,255,.8)}.jv-state:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#35e0ff;margin-right:10px;vertical-align:middle;box-shadow:0 0 8px #35e0ff;animation:jvblink 1.4s infinite}
@keyframes jvblink{50%{opacity:.25}}
.jv-say{min-height:48px;max-width:min(760px,100%);text-align:center;font-size:1.22em;color:#e8fbff;text-shadow:0 0 12px rgba(0,200,255,.55)}
.cur{display:inline-block;width:8px;height:1em;margin-left:3px;vertical-align:-2px;background:#7be9ff;box-shadow:0 0 8px #35e0ff;animation:jvblink .8s steps(2) infinite}
.jv-bar{display:flex;gap:8px;align-items:center;width:min(720px,100%);border:1px solid rgba(0,220,255,.45);border-radius:26px;padding:6px 8px;background:rgba(2,30,48,.72);box-shadow:0 0 24px rgba(0,180,255,.15),inset 0 0 14px rgba(0,200,255,.08);transition:box-shadow .2s}.jv-bar:focus-within{box-shadow:0 0 30px rgba(53,224,255,.4),inset 0 0 14px rgba(0,200,255,.12)}
.jv .jv-bar input{flex:1;min-width:0;background:transparent!important;border:0!important;box-shadow:none!important;outline:0;color:#e8fbff;font-size:14px;padding:6px 4px}.jv-bar input::placeholder{color:#59a8bb}
.jv-bar .mic{width:38px;height:38px;border-radius:50%;border:1px solid rgba(0,220,255,.55);background:rgba(0,60,90,.6);color:#fff;cursor:pointer;font-size:16px;transition:box-shadow .2s}.jv-bar .mic:hover{box-shadow:0 0 14px rgba(53,224,255,.7)}.jv-bar .mic.on{background:#1aa37a;border-color:#5df0b0;animation:jvhalo 1s infinite}
.jv-bar .chip{border:1px solid rgba(0,220,255,.5);background:rgba(0,60,90,.6);color:#bfefff;border-radius:16px;padding:5px 12px;cursor:pointer;font-size:12px;transition:box-shadow .2s}.jv-bar .chip:hover:not(:disabled){box-shadow:0 0 12px rgba(53,224,255,.6)}.jv-bar .chip:disabled{opacity:.4;cursor:default}
.jv-foot{position:relative;z-index:1;margin-top:10px;text-align:center;font-size:11px;letter-spacing:.15em;opacity:.55}
.jv-boot{position:absolute;inset:0;z-index:5;background:#010a12;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:0 12%;gap:8px;font:13px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.14em;color:#59d6ff;text-shadow:0 0 8px rgba(53,224,255,.7);cursor:pointer;animation:jvboot 2.2s forwards}.jv-boot .last{color:#5df0b0}
@keyframes jvboot{0%,86%{opacity:1}100%{opacity:0;visibility:hidden}}
@media (max-width:600px){.jv-bar{gap:5px;padding:5px}.jv-bar .chip{padding:5px 9px}.jv-bar .mic{width:34px;height:34px}}
@media (max-width:1000px){.jv-grid{grid-template-columns:1fr;align-items:start}.jv-col{align-content:start}.jv-center{order:-1}.jv-clock{display:none}.jv-boot{padding:0 8%}}
@media (prefers-reduced-motion:reduce){.jv-scan,.jv-core:before,.jv-state:before,.cur{animation:none}.jv-panel{opacity:1!important;animation:none!important}.jv-boot{animation:none;display:none}}
`;
