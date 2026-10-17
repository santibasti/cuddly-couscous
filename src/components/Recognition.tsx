// Crew recognition on the attendance screen: Top 3 podium, then Most improved, Streaks, Praise wall, Crew goals and the Hall of fame
// (with the monthly announcement for Admin / HR). Everything here is encouraging by design — nobody sees a full ranking list.
import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, Field, toast } from '@/components/ui';
import { Avatar } from '@/components/EmployeeCard';
import { TopThree } from '@/components/TopThree';
import { useAuth } from '@/lib/store';
import { announce, loadBoard, loadPraise, loadRecognitions, loadTeams, monthLabel, recentMonths, type Award, type Board, type Person, type Praise, type Recognition } from '@/lib/recognition';
import { Badges } from '@/components/Badges';
import type { TeamRow } from '@/lib/recognition-core';
import type { Employee } from '@/lib/types';

const asEmp = (p: { id: string; full_name?: string; name?: string; avatar?: string }) => ({ id: p.id, full_name: p.full_name ?? p.name ?? '', avatar: p.avatar } as Employee);
const TABS = [['improved', '📈 Most improved'], ['streaks', '🔥 Streaks'], ['praise', '💬 Praise wall'], ['crews', '👥 Crew goals'], ['hall', '🏆 Hall of fame']] as const;
type Tab = (typeof TABS)[number][0];
const KIND_LABEL: Record<Award['kind'], string> = { top1: '🥇 Top rated', top2: '🥈 2nd place', top3: '🥉 3rd place', improved: '📈 Most improved', perfect: '🏅 Perfect attendance', streak: '🔥 On-time streak' };

export function RecognitionHub({ meId, canAnnounce }: { meId?: string; canAnnounce?: boolean }) {
  const { db } = useAuth(); const [board, setBoard] = useState<Board>({ top: [], improved: [], streaks: [], perfect: [] }); const [tab, setTab] = useState<Tab | null>(null);
  const [latest, setLatest] = useState<Recognition>();
  useEffect(() => { let on = true; loadBoard(db).then((b) => on && setBoard(b)); loadRecognitions().then((r) => on && setLatest(r[0])); return () => { on = false; }; }, [db.employees.map((e) => `${e.rating}|${e.avatar?.length ?? 0}|${e.recog?.streak}|${e.recog?.delta}`).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = latest && Date.now() - Date.parse(latest.announced_at) < 21 * 86400_000;
  return (
    <>
      {fresh && <button type="button" className="rannounce" onClick={() => setTab('hall')}>🎉 <b>{monthLabel(latest!.month)} winners are in!</b> {latest!.awards.slice(0, 3).map((a) => a.name.split(' ')[0]).join(', ')}{latest!.awards.length > 3 ? ' and more' : ''} — tap to see</button>}
      <TopThree people={board.top} meId={meId} />
      <div className="chips rtabs" role="tablist" style={{ marginTop: 0, marginBottom: 12 }}>
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(tab === k ? null : k)}>{label}</button>)}
      </div>
      {tab === 'improved' && <Improved people={board.improved} meId={meId} />}
      {tab === 'streaks' && <Streaks streaks={board.streaks} perfect={board.perfect} meId={meId} />}
      {tab === 'praise' && <PraiseWall />}
      {tab === 'crews' && <Crews />}
      {tab === 'hall' && <Hall board={board} canAnnounce={!!canAnnounce} onSaved={() => loadRecognitions().then((r) => setLatest(r[0]))} />}
    </>
  );
}

function PersonRow({ p, meId, extra }: { p: Person; meId?: string; extra: React.ReactNode }) {
  return (
    <div className={`rperson${p.id === meId ? ' me' : ''}`}>
      <Avatar emp={asEmp(p)} size={52} />
      <div style={{ minWidth: 0 }}><b>{p.full_name}</b>{p.id === meId ? ' — that\'s you! 🎉' : ''}<div className="small muted">{p.position}</div><Badges recog={p.recog} /></div>
      <div className="rextra">{extra}</div>
    </div>
  );
}

function Improved({ people, meId }: { people: Person[]; meId?: string }) {
  return (
    <Card title="📈 Most improved this month" actions={<span className="small muted">Climbed the most compared with last month</span>}>
      {people.length ? <div className="stack">{people.map((p) => <PersonRow key={p.id} p={p} meId={meId} extra={<><b className="rup">+{(p.recog?.delta ?? 0).toFixed(1)}</b><div className="small muted">{p.recog?.prev?.toFixed(1)} → {((p.recog?.prev ?? 0) + (p.recog?.delta ?? 0)).toFixed(1)}</div></>} />)}</div>
        : <div className="muted small">Nobody has climbed 0.1 or more yet this month. Every on-time day, safe job and happy client moves your rating — your turn could be next!</div>}
    </Card>
  );
}

function Streaks({ streaks, perfect, meId }: { streaks: Person[]; perfect: Person[]; meId?: string }) {
  return (
    <div className="grid g2">
      <Card title="🔥 On-time streaks" actions={<span className="small muted">Work days in a row, on time</span>}>
        {streaks.length ? <div className="stack">{streaks.map((p) => <PersonRow key={p.id} p={p} meId={meId} extra={<b className="rup">{p.recog?.streak} days</b>} />)}</div> : <div className="muted small">Streaks start at 5 work days in a row. Be on time every day and yours will show here.</div>}
      </Card>
      <Card title="🏅 Perfect attendance this month" actions={<span className="small muted">Present and on time every work day so far</span>}>
        {perfect.length ? <div className="stack">{perfect.map((p) => <PersonRow key={p.id} p={p} meId={meId} extra={<span className="small muted">so far</span>} />)}</div> : <div className="muted small">No one yet — a perfect month needs every work day on time.</div>}
      </Card>
    </div>
  );
}

function PraiseWall() {
  const { db } = useAuth(); const [rows, setRows] = useState<Praise[] | null>(null);
  useEffect(() => { loadPraise(db, 8).then(setRows); }, [db.client_feedback.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="💬 What clients say about us" actions={<span className="small muted">Real comments from Very Satisfied clients</span>}>
      {rows === null ? <div className="muted small">Loading…</div> : rows.length ? (
        <div className="praise-grid">{rows.map((r) => (
          <figure key={r.id} className="praise"><blockquote>“{r.praise}”</blockquote><figcaption className="small muted">A happy client{r.service ? ` · ${r.service}` : ''}{r.crew ? ` · thanks to ${r.crew}` : ''}</figcaption></figure>
        ))}</div>
      ) : <div className="muted small">Client comments will appear here after a client rates a job Very Satisfied and writes a note.</div>}
    </Card>
  );
}

function Crews() {
  const { db } = useAuth(); const months = recentMonths(2); const [month, setMonth] = useState(months[0]); const [rows, setRows] = useState<TeamRow[] | null>(null);
  useEffect(() => { setRows(null); loadTeams(db, month).then(setRows); }, [month, db.jobs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = Math.max(1, ...(rows ?? []).map((r) => r.score));
  return (
    <Card title="👥 Crew goals" actions={<div className="chips" style={{ marginTop: 0 }}>{months.map((m, i) => <button key={m} type="button" className={month === m ? 'on' : ''} onClick={() => setMonth(m)}>{i === 0 ? 'This month' : 'Last month'}</button>)}</div>}>
      <div className="small muted" style={{ marginBottom: 10 }}>Crews earn points together: <b>5</b> per finished job · <b>5</b> per Very Satisfied client · <b>3</b> per signed service report · <b>−10</b> per back job. Quality and care win, not speed.</div>
      {rows === null ? <div className="muted small">Loading…</div> : rows.length ? (
        <div className="stack">{rows.map((r, i) => (
          <div key={r.leader_id} className="rcrew">
            <span className="rcrew-rank">{i + 1}</span>
            <Avatar emp={asEmp({ id: r.leader_id, full_name: r.leader_name, avatar: r.avatar })} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>Crew {r.leader_name.split(' ')[0]}</b>
              <div className="small muted">{r.jobs} jobs · {r.happy} happy clients · {r.reports} signed reports{r.backjobs ? ` · ${r.backjobs} back job${r.backjobs === 1 ? '' : 's'}` : ''}</div>
              <div className="rbar"><span style={{ width: `${Math.round((r.score / best) * 100)}%` }} /></div>
            </div>
            <b className="rscore">{r.score}<small> pts</small></b>
          </div>
        ))}</div>
      ) : <div className="muted small">No finished jobs for this month yet.</div>}
    </Card>
  );
}

function Hall({ board, canAnnounce, onSaved }: { board: Board; canAnnounce: boolean; onSaved: () => void }) {
  const [list, setList] = useState<Recognition[]>([]); const reload = useCallback(() => loadRecognitions().then(setList), []);
  useEffect(() => { reload(); }, [reload]);
  return (
    <div className="stack">
      {canAnnounce && <Announce board={board} existing={list} onSaved={() => { reload(); onSaved(); }} />}
      <Card title="🏆 Hall of fame">
        {list.length ? <div className="stack">{list.map((r) => (
          <div key={r.id}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>{monthLabel(r.month)}</div>
            <div className="rawards">{r.awards.map((a, i) => (
              <div key={i} className="raward"><Avatar emp={asEmp({ id: a.employee_id, name: a.name, avatar: a.avatar })} size={44} /><div style={{ minWidth: 0 }}><b>{a.name}</b><div className="small">{KIND_LABEL[a.kind]}</div>{a.reward && <div className="small muted">🎁 {a.reward}</div>}</div></div>
            ))}</div>
          </div>
        ))}</div> : <div className="muted small">No winners announced yet. The first monthly announcement will appear here.</div>}
      </Card>
    </div>
  );
}

function Announce({ board, existing, onSaved }: { board: Board; existing: Recognition[]; onSaved: () => void }) {
  const months = recentMonths(4); const [month, setMonth] = useState(months[1] ?? months[0]); const [busy, setBusy] = useState(false);
  const cand: Award[] = [
    ...board.top.slice(0, 3).map((p, i) => ({ kind: (['top1', 'top2', 'top3'] as const)[i], employee_id: p.id, name: p.full_name, avatar: p.avatar, reward: '' })),
    ...board.improved.slice(0, 1).map((p) => ({ kind: 'improved' as const, employee_id: p.id, name: p.full_name, avatar: p.avatar, reward: '' })),
    ...board.perfect.map((p) => ({ kind: 'perfect' as const, employee_id: p.id, name: p.full_name, avatar: p.avatar, reward: '' })),
  ];
  const [rewards, setRewards] = useState<Record<string, string>>({});
  const key = (a: Award) => `${a.kind}:${a.employee_id}`;
  const done = existing.find((r) => r.month === month);
  const go = async () => {
    if (!cand.length) { toast('There are no winners to announce yet.', 'err'); return; }
    if (done && !confirm(`${monthLabel(month)} was already announced. Replace it?`)) return;
    setBusy(true);
    try { await announce(month, cand.map((a) => ({ ...a, reward: rewards[key(a)] ?? '' }))); toast('Winners announced — everyone sees them on the attendance screen', 'ok'); onSaved(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not announce', 'err'); } finally { setBusy(false); }
  };
  return (
    <Card title="📣 Announce the monthly winners" actions={<span className="small muted">Admin / HR only</span>}>
      <div className="stack">
        <Field label="Month"><select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field>
        {cand.length ? cand.map((a) => (
          <div key={key(a)} className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar emp={asEmp({ id: a.employee_id, name: a.name, avatar: a.avatar })} size={40} />
            <div style={{ minWidth: 150 }}><b>{a.name}</b><div className="small muted">{KIND_LABEL[a.kind]}</div></div>
            <input style={{ flex: 1, minWidth: 180 }} placeholder="Reward (e.g. ₱500 bonus, free lunch, first pick of schedule)" value={rewards[key(a)] ?? ''} maxLength={80} onChange={(e) => setRewards({ ...rewards, [key(a)]: e.target.value })} />
          </div>
        )) : <div className="muted small">Winners appear once ratings and attendance are in.</div>}
        <div className="small muted">Winners come from the current ratings and badges. {done ? <Badge tone="amber">Already announced</Badge> : null}</div>
        <button className="btn primary" disabled={busy || !cand.length} onClick={go}>📣 Announce winners</button>
      </div>
    </Card>
  );
}
