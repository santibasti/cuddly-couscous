// TOPMOP AI Headquarters: the owner's view of the automated desks of the business as a living office. LIVE = real events written by the database as things happen (and restored on load).
// DEMO MODE = a clearly labelled sample scenario with Start / Pause / Reset; it sends, books and saves nothing. Departments with no real feed yet are marked PLANNED.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CLOUD, supabase } from '@/lib/cloud';
import { useAuth } from '@/lib/store';
import { HqStudio } from '@/components/HqStudio';
import { HqCinematic } from '@/components/HqCinematic';
import { RobotAvatar } from '@/components/HqOffice';
import { AGENTS, DEPTS, STATE_LABEL, agentByKey, agentState, deptByKey, mergeEvents, roomKpis, type DeptKey, type HqEvent, type Kpi } from '@/lib/hq';
import { SCENARIO_LENGTH, scenarioCaption, scenarioEvents } from '@/lib/hqscenario';
import { STEPS, flowCards, stepDef } from '@/lib/leadflow';
import { ago } from '@/lib/jarvisview';

type Look = 'studio' | 'cinematic' | 'list';
type Rt = 'connecting' | 'live' | 'reconnecting' | 'off';
const KIND_ICON: Record<string, string> = { start: '▶', done: '✓', fail: '✖', approval: '⏸', message: '⇄', info: '•' };
const HOUR = 3_600_000;
const SAMPLE: Partial<Record<DeptKey, Kpi[]>> = {
  desk: [{ label: 'Inquiries · 24 h', value: '3' }, { label: 'This week', value: '12' }], booking: [{ label: 'Bookings · month', value: '38' }, { label: 'Quotes out', value: '7' }, { label: 'Jobs today', value: '4' }],
  hr: [{ label: 'Active staff', value: '15' }, { label: 'Present today', value: '13' }], creative: [{ label: 'Post events today', value: '2' }, { label: 'Published today', value: '1' }], hub: [{ label: 'Events today', value: '9' }, { label: 'Jarvis actions', value: '3' }],
};
const refLink = (ref?: string | null) => (!ref ? undefined : /^JOB/i.test(ref) ? '/jobs' : /^(QT|DR|JO)/i.test(ref) ? '/flow' : undefined);

export default function Headquarters() {
  const { db, can } = useAuth(); const reduce = useReducedMotion();
  const [live, setLive] = useState<HqEvent[]>([]); const [loaded, setLoaded] = useState(!CLOUD); const [err, setErr] = useState(''); const [rt, setRt] = useState<Rt>(CLOUD ? 'connecting' : 'off');
  const [demo, setDemo] = useState(!CLOUD); const [sc, setSc] = useState({ status: 'idle' as 'idle' | 'running' | 'paused' | 'done', base: Date.now(), elapsed: 0 });
  const root = useRef<HTMLDivElement>(null); const [full, setFull] = useState(false);
  const [now, setNow] = useState(Date.now()); const [look, setLook] = useState<Look>('studio'); const [still, setStill] = useState(false);
  const [sel, setSel] = useState(''); const [focus, setFocus] = useState(''); const [openQ, setOpenQ] = useState(false); const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 760);
  useEffect(() => { const f = () => setMobile(window.innerWidth < 760); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  // full view: the real browser full screen when it is available, otherwise the page itself covers the whole window
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const toggleFull = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => undefined); return; }
    if (full) { setFull(false); return; }
    try { if (root.current?.requestFullscreen) { await root.current.requestFullscreen(); return; } } catch { /* fall back to covering the window */ }
    setFull(true);
  };
  useEffect(() => { if (mobile && !focus) setFocus('desk'); }, [mobile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (full && !document.fullscreenElement) { setFull(false); return; } setSel(''); setOpenQ(false); if (!mobile) setFocus(''); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [mobile, focus, full]);

  // real events: the last 24 hours restored on load, then live inserts. After any reconnect the last 24 hours are fetched again, so nothing missed stays missing; events keep their own time.
  useEffect(() => {
    if (!CLOUD) return; let on = true;
    const load = async () => {
      const { data, error } = await supabase().from('agent_events').select('id, at, agent, dept, kind, title, ref, to_agent').gte('at', new Date(Date.now() - 24 * HOUR).toISOString()).order('at', { ascending: false }).limit(300);
      if (!on) return; if (error) setErr(error.message); else { setErr(''); setLive((cur) => mergeEvents(cur, data as HqEvent[])); } setLoaded(true);
    };
    void load(); const i = setInterval(() => void load(), 60_000);
    const ch = supabase().channel('hq-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_events' }, (p) => { setLive((cur) => mergeEvents(cur, [p.new as HqEvent])); })
      .subscribe((status) => { if (!on) return; if (status === 'SUBSCRIBED') { setRt('live'); void load(); } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRt('reconnecting'); else if (status === 'CLOSED') setRt('reconnecting'); });
    return () => { on = false; clearInterval(i); void supabase().removeChannel(ch); };
  }, []);
  // the demo scenario has its own clock that can be paused
  useEffect(() => {
    if (!demo || sc.status !== 'running') return; const i = setInterval(() => setSc((s) => (s.status !== 'running' ? s : s.elapsed + 100 >= SCENARIO_LENGTH ? { ...s, elapsed: SCENARIO_LENGTH, status: 'done' } : { ...s, elapsed: s.elapsed + 100 })), 100); return () => clearInterval(i);
  }, [demo, sc.status]);

  const clock = demo ? sc.base + sc.elapsed : now;
  const events = useMemo(() => (demo ? scenarioEvents(sc.base, sc.elapsed) : live.filter((e) => Date.parse(e.at) <= now + 100)), [demo, sc.base, sc.elapsed, live, now]);
  const views = useMemo(() => Object.fromEntries(AGENTS.map((a) => [a.key, agentState(a.key, events, clock)])), [events, clock]);
  const kpis = useMemo(() => (demo ? SAMPLE : roomKpis(db as never, events, clock)), [demo, db, events, Math.floor(clock / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const flow = useMemo(() => (demo ? [] : flowCards(db, now).filter((c) => !c.stale && stepDef(c.step).gate)), [demo, db, Math.floor(now / 30000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date(clock).toISOString().slice(0, 10);
  const stats = { busy: AGENTS.filter((a) => ['working', 'received', 'coordinating'].includes(views[a.key].state)).length, awaiting: AGENTS.filter((a) => views[a.key].state === 'awaiting').length, problems: AGENTS.filter((a) => views[a.key].state === 'error').length, today: events.filter((e) => e.at.slice(0, 10) === today).length, connected: AGENTS.filter((a) => a.live).length };
  const feed = events.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const agent = sel ? agentByKey(sel) : undefined; const dept = focus ? deptByKey(focus) : undefined; const panel = agent ? 'agent' : dept && openQ && look !== 'list' ? 'dept' : '';
  const waiting = [...AGENTS.filter((a) => views[a.key].state === 'awaiting').map((a) => ({ key: `a-${a.key}`, text: `${a.name}: ${views[a.key].event?.title ?? 'waiting for approval'}`, to: demo ? undefined : '/flow' })), ...flow.slice(0, 3).map((c) => ({ key: `f-${c.id}`, text: `${c.client} · ${stepDef(c.step).label}`, to: '/flow' }))];
  const nothingReal = CLOUD && !demo && loaded && !live.length;

  const queue = (d: DeptKey): { items: { text: string; sub?: string; to?: string }[]; note: string; to?: string; toLabel?: string } => {
    const mates = AGENTS.filter((a) => a.dept === d); const live2 = mates.some((a) => a.live);
    if (demo) { const items = events.filter((e) => e.dept === d && ['approval', 'start', 'done', 'info'].includes(e.kind)).slice(0, 4).map((e) => ({ text: e.title, sub: 'sample' })); return { items, note: live2 ? 'Sample queue (demo mode).' : 'Planned: not connected yet.' }; }
    const cards = flow.length || true ? flowCards(db, now).filter((c) => !c.stale) : [];
    if (d === 'desk') return { items: cards.filter((c) => c.step === 'new').slice(0, 6).map((c) => ({ text: `${c.client} · ${c.service}`, sub: `${c.place} · ${c.ageH} h`, to: '/flow' })), note: 'New inquiries waiting for a quotation.', to: '/flow', toLabel: 'Open Lead Flow' };
    if (d === 'booking') return { items: cards.filter((c) => ['quote', 'confirm', 'book', 'order'].includes(c.step)).slice(0, 6).map((c) => ({ text: `${c.client} · ${STEPS.find((s) => s.key === c.step)?.short}`, sub: c.number, to: '/flow' })), note: 'Quotations and bookings waiting for you.', to: '/flow', toLabel: 'Open Lead Flow' };
    if (d === 'creative') return { items: events.filter((e) => e.dept === 'creative').slice(0, 5).map((e) => ({ text: e.title, sub: ago(e.at, now) })), note: 'Post drafts and published posts.', to: '/marketing', toLabel: 'Open Marketing AI' };
    if (d === 'hub') return { items: events.filter((e) => e.agent === 'jarvis').slice(0, 6).map((e) => ({ text: e.title, sub: ago(e.at, now) })), note: 'What JARVIS did recently.', to: '/jarvis', toLabel: 'Open Jarvis' };
    return { items: [], note: 'Planned: this department has no real feed yet, so there is nothing to work on.' };
  };

  return (
    <div className={`hqp ${full ? 'full' : ''}`} ref={root}>
      <style>{CSS}</style>
      <header className="hqp-top">
        <div className="hqp-brand"><div className="mark">AI</div><div className="ttl">TOPMOP <b>AI AGENT</b><small>HEADQUARTERS · VIRTUAL OPERATIONS</small></div></div>
        <div className="hqp-actions">
          <span className={`mode ${demo ? 'demo' : 'live'}`} role="status">{demo ? 'DEMO MODE · sample data, nothing is sent' : 'LIVE · real activity'}</span>
          {CLOUD && <span className={`rt ${rt}`} title="Connection for live updates"><i />{rt === 'live' ? 'Realtime' : rt === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span>}
          {CLOUD && <button className="b" onClick={() => setDemo((d) => !d)}>{demo ? 'Show live' : 'Demo mode'}</button>}
          <div className="seg" role="tablist" aria-label="View">{(['studio', 'cinematic', 'list'] as Look[]).map((l) => <button key={l} role="tab" aria-selected={look === l} className={look === l ? 'on' : ''} onClick={() => setLook(l)}>{l === 'studio' ? '🏢 Studio' : l === 'cinematic' ? '🎬 Cinematic' : '📋 List'}</button>)}</div>
          <button className="b" onClick={() => setStill((s) => !s)} aria-pressed={still}>{still ? '▶ Resume motion' : '⏸ Pause motion'}</button>
          <button className="b" onClick={() => void toggleFull()} aria-pressed={full} title="Show the headquarters on the whole screen">{full ? '⤡ Exit full view' : '⤢ Full view'}</button>
        </div>
      </header>

      {demo && (
        <div className="hqp-demo">
          <div className="ctl"><button className="b primary" onClick={() => setSc({ status: 'running', base: Date.now(), elapsed: 0 })}>{sc.status === 'idle' ? '▶ Start sample inquiry' : '↻ Restart'}</button>
            <button className="b" disabled={sc.status !== 'running' && sc.status !== 'paused'} onClick={() => setSc((s) => ({ ...s, status: s.status === 'running' ? 'paused' : 'running' }))}>{sc.status === 'paused' ? '▶ Resume' : '⏸ Pause'}</button>
            <button className="b" onClick={() => setSc({ status: 'idle', base: Date.now(), elapsed: 0 })}>⟲ Reset</button></div>
          <div className="cap" aria-live="polite">{scenarioCaption(sc.status === 'idle' ? -1 : sc.elapsed)}</div>
          <div className="bar"><i style={{ width: `${Math.min(100, (sc.elapsed / SCENARIO_LENGTH) * 100)}%` }} /></div>
        </div>
      )}
      {err && <div className="alert warn">Could not load activity: {err}. Has the latest database update (migration 0119) been applied?</div>}
      {nothingReal && <div className="alert">No real activity yet. It appears here as inquiries, quotations, bookings, posts and Jarvis actions happen. Use “Demo mode” to see a sample.</div>}

      {mobile && look !== 'list' && <div className="hqp-sel" role="tablist" aria-label="Department">{DEPTS.map((d) => <button key={d.key} role="tab" aria-selected={focus === d.key} className={focus === d.key ? 'on' : ''} onClick={() => { setFocus(d.key); setOpenQ(false); setSel(''); }}>{d.icon} {d.name.split(' ')[0]}</button>)}</div>}

      <div className="hqp-body"><div className="hqp-main">
      <div className="hqp-stagebox">
      {look === 'studio' && <HqStudio demo={demo} events={events} views={views} kpis={kpis} now={clock} focus={focus} selectedAgent={sel} still={still} hold={demo && sc.status === 'paused'} mobile={mobile} inset={panel && !mobile ? 400 : 0} onPickDept={(d) => { setFocus(d); setOpenQ(!!d); setSel(''); }} onPickAgent={(k) => { setSel(sel === k ? '' : k); }} />}
      {look === 'cinematic' && <HqCinematic demo={demo} events={events} views={views} kpis={kpis} now={clock} selected={focus} onPick={(d) => { setFocus(d); setOpenQ(!!d); setSel(''); }} onPickAgent={(k) => { setSel(sel === k ? '' : k); }} still={still} />}
      </div>
      {mobile && look !== 'list' && focus && !openQ && !sel && <div className="hqp-back"><button className="b primary" onClick={() => setOpenQ(true)}>Open the {dept?.name} work queue</button></div>}
      {look === 'studio' && focus && !mobile && <div className="hqp-back"><button className="b" onClick={() => { setFocus(''); setOpenQ(false); }}>← Back to the whole office</button></div>}

      {look === 'list' && (
        <div className="hqp-list">
          <div className="card" style={{ overflowX: 'auto' }}><table className="tbl compact"><caption className="muted small" style={{ textAlign: 'left', padding: 8 }}>Every agent, what it is doing and whether it is connected. This is the same information as the animated office.</caption>
            <thead><tr><th>Agent</th><th>Role</th><th>Department</th><th>Status</th><th>Last activity</th><th>Connection</th></tr></thead>
            <tbody>{AGENTS.map((a) => { const v = views[a.key]; return <tr key={a.key} onClick={() => setSel(a.key)} style={{ cursor: 'pointer' }}><td><b>{a.name}</b></td><td>{a.role}</td><td>{deptByKey(a.dept)?.name}</td><td>{STATE_LABEL[v.state]}</td><td>{v.event ? <>{v.event.title} <span className="muted small">({ago(v.event.at, clock)})</span></> : <span className="muted">—</span>}</td><td>{a.live ? <span className="tag on">Connected</span> : <span className="tag">Planned</span>}</td></tr>; })}</tbody></table></div>
          <div className="card hqp-pad"><b>Activity</b><ul className="feed">{feed.slice(0, 40).map((e) => <li key={e.id}><span className={`k-${e.kind}`}>{KIND_ICON[e.kind]}</span><div><b>{agentByKey(e.agent)?.name ?? e.agent}</b> <span className="muted">({deptByKey(e.dept)?.name})</span> · {e.title}{e.to_agent ? <> → <b>{agentByKey(e.to_agent)?.name}</b></> : ''}<small>{new Date(e.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · {ago(e.at, clock)}</small></div></li>)}{!feed.length && <li className="muted">No activity yet.</li>}</ul></div>
        </div>
      )}

      </div>
      <footer className="hqp-strip">
        <div className="blk grow"><span className="lbl">ACTIVITY{demo ? ' · SAMPLE' : ''}</span><div className="ticker">{feed.slice(0, 3).map((e) => <div key={e.id}><span className={`k-${e.kind}`}>{KIND_ICON[e.kind]}</span> <b>{agentByKey(e.agent)?.name}</b> {e.title} <small>{ago(e.at, clock)}</small></div>)}{!feed.length && <div className="muted">Nothing yet.</div>}</div></div>
        <div className="blk"><span className="lbl">WAITING FOR YOU · {waiting.length}</span><div className="ticker">{waiting.slice(0, 3).map((w) => w.to && can('sales.view') ? <Link key={w.key} to={w.to} className="wi">⏸ {w.text}</Link> : <div key={w.key} className="wi">⏸ {w.text}</div>)}{!waiting.length && <div className="muted">Nothing is waiting for you.</div>}</div></div>
        <div className="blk"><span className="lbl">STATUS</span><div className="ticker"><div><b>{stats.busy}</b> busy · <b>{stats.awaiting}</b> waiting · <b className={stats.problems ? 'bad' : ''}>{stats.problems}</b> problems</div><div><b>{stats.connected}/{AGENTS.length}</b> agents connected · <b>{stats.today}</b> events today</div></div></div>
      </footer></div>

      <AnimatePresence>
        {panel && (
          <motion.aside key={`${panel}-${sel || focus}`} className="hqp-slide" role="dialog" aria-label={panel === 'agent' ? `${agent?.name} details` : `${dept?.name} work queue`} initial={reduce ? { opacity: 0 } : { x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { x: 380, opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 26 }}>
            {panel === 'agent' && agent ? (() => { const v = views[agent.key]; const evs = events.filter((e) => e.agent === agent.key).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8); const link = refLink(v.event?.ref);
              return (<>
                <div className="sh"><div className="rb"><RobotAvatar a={agent} state={v.state} moving={false} /></div><div><h3>{agent.name}</h3><div className="muted small">{agent.role} · {deptByKey(agent.dept)?.name}</div></div><button className="x" onClick={() => setSel('')} aria-label="Close">✕</button></div>
                <div className="row2"><span className={`tag ${agent.live ? 'on' : ''}`}>{agent.live ? 'Connected' : 'Planned'}</span><span className="tag">{STATE_LABEL[v.state]}</span></div>
                <h4>Current task</h4><p className="cur">{v.state === 'idle' || !v.event ? 'No active task.' : v.event.title}{v.event && v.state !== 'idle' && <small> · {ago(v.event.at, clock)}</small>}</p>
                {!agent.live && <p className="muted small">Planned: this agent has no real data source yet, so it can only wait or relax. Nothing here is simulated as work.</p>}
                <h4>Can do</h4><p className="muted small">{agent.skills.join(' · ')}</p>
                <h4>Recent activity</h4><ul className="feed">{evs.map((e) => <li key={e.id}><span className={`k-${e.kind}`}>{KIND_ICON[e.kind]}</span><div>{e.title}<small>{ago(e.at, clock)}{e.ref ? ` · ${e.ref}` : ''}</small></div></li>)}{!evs.length && <li className="muted small">No activity yet.</li>}</ul>
                <div className="acts">{!demo && link && can('sales.view') && <Link className="b primary" to={link}>Open the linked record</Link>}{!demo && ['desk', 'booking'].includes(agent.dept) && can('sales.view') && <Link className="b" to="/flow">Open Lead Flow</Link>}{!demo && agent.key === 'jarvis' && <Link className="b" to="/jarvis">Open JARVIS</Link>}{!demo && agent.key === 'creative' && <Link className="b" to="/marketing">Open Marketing AI</Link>}</div>
                <p className="muted small">Approve, retry or delegate are done in the screens above; they are not simulated here.</p>
              </>); })() : dept ? (() => { const q = queue(dept.key as DeptKey); const mates = AGENTS.filter((a) => a.dept === dept.key);
              return (<>
                <div className="sh"><div><h3>{dept.icon} {dept.name}</h3><div className="muted small">{dept.blurb}</div></div><button className="x" onClick={() => { setOpenQ(false); if (!mobile) setFocus(''); }} aria-label="Close">✕</button></div>
                <h4>Work queue</h4><ul className="queue">{q.items.map((it, i) => <li key={i}>{it.to && can('sales.view') ? <Link to={it.to}><b>{it.text}</b>{it.sub && <small>{it.sub}</small>}</Link> : <div><b>{it.text}</b>{it.sub && <small>{it.sub}</small>}</div>}</li>)}{!q.items.length && <li className="muted small">Nothing in the queue.</li>}</ul>
                <p className="muted small">{q.note}</p>{q.to && !demo && can('sales.view') && <div className="acts"><Link className="b primary" to={q.to}>{q.toLabel}</Link></div>}
                <h4>Team</h4><ul className="team">{mates.map((a) => <li key={a.key} onClick={() => setSel(a.key)}><span className="rb"><RobotAvatar a={a} state={views[a.key].state} moving={false} /></span><div><b>{a.name}</b> <span className="muted">· {a.role}</span><div className="small">{STATE_LABEL[views[a.key].state]}</div></div>{a.live ? <span className="tag on">Connected</span> : <span className="tag">Planned</span>}</li>)}</ul>
              </>); })() : null}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

const CSS = `
.hqp{position:relative;margin:-4px;padding:14px 14px 16px;border-radius:18px;color:#e9f7ff;background:radial-gradient(ellipse at 50% -20%,#12305b 0,#07152c 38%,#030912 84%);border:1px solid rgba(88,179,248,.25)}
.hqp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:2px 4px 12px;border-bottom:1px solid rgba(84,179,246,.22);margin-bottom:12px}
.hqp-brand{display:flex;align-items:center;gap:12px}.hqp-brand .mark{border:1px solid #63deff;color:#88eeff;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;font-size:22px;font-weight:850;box-shadow:inset 0 0 22px #1568a9,0 0 22px #116bb7}.hqp-brand .ttl{font-weight:900;letter-spacing:1px;line-height:1.05;font-size:clamp(15px,2.2vw,21px)}.hqp-brand .ttl b{color:#70d9ff}.hqp-brand small{display:block;font-size:10px;letter-spacing:3px;color:#9fbbd8;margin-top:4px;font-weight:650}
.hqp-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.mode{font:800 11px/1 system-ui,sans-serif;letter-spacing:.06em;padding:7px 10px;border-radius:6px}.mode.demo{color:#ffc785;border:1px solid #a17439;background:#281d12}.mode.live{color:#61f0b9;border:1px solid #208c72;background:#063e39}
.rt{display:flex;gap:6px;align-items:center;font-size:11px;color:#9bb6ce}.rt i{width:7px;height:7px;border-radius:50%;background:#47ebad;box-shadow:0 0 10px #47ebad}.rt.reconnecting i,.rt.connecting i{background:#ffbd76;box-shadow:0 0 10px orange;animation:hqpblink 1s infinite}
.hqp .b{background:#0d2c50;color:#cdeeff;border:1px solid #3079ad;border-radius:8px;padding:8px 11px;font:700 12px/1 system-ui,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;box-shadow:inset 0 1px #5688ad44}.hqp .b:hover{background:#164470}.hqp .b:disabled{opacity:.45;cursor:default}.hqp .b.primary{background:linear-gradient(135deg,#0275bb,#123c8c);border-color:#42cfff;color:#fff;box-shadow:0 0 18px #1466b65a}.hqp .b:focus-visible,.hqp .seg button:focus-visible{outline:2px solid #92edff;outline-offset:2px}
.seg{display:flex;gap:3px;background:#07152c;border:1px solid #2a5a86;border-radius:9px;padding:3px}.seg button{border:0;background:transparent;color:#a9c9e3;border-radius:6px;padding:6px 10px;font:700 12px/1 system-ui,sans-serif;cursor:pointer}.seg button.on{background:#164470;color:#fff}
.hqp-demo{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:rgba(40,29,18,.6);border:1px solid #a17439;border-radius:10px;padding:8px 10px;margin-bottom:10px}.hqp-demo .ctl{display:flex;gap:6px}.hqp-demo .cap{flex:1;min-width:220px;font-size:13px;color:#ffe2b8}.hqp-demo .bar{flex-basis:100%;height:3px;background:#3a2a14;border-radius:2px;overflow:hidden}.hqp-demo .bar i{display:block;height:100%;background:linear-gradient(90deg,#f0ae60,#ffd37a);transition:width .1s linear}
.hqp-sel{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px}.hqp-sel button{flex:none;border:1px solid #2a5a86;background:#0a1d3a;color:#cfe6fb;border-radius:999px;padding:6px 11px;font:700 12px/1 system-ui,sans-serif}.hqp-sel button.on{background:#164470;border-color:#6ad4ff}
.hqp-back{margin-top:8px}
.hqp-list{display:grid;gap:10px}.hqp-pad{padding:12px}
.hqp-strip{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:10px;margin-top:12px}.hqp-strip .blk{border:1px solid rgba(44,103,152,.6);border-radius:12px;background:linear-gradient(90deg,#061933,#0e2e51,#071830);padding:9px 12px;min-width:0}.lbl{font:800 10px/1 system-ui,sans-serif;letter-spacing:.14em;color:#8fe0ff}.ticker{display:grid;gap:4px;margin-top:6px;font-size:12px;color:#d3e8f6}.ticker small{opacity:.6;margin-left:4px}.ticker .bad{color:#ff8a7a}.wi{color:#ffd37a;text-decoration:none}a.wi:hover{text-decoration:underline}
.k-done{color:#5dff9c}.k-fail{color:#ff7a6a}.k-approval{color:#ffc233}.k-message{color:#9bb8ff}
.feed{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}.feed li{display:flex;gap:8px;font-size:.88em;align-items:flex-start}.feed li>span{width:16px;text-align:center}.feed small{display:block;opacity:.6;font-size:.82em}
.tag{font-size:.74em;padding:2px 8px;border-radius:999px;background:rgba(150,160,180,.22);color:#c4d2e4}.tag.on{background:rgba(40,190,110,.18);color:#5de0a0}
.hqp-slide{position:fixed;right:14px;top:78px;bottom:14px;width:min(380px,calc(100vw - 28px));overflow:auto;z-index:60;background:linear-gradient(160deg,#103762,#081b34 70%);border:1px solid #64c9fd;border-radius:16px;box-shadow:0 0 60px #1b99e24d,0 10px 40px rgba(0,0,0,.5);padding:16px;color:#e9f7ff}
.hqp-slide .sh{display:flex;gap:10px;align-items:center}.hqp-slide .sh h3{margin:0;font-size:18px}.hqp-slide .x{margin-left:auto;background:#25496c;border:1px solid #568bb3;border-radius:6px;color:#fff;padding:4px 9px;cursor:pointer}.hqp-slide .rb{width:40px;flex:none}.hqp-slide h4{margin:14px 0 4px;font-size:11px;letter-spacing:.14em;color:#8fe0ff;text-transform:uppercase}.hqp-slide .row2{display:flex;gap:6px;margin-top:10px}.hqp-slide .cur{margin:0;font-size:14px}.hqp-slide .cur small{opacity:.6}.hqp-slide .acts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.queue{list-style:none;margin:0;padding:0;display:grid;gap:6px}.queue li>*{display:block;padding:8px 10px;border:1px solid #2a6b9b;background:#071e39;border-radius:8px;color:inherit;text-decoration:none;font-size:13px}.queue small{display:block;opacity:.65;margin-top:2px}.queue a:hover{border-color:#6ad4ff}
.team{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:8px}.team li{display:flex;gap:10px;align-items:center;cursor:pointer;font-size:.9em}.team .rb{width:34px;flex:none}
@keyframes hqpblink{50%{opacity:.4}}
.hqp.full{position:fixed;inset:0;z-index:100;margin:0;border-radius:0;border:0;display:flex;flex-direction:column;overflow:auto;padding:8px 12px 10px}
.hqp.full .hqp-top{padding-bottom:6px;margin-bottom:6px}.hqp.full .hqp-brand .mark{width:34px;height:34px;font-size:17px}.hqp.full .hqp-brand small{display:none}.hqp.full .hqp-demo{margin-bottom:6px;padding:5px 8px}
.hqp.full .hqp-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:10px}.hqp.full .hqp-main{display:flex;flex-direction:column;min-height:0;min-width:0}.hqp.full .hqp-stagebox{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.hqp.full .hqp-list{overflow:auto}.hqp.full .hqp-strip{grid-template-columns:1fr;margin-top:0;align-content:start;overflow:auto}
.hqp.full .stu{width:auto;height:100%;max-width:100%}
.hqp.full .cin{height:100%;display:grid;place-items:center;overflow:hidden}.hqp.full .cin-stage{height:100%;width:auto;min-width:0;max-width:100%;aspect-ratio:1569/882}
.hqp.full .hqp-slide{top:64px}
@media (max-width:900px){.hqp.full .hqp-body{grid-template-columns:1fr}.hqp-strip{grid-template-columns:1fr}.hqp-slide{top:auto;height:62vh;bottom:8px;right:8px;left:8px;width:auto}}
`;
