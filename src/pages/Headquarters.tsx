// TOPMOP AI Headquarters (step 1): the automated desks of the business as animated characters in an office, driven by the real event log.
// LIVE = events written by the database as things really happen. DEMO MODE = a scripted preview, always labelled. Agents marked PLANNED have no real feed yet.
import { useEffect, useMemo, useState } from 'react';
import { CLOUD, supabase } from '@/lib/cloud';
import { PageHead } from '@/components/ui';
import { HqOffice } from '@/components/HqOffice';
import { HqCinematic } from '@/components/HqCinematic';
import { RobotAvatar } from '@/components/HqOffice';
import { useAuth } from '@/lib/store';
import { AGENTS, DEPTS, STATE_LABEL, agentByKey, agentState, deptByKey, demoStep, roomKpis, type HqEvent } from '@/lib/hq';
import { ago } from '@/lib/jarvisview';

type Tab = 'office' | 'agents' | 'activity';
const KIND_ICON: Record<string, string> = { start: '▶', done: '✓', fail: '✖', approval: '⏸', message: '⇄', info: '•' };
const HOUR = 3_600_000;

export default function Headquarters() {
  const { db } = useAuth();
  const [live, setLive] = useState<HqEvent[]>([]); const [loaded, setLoaded] = useState(!CLOUD); const [err, setErr] = useState('');
  const [demo, setDemo] = useState(!CLOUD); const [demoEvents, setDemoEvents] = useState<HqEvent[]>([]);
  const [now, setNow] = useState(Date.now()); const [tab, setTab] = useState<Tab>('office'); const [sel, setSel] = useState<string | null>(null); const [dept, setDept] = useState<string>('');
  const [still, setStill] = useState(false); const [look, setLook] = useState<'cinematic' | 'plan'>('cinematic');

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  // real events: the last 24 hours, then live inserts (Realtime), with a slow refresh as a safety net
  useEffect(() => {
    if (!CLOUD) return; let on = true;
    const load = async () => {
      const { data, error } = await supabase().from('agent_events').select('id, at, agent, dept, kind, title, ref, to_agent').gte('at', new Date(Date.now() - 24 * HOUR).toISOString()).order('at', { ascending: false }).limit(300);
      if (!on) return; if (error) setErr(error.message); else { setErr(''); setLive(data as HqEvent[]); } setLoaded(true);
    };
    void load(); const i = setInterval(() => void load(), 30_000);
    const ch = supabase().channel('hq-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_events' }, (p) => { setLive((cur) => [p.new as HqEvent, ...cur.filter((e) => e.id !== (p.new as HqEvent).id)].slice(0, 300)); }).subscribe();
    return () => { on = false; clearInterval(i); void supabase().removeChannel(ch); };
  }, []);
  // demo script: a new scene every few seconds
  useEffect(() => {
    if (!demo) return; let n = 0; const run = () => { setDemoEvents((cur) => [...demoStep(n++, Date.now()), ...cur].slice(0, 80)); }; run(); const i = setInterval(run, 9000); return () => clearInterval(i);
  }, [demo]);

  const events = useMemo(() => (demo ? demoEvents : live).filter((e) => Date.parse(e.at) <= now + 100), [demo, demoEvents, live, now]);
  const views = useMemo(() => Object.fromEntries(AGENTS.map((a) => [a.key, agentState(a.key, events, now)])), [events, now]);
  const kpis = useMemo(() => roomKpis(db as never, events, now), [db, events, Math.floor(now / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date(now).toISOString().slice(0, 10);
  const stats = {
    liveAgents: AGENTS.filter((a) => a.live).length, total: AGENTS.length,
    awaiting: AGENTS.filter((a) => views[a.key].state === 'awaiting').length, problems: AGENTS.filter((a) => views[a.key].state === 'error').length,
    today: events.filter((e) => e.at.slice(0, 10) === today).length, busy: AGENTS.filter((a) => ['working', 'received', 'coordinating'].includes(views[a.key].state)).length,
  };
  const feed = (dept ? events.filter((e) => e.dept === dept) : events).slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const who = sel ? agentByKey(sel) : undefined; const whoView = who ? views[who.key] : undefined;
  const nothingReal = CLOUD && !demo && loaded && !live.length;

  return (
    <>
      <PageHead icon="🏢" title="AI Headquarters" sub="Your automated desks at work. Characters move only when something really happens in the business." />
      <div className="hq-bar">
        <span className={`hq-mode ${demo ? 'demo' : 'live'}`}>{demo ? 'DEMO MODE · simulated activity' : 'LIVE · real activity'}</span>
        {CLOUD && <button className="btn sm" onClick={() => setDemo((d) => !d)}>{demo ? 'Show real activity' : 'Preview with demo activity'}</button>}
        <div className="hq-look"><button className={look === 'cinematic' ? 'on' : ''} onClick={() => setLook('cinematic')}>🎬 Cinematic</button><button className={look === 'plan' ? 'on' : ''} onClick={() => setLook('plan')}>🗺️ Floor plan</button></div>
        <button className="btn sm" onClick={() => setStill((s) => !s)}>{still ? 'Resume motion' : 'Pause motion'}</button>
        <div className="hq-tabs" role="tablist">{(['office', 'agents', 'activity'] as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'office' ? '🏢 Office' : t === 'agents' ? '🧑‍💻 Agents' : '📜 Activity'}</button>)}</div>
      </div>
      {err && <div className="alert warn">Could not load activity: {err}. Has the latest database update (migration 0119) been applied?</div>}
      {nothingReal && <div className="alert">No real activity yet. It appears here as inquiries, quotations, bookings, posts and Jarvis actions happen. Use “Preview with demo activity” to see how the office moves.</div>}
      <div className="hq-stats">
        <div><b>{stats.busy}</b><span>agents busy</span></div><div className={stats.awaiting ? 'warn' : ''}><b>{stats.awaiting}</b><span>waiting for you</span></div><div className={stats.problems ? 'bad' : ''}><b>{stats.problems}</b><span>problems</span></div>
        <div><b>{stats.today}</b><span>events today</span></div><div><b>{stats.liveAgents}/{stats.total}</b><span>agents connected</span></div>
      </div>

      {tab === 'office' && (
        <div className="hq-grid">
          {look === 'cinematic'
            ? <HqCinematic events={events} views={views} kpis={kpis} now={now} selected={dept} onPick={(d) => { setDept(d); setSel(null); }} onPickAgent={(k) => { setSel(sel === k ? null : k); setDept(''); }} still={still} />
            : <HqOffice kpis={kpis} events={events} now={now} selected={sel} onPick={(k) => setSel(sel === k ? null : k)} still={still} onRoom={(d) => { if (d !== 'cafe') setDept(dept === d ? '' : d); }} />}
          <aside className="hq-side">
            {look === 'cinematic' && dept && !who && (
              <div className="card hq-card">
                <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{deptByKey(dept)?.name}</h3><button className="btn sm" onClick={() => setDept('')}>Close</button></div>
                <div className="small muted">{deptByKey(dept)?.blurb}</div>
                <ul className="hq-team">{AGENTS.filter((a) => a.dept === dept).map((a) => <li key={a.key} onClick={() => setSel(a.key)}><span className="rb"><RobotAvatar a={a} state={views[a.key].state} moving={false} /></span><div><b>{a.name}</b> <span className="muted">· {a.role}</span><div className="small">{STATE_LABEL[views[a.key].state]}{views[a.key].event ? ` — ${views[a.key].event!.title}` : ''}</div></div>{a.live ? <span className="hq-tag on">Connected</span> : <span className="hq-tag">Planned</span>}</li>)}</ul>
              </div>
            )}
            {who && whoView ? (
              <div className="card hq-card">
                <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{who.name}</h3><button className="btn sm" onClick={() => setSel(null)}>Close</button></div>
                <div className="muted">{who.role} · {deptByKey(who.dept)?.name}</div>
                <p style={{ margin: '8px 0' }}><b>{STATE_LABEL[whoView.state]}</b>{whoView.event ? <> — {whoView.event.title} <span className="muted">({ago(whoView.event.at, now)})</span></> : ''}</p>
                {!who.live && <div className="small muted">Planned: this desk is not connected to a real data source yet, so it only relaxes. It will start working when its integration is built.</div>}
                <div className="small muted" style={{ marginTop: 6 }}>Can do: {who.skills.join(' · ')}</div>
                <div className="small" style={{ marginTop: 8, fontWeight: 600 }}>Recent activity</div>
                <ul className="hq-feed">{events.filter((e) => e.agent === who.key).slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6).map((e) => <li key={e.id}><span>{KIND_ICON[e.kind]}</span><div>{e.title}<small>{ago(e.at, now)}</small></div></li>)}{!events.some((e) => e.agent === who.key) && <li className="muted small">Nothing yet.</li>}</ul>
              </div>
            ) : <div className="card hq-card muted small">Click a character to see what it is doing. Click a room to filter the activity feed{dept ? ` (now: ${deptByKey(dept)?.name})` : ''}.</div>}
            <div className="card hq-card">
              <div className="row" style={{ justifyContent: 'space-between' }}><b>Activity{dept ? ` · ${deptByKey(dept)?.name}` : ''}</b>{dept && <button className="btn sm" onClick={() => setDept('')}>All</button>}</div>
              <ul className="hq-feed">{feed.slice(0, 12).map((e) => <li key={e.id}><span className={`k-${e.kind}`}>{KIND_ICON[e.kind]}</span><div><b>{agentByKey(e.agent)?.name ?? e.agent}</b> · {e.title}<small>{ago(e.at, now)}</small></div></li>)}{!feed.length && <li className="muted small">No activity yet.</li>}</ul>
            </div>
          </aside>
        </div>
      )}

      {tab === 'agents' && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tbl compact"><thead><tr><th>Agent</th><th>Role</th><th>Department</th><th>Status</th><th>Last activity</th><th>Connection</th></tr></thead>
            <tbody>{AGENTS.map((a) => { const v = views[a.key]; return <tr key={a.key} onClick={() => { setSel(a.key); setTab('office'); }} style={{ cursor: 'pointer' }}><td><b>{a.name}</b></td><td>{a.role}</td><td>{deptByKey(a.dept)?.name}</td><td>{STATE_LABEL[v.state]}</td><td>{v.event ? <>{v.event.title} <span className="muted small">({ago(v.event.at, now)})</span></> : <span className="muted">—</span>}</td><td>{a.live ? <span className="hq-tag on">Connected</span> : <span className="hq-tag">Planned</span>}</td></tr>; })}</tbody></table>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}><button className={`btn sm ${dept ? '' : 'primary'}`} onClick={() => setDept('')}>All</button>{DEPTS.filter((d) => d.key !== 'cafe').map((d) => <button key={d.key} className={`btn sm ${dept === d.key ? 'primary' : ''}`} onClick={() => setDept(d.key)}>{d.icon} {d.name}</button>)}</div>
          <ul className="hq-feed wide">{feed.slice(0, 100).map((e) => <li key={e.id}><span className={`k-${e.kind}`}>{KIND_ICON[e.kind]}</span><div><b>{agentByKey(e.agent)?.name ?? e.agent}</b> <span className="muted">({deptByKey(e.dept)?.name})</span> · {e.title}{e.to_agent ? <> → <b>{agentByKey(e.to_agent)?.name}</b></> : ''}<small>{new Date(e.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · {ago(e.at, now)}</small></div></li>)}{!feed.length && <li className="muted">No activity yet.</li>}</ul>
        </div>
      )}
      <style>{PAGE_CSS}</style>
    </>
  );
}

const PAGE_CSS = `
.hq-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px}
.hq-mode{font-weight:700;font-size:.8em;letter-spacing:.06em;padding:4px 10px;border-radius:999px}.hq-mode.live{background:rgba(40,190,110,.16);color:#1d8a52}.hq-mode.demo{background:rgba(240,170,30,.2);color:#9a6a00}
.hq-tabs{margin-left:auto;display:flex;gap:4px}.hq-tabs button{border:1px solid var(--line,#cfd8e6);background:transparent;border-radius:8px;padding:5px 10px;cursor:pointer;color:inherit}.hq-tabs button.on{background:var(--navy,#1b3a73);color:#fff;border-color:transparent}
.hq-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}.hq-stats div{background:rgba(120,150,220,.12);border:1px solid rgba(120,150,220,.28);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;color:inherit}.hq-stats b{font-size:1.4em}.hq-stats span{font-size:.78em;opacity:.7}.hq-stats .warn b{color:#c98a00}.hq-stats .bad b{color:#c0392b}
.hq-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.hq-side{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}.hq-card{padding:12px}
.hq-feed{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}.hq-feed li{display:flex;gap:8px;font-size:.88em;align-items:flex-start}.hq-feed li>span{width:16px;text-align:center;opacity:.8}.hq-feed small{display:block;opacity:.6;font-size:.82em}
.hq-feed .k-done{color:#1d8a52}.hq-feed .k-fail{color:#c0392b}.hq-feed .k-approval{color:#c98a00}.hq-feed .k-message{color:#2f6df6}.hq-feed.wide li{font-size:.95em}
.hq-look{display:flex;gap:4px}.hq-look button{border:1px solid var(--line,#cfd8e6);background:transparent;border-radius:8px;padding:5px 10px;cursor:pointer;color:inherit}.hq-look button.on{background:var(--navy,#1b3a73);color:#fff;border-color:transparent}
.hq-team{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.hq-team li{display:flex;gap:10px;align-items:center;cursor:pointer;font-size:.9em}.hq-team .rb{width:34px;flex:none}
.hq-tag{font-size:.78em;padding:2px 8px;border-radius:999px;background:rgba(150,160,180,.2)}.hq-tag.on{background:rgba(40,190,110,.16);color:#1d8a52}
@media (max-width:1000px){.hq-side{grid-template-columns:1fr}.hq-stats{grid-template-columns:repeat(3,1fr)}}
`;
