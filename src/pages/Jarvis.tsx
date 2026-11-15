// Jarvis: the owner's command-center screen. A glowing core that pulses while Jarvis listens and speaks, live panels from the business, and a way to talk to it.
// Live system: figures, answers and the voice come from the `jarvis` Edge Function (owner login only, read-only). The demo build shows sample figures.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLOUD, fnFetch } from '@/lib/cloud';
import { DEMO_PANEL, ago, manilaClock, summarize, type JarvisPanel } from '@/lib/jarvisview';
import { fmtDate } from '@/lib/util';

const money = (n: number) => `₱${Math.round(n || 0).toLocaleString('en-PH')}`;

type Mode = 'idle' | 'listening' | 'thinking' | 'speaking';
type Turn = { role: 'user' | 'assistant'; content: string };
const STATUS: Record<Mode, string> = { idle: 'STANDING BY', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING' };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fnFetch('jarvis', { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({})) as T & { error?: string };
  if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? `Jarvis answered ${r.status}`);
  return j;
}

export default function Jarvis() {
  const [panel, setPanel] = useState<JarvisPanel | null>(CLOUD ? null : DEMO_PANEL);
  const [err, setErr] = useState(''); const [mode, setMode] = useState<Mode>('idle');
  const [say, setSay] = useState(''); const [text, setText] = useState(''); const [history, setHistory] = useState<Turn[]>([]);
  const [full, setFull] = useState(false); const [muted, setMuted] = useState(false);
  const root = useRef<HTMLDivElement>(null); const core = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null); const ctx = useRef<AudioContext | null>(null); const analyser = useRef<AnalyserNode | null>(null);
  const rec = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const raf = useRef(0);

  const load = useCallback(async () => {
    if (!CLOUD) return;
    try { setPanel(await call<JarvisPanel>({ action: 'panel' })); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach Jarvis.'); }
  }, []);
  useEffect(() => { void load(); const i = setInterval(() => void load(), 60_000); return () => clearInterval(i); }, [load]);
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);

  /** The core breathes with the sound level (microphone while listening, Jarvis's voice while speaking). */
  const pulse = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const buf = new Uint8Array(64);
    const tick = () => {
      let lvl = 0;
      if (analyser.current) { analyser.current.getByteFrequencyData(buf); lvl = buf.reduce((s, v) => s + v, 0) / buf.length / 160; }
      core.current?.style.setProperty('--lvl', String(Math.min(1, lvl).toFixed(3)));
      raf.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);
  useEffect(() => { pulse(); return () => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); audio.current?.pause(); void ctx.current?.close(); }; }, [pulse]);
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
    if (mode === 'listening') return stopListening();
    if (!CLOUD || !panel?.voice) { setErr('Voice needs the live system and a connected voice. You can still type.'); return; }
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

  const S = useMemo(() => (panel ? summarize(panel) : null), [panel]);
  const clock = new Date().toLocaleString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

  return (
    <div className={`jv ${full ? 'full' : ''}`} ref={root}>
      <style>{CSS}</style>
      <div className="jv-top"><span>J.A.R.V.I.S. · TOPMOP OPERATIONS</span><span className="jv-clock">{clock.toUpperCase()}</span>
        <span className="jv-acts"><button onClick={() => void load()} title="Refresh">⟳</button><button onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute voice' : 'Mute voice'}>{muted ? '🔇' : '🔊'}</button><button onClick={toggleFull} title="Full screen">{full ? '⤡' : '⤢'}</button></span></div>
      {!CLOUD && <div className="jv-note">Demo data. On the live system Jarvis shows your real figures and talks.</div>}
      {err && <div className="jv-note err">{err}</div>}
      <div className="jv-grid">
        <div className="jv-col">
          <Panel title="NEEDS YOUR DECISION" tag={S ? (S.attention ? `${S.attention} ITEM${S.attention > 1 ? 'S' : ''}` : 'CLEAR') : ''}>
            {S?.decisions.map((d, i) => <div className="row" key={i}><span className={d.tone === 'warn' ? 'warn' : ''}>{d.label}</span><b>{d.value}</b></div>)}
          </Panel>
          <Panel title="TODAY'S JOBS" tag={S ? `${S.tomorrow} TOMORROW` : ''}>
            {S && !S.jobs.length && <div className="muted">Nothing scheduled today.</div>}
            {S?.jobs.slice(0, 7).map((j, i) => <div className="row" key={i}><span>{j.time} · {j.number}</span><b className={j.tone}>{j.note}</b></div>)}
          </Panel>
          <Panel title="CREW TODAY">
            {S && <><div className="row"><span>Present</span><b>{S.crew.present}</b></div><div className="row"><span>Late</span><b className={S.crew.late.length ? 'warn' : ''}>{S.crew.late.length}</b></div><div className="row"><span>Absent</span><b className={S.crew.absent.length ? 'warn' : ''}>{S.crew.absent.length}</b></div></>}
          </Panel>
        </div>

        <div className="jv-center">
          <div className={`jv-core ${mode}`} ref={core} onClick={() => void listen()} role="button" aria-label="Talk to Jarvis" title="Tap to talk">
            <svg viewBox="-150 -150 300 300"><defs><radialGradient id="jvg"><stop offset="0" stopColor="#f1feff" /><stop offset=".28" stopColor="#6be9ff" /><stop offset="1" stopColor="#0090c8" stopOpacity="0" /></radialGradient></defs>
              <circle className="r1" r="140" fill="none" stroke="#1db8e0" strokeOpacity=".5" strokeDasharray="3 6" />
              <circle className="r2" r="120" fill="none" stroke="#35e0ff" strokeWidth="3" strokeDasharray="60 20 10 20" opacity=".85" />
              <circle className="r3" r="98" fill="none" stroke="#1db8e0" strokeWidth="1.5" strokeDasharray="4 4" />
              <circle className="r4" r="80" fill="none" stroke="#35e0ff" strokeWidth="6" strokeDasharray="30 12" opacity=".9" />
              <g className="glow"><circle r="64" fill="url(#jvg)" /><circle r="40" fill="url(#jvg)" /><circle r="14" fill="#fff" /></g></svg>
            <div className="jv-state">{STATUS[mode]}</div>
          </div>
          <div className="jv-say">{say || (mode === 'idle' ? 'Tap the core to talk, or type below.' : '')}</div>
          <form className="jv-bar" onSubmit={submit}>
            <button type="button" className={`mic ${mode === 'listening' ? 'on' : ''}`} onClick={() => void listen()} aria-label="Microphone">🎙</button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Jarvis… (jobs tomorrow, who has not paid, brief me)" disabled={mode === 'thinking'} />
            <button type="button" className="chip" onClick={() => void ask('Give me my brief for right now.')} disabled={mode === 'thinking' || !CLOUD}>Brief me</button>
            <button type="submit" className="chip" disabled={!text.trim() || mode === 'thinking'}>Send</button>
          </form>
        </div>

        <div className="jv-col">
          <Panel title="CASH" tag="APPROX.">
            {S && <><div className="big">{money(S.cash.outstanding)}</div><div className="small">outstanding on unpaid invoices</div>
              <div className="row"><span>Overdue ({S.cash.overdueCount})</span><b className={S.cash.overdue ? 'warn' : ''}>{money(S.cash.overdue)}</b></div>
              <div className="row"><span>Received today</span><b className="ok">{money(S.cash.today)}</b></div></>}
          </Panel>
          <Panel title="PIPELINE · LAST 24 H">
            {S && <><div className="big">{S.pipeline.total} <span className="small">new inquiries</span></div>
              {S.pipeline.stages.map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}
              <div className="row"><span>Quotes accepted · 7 days</span><b className="ok">{S.pipeline.approvedWeek}{S.pipeline.approvedValue ? ` · ${money(S.pipeline.approvedValue)}` : ''}</b></div></>}
          </Panel>
          <Panel title="ALERT LOG">
            {S && !S.alerts.length && <div className="muted">No alerts yet.</div>}
            {S?.alerts.slice(0, 6).map((a, i) => <div className="row" key={i}><span>{a.title}</span><b className="dim" title={`${fmtDate(a.when.slice(0, 10))} ${manilaClock(a.when)}`}>{ago(a.when)}</b></div>)}
          </Panel>
        </div>
      </div>
      {panel && <div className="jv-foot">Updated {manilaClock(panel.at)} · {panel.voice ? 'voice connected' : 'text only (no voice connected)'}</div>}
    </div>
  );
}

function Panel({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return <section className="jv-panel"><h4><span>{title}</span>{tag && <em>{tag}</em>}</h4>{children}</section>;
}

const CSS = `
.jv{--c:#35e0ff;position:relative;min-height:calc(100vh - 60px);padding:18px 20px 22px;color:#bfefff;background:radial-gradient(ellipse at 50% 35%,#06263a 0,#03121d 55%,#010a10 100%);font-size:13px;line-height:1.45;overflow:hidden}
.jv:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(0,200,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.05) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.jv.full{position:fixed;inset:0;z-index:50;min-height:100vh}
.jv-top{position:relative;display:flex;gap:12px;justify-content:space-between;align-items:center;letter-spacing:.24em;font-size:11px;color:#59d6ff;flex-wrap:wrap}
.jv-acts{display:flex;gap:6px}.jv-acts button{background:rgba(2,30,48,.7);border:1px solid rgba(0,220,255,.45);color:#bfefff;border-radius:4px;padding:2px 9px;cursor:pointer;letter-spacing:0}
.jv-note{position:relative;margin:10px 0 0;padding:6px 10px;border:1px solid rgba(255,200,87,.5);color:#ffe3a0;background:rgba(60,40,0,.35);border-radius:4px}.jv-note.err{border-color:rgba(255,120,120,.6);color:#ffb4b4;background:rgba(60,0,0,.35)}
.jv-grid{position:relative;display:grid;grid-template-columns:minmax(240px,300px) 1fr minmax(240px,300px);gap:16px;margin-top:14px;align-items:start}
.jv-col{display:grid;gap:14px}
.jv-panel{position:relative;border:1px solid rgba(0,220,255,.4);background:rgba(2,30,48,.55);box-shadow:inset 0 0 18px rgba(0,200,255,.12);padding:11px 14px;border-radius:4px}
.jv-panel:before{content:"";position:absolute;left:-1px;top:-1px;width:14px;height:14px;border-left:2px solid var(--c);border-top:2px solid var(--c)}
.jv-panel:after{content:"";position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;border-right:2px solid var(--c);border-bottom:2px solid var(--c)}
.jv-panel h4{margin:0 0 7px;font-size:11px;letter-spacing:.2em;color:var(--c);font-weight:600;display:flex;justify-content:space-between}.jv-panel h4 em{font-style:normal;opacity:.7;letter-spacing:.1em}
.jv .row{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dashed rgba(0,220,255,.15)}.jv .row b{color:#fff;font-weight:600;text-align:right}
.jv .warn{color:#ffc857!important}.jv .ok{color:#5df0b0!important}.jv .dim{color:#7fb8c8!important;font-weight:400!important}.jv .muted,.jv .small{opacity:.7;font-size:12px}.jv .big{font-size:26px;color:#fff;font-weight:300;letter-spacing:.03em}
.jv-center{display:grid;justify-items:center;gap:12px;padding-top:6px}
.jv-core{--lvl:0;position:relative;width:min(320px,80vw);aspect-ratio:1;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
.jv-core svg{width:100%;height:100%;overflow:visible}
.jv-core .glow{transform-origin:center;transform:scale(calc(1 + var(--lvl) * .45));filter:drop-shadow(0 0 calc(10px + var(--lvl) * 30px) rgba(80,230,255,.9));transition:transform .06s linear}
.jv-core .r1{animation:jvspin 60s linear infinite}.jv-core .r2{animation:jvspin 28s linear infinite reverse}.jv-core .r3{animation:jvspin 40s linear infinite}.jv-core .r4{animation:jvspin 16s linear infinite reverse}
.jv-core.thinking .r2{animation-duration:4s}.jv-core.thinking .r4{animation-duration:2.5s}.jv-core.listening .glow{filter:drop-shadow(0 0 22px rgba(120,255,200,.95))}
.jv-core.idle .glow{animation:jvbreath 4s ease-in-out infinite}
@keyframes jvspin{to{transform:rotate(360deg)}}@keyframes jvbreath{50%{transform:scale(1.07)}}
.jv-core svg circle{transform-origin:center;transform-box:fill-box}
.jv-state{position:absolute;left:0;right:0;bottom:-6px;text-align:center;letter-spacing:.3em;font-size:11px;color:#59d6ff}
.jv-say{min-height:46px;max-width:620px;text-align:center;font-size:16px;color:#e8fbff;text-shadow:0 0 12px rgba(0,200,255,.55)}
.jv-bar{display:flex;gap:8px;align-items:center;width:min(640px,100%);border:1px solid rgba(0,220,255,.45);border-radius:24px;padding:6px 8px 6px 8px;background:rgba(2,30,48,.7)}
.jv .jv-bar input{flex:1;min-width:0;background:transparent!important;border:0!important;box-shadow:none!important;outline:0;color:#e8fbff;font-size:14px;padding:6px 4px}.jv-bar input::placeholder{color:#59a8bb}
.jv-bar .mic{width:36px;height:36px;border-radius:50%;border:1px solid rgba(0,220,255,.55);background:rgba(0,60,90,.6);color:#fff;cursor:pointer;font-size:16px}.jv-bar .mic.on{background:#1aa37a;border-color:#5df0b0;animation:jvbreath 1s infinite}
.jv-bar .chip{border:1px solid rgba(0,220,255,.5);background:rgba(0,60,90,.6);color:#bfefff;border-radius:16px;padding:5px 12px;cursor:pointer;font-size:12px}.jv-bar .chip:disabled{opacity:.4;cursor:default}
.jv-foot{position:relative;margin-top:14px;text-align:center;font-size:11px;letter-spacing:.15em;opacity:.55}
@media (max-width:1000px){.jv-grid{grid-template-columns:1fr}.jv-center{order:-1}.jv-clock{display:none}}
@media (prefers-reduced-motion:reduce){.jv-core .r1,.jv-core .r2,.jv-core .r3,.jv-core .r4,.jv-core.idle .glow{animation:none}}
`;
