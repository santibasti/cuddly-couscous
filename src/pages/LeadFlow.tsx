// Lead Flow: the road from the first inquiry to a sent job order, shown as a cinematic pipeline. Each lead is a glowing card on its step; the headquarters character that looks
// after the step stands above it. The gold steps are approval gates: nothing is sent to a client or committed until you press the button.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Modal, attempt, toast } from '@/components/ui';
import { RobotAvatar } from '@/components/HqOffice';
import { agentByKey } from '@/lib/hq';
import { STEPS, crewNeeded, flowCards, flowSummary, proposeTeam, stepDef, suggestDays, type FlowCard } from '@/lib/leadflow';
import { assignTeam, bookFromQuote, draftQuoteForInquiry, recordClientDecision, sendQuote } from '@/lib/flowactions';
import { parseWhen } from '@/lib/quickbooking';
import { fmtDate, today } from '@/lib/util';

function useCount(value: number, ms = 700) {
  const [v, setV] = useState(0);
  useEffect(() => { const t0 = performance.now(); let raf = 0; const from = v; const step = (now: number) => { const k = Math.min(1, (now - t0) / ms); setV(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
const Num = ({ n }: { n: number }) => <>{useCount(n)}</>;
const ageText = (h: number) => (h < 1 ? 'now' : h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`);

export default function LeadFlow() {
  const { db, can } = useAuth(); const nav = useNavigate();
  const [now, setNow] = useState(Date.now()); const [sel, setSel] = useState<string | null>(null); const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i); }, []);
  const [showStale, setShowStale] = useState(false);
  const everything = useMemo(() => flowCards(db, now), [db, now]);
  const cards = useMemo(() => (showStale ? everything : everything.filter((c) => !c.stale)), [everything, showStale]);
  const hidden = everything.filter((c) => c.stale).length;
  const sum = useMemo(() => flowSummary(db, everything, now), [db, everything, now]);
  const card = sel ? cards.find((c) => c.id === sel) : undefined;
  const mobile = typeof window !== 'undefined' && window.innerWidth < 760;

  return (
    <div className="lf">
      <style>{CSS}</style>
      <div className="lf-stars" aria-hidden />
      <header className="lf-hero">
        <div><div className="lf-eyebrow">TOPMOP · SALES OPERATIONS</div><h1>LEAD FLOW</h1><p>From the first message to a confirmed job. Every step is tracked, every commitment is yours to approve.</p></div>
        <div className="lf-kpis">
          <div className={sum.waitingForYou ? 'gold' : ''}><b><Num n={sum.waitingForYou} /></b><span>waiting for you</span></div>
          <div className={sum.urgent ? 'hot' : ''}><b><Num n={sum.urgent} /></b><span>need attention</span></div>
          <div><b><Num n={cards.length} /></b><span>leads on the road</span></div>
          <div><b><Num n={sum.conversion} />%</b><span>won this month ({sum.wonThisMonth}/{sum.leadsThisMonth})</span></div>
        </div>
      </header>

      <div className="lf-scroll">
        <div className="lf-road">
          {STEPS.map((s, idx) => {
            const list = cards.filter((c) => c.step === s.key); const shown = open[s.key] ? list : list.slice(0, mobile ? 4 : 5); const ag = agentByKey(s.agent)!;
            return (
              <section key={s.key} className={`lf-col ${s.gate ? 'gate' : ''} ${list.length ? 'has' : ''}`} style={{ ['--i' as string]: idx }}>
                {idx > 0 && <i className="lf-link" />}
                <div className="lf-node"><span>{s.icon}</span>{s.gate && <em title="Approval gate: waits for you">GATE</em>}</div>
                <div className="lf-robot" title={`${ag.name} · ${ag.role}`}><RobotAvatar a={ag} state={s.gate && list.length ? 'awaiting' : list.length ? 'working' : 'idle'} moving={false} /><small>{ag.name}</small></div>
                <h3>{s.label}</h3><div className="lf-count"><Num n={list.length} /></div><p className="lf-blurb">{s.blurb}</p>
                <div className="lf-cards">
                  {shown.map((c) => (
                    <button key={c.id} type="button" className={`lf-card ${c.urgent ? 'urgent' : ''}`} onClick={() => setSel(c.id)}>
                      <b>{c.client}</b><span>{c.service}{c.place ? ` · ${c.place}` : ''}</span>
                      <div className="lf-meta"><em>{ageText(c.ageH)}</em>{c.number && <em>{c.number}</em>}</div>
                      {c.flags.map((f) => <div key={f} className="lf-flag">⚠ {f}</div>)}
                    </button>
                  ))}
                  {list.length > shown.length && <button type="button" className="lf-more" onClick={() => setOpen({ ...open, [s.key]: true })}>+{list.length - shown.length} more</button>}
                  {!list.length && <div className="lf-empty">No leads here</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="lf-foot">{hidden > 0 && <button type="button" className="lf-stale" onClick={() => setShowStale(!showStale)}>{showStale ? 'Hide' : `Show ${hidden} forgotten`} older leads (over 30 days, or jobs that already started)</button>} Handled by the Headquarters crew · <a href="#/hq">watch them work</a>{!can('sales.edit') && ' · You can view the flow; ask the Owner or Sales to move leads.'}</div>
      {card && <CardDialog card={card} onClose={() => setSel(null)} nav={nav} />}
    </div>
  );
}

function CardDialog({ card, onClose, nav }: { card: FlowCard; onClose: () => void; nav: (to: string) => void }) {
  const { db } = useAuth(); const def = stepDef(card.step); const ag = agentByKey(def.agent)!;
  const inq = card.inquiryId ? db.inquiries.find((i) => i.id === card.inquiryId) : undefined; const q = card.quotationId ? db.quotations.find((x) => x.id === card.quotationId) : undefined;
  const job = card.jobId ? db.jobs.find((j) => j.id === card.jobId) : undefined; const client = db.clients.find((c) => c.id === card.clientId);
  const need = crewNeeded(q?.crew_size, 3);
  const asked = parseWhen(inq?.details ?? '', today())?.date; const from = asked && asked > today() ? asked : (() => { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const days = useMemo(() => (card.step === 'confirm' ? suggestDays(db, { from, days: 10, need }) : card.step === 'book' && job ? suggestDays(db, { from: job.start_at.slice(0, 10), days: 1, need, start: job.start_at.slice(11, 16), end: job.end_at.slice(11, 16) }) : []), [db, card.step, from, need, job]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = useState(''); const [time, setTime] = useState('08:00'); const [withTeam, setWithTeam] = useState(true); const [msg, setMsg] = useState('');
  useEffect(() => { if (card.step === 'confirm' && !date) setDate((days.find((d) => d.ok) ?? days[0])?.date ?? from); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  const slot = days.find((d) => d.date === date) ?? days[0]; const team = slot ? proposeTeam(slot, need) : undefined;
  const run = (fn: () => unknown, ok: string, after?: () => void) => { try { fn(); toast(ok, 'ok'); setMsg(''); (after ?? onClose)(); } catch (e) { setMsg(e instanceof Error ? e.message : 'That did not work.'); } };
  const first = (client?.name ?? '').split(' ')[0] || 'there';
  const followUp = `Hi ${first}, this is TopMop PH. Following up on our quotation ${q?.number ?? ''}. Would you like us to book a schedule for the cleaning? Thank you!`;

  return (
    <Modal title={<>{def.icon} {card.client}</>} onClose={onClose}>
      <div className="lf-dlg">
        <div className="lf-who"><div className="lf-robot sm"><RobotAvatar a={ag} state={def.gate ? 'awaiting' : 'working'} moving={false} /></div><div><b>{def.label}</b><div className="small muted">{ag.name} · {ag.role} looks after this step</div></div></div>
        <div className="small" style={{ margin: "8px 0" }}>{card.service}{card.place ? ` · ${card.place}` : ''}{card.number ? ` · ${card.number}` : ''}{q ? ` · quotation ${q.status}` : ''}{job ? ` · booked ${fmtDate(job.start_at.slice(0, 10))}` : ''}{inq?.source ? ` · from ${inq.source}` : ''}</div>
        {inq?.details && <div className="small muted" style={{ marginBottom: 8 }}>“{inq.details.slice(0, 220)}”</div>}
        {card.flags.map((f) => <div key={f} className="lf-flag">⚠ {f}</div>)}
        {msg && <div className="alert warn" style={{ margin: '8px 0' }}>{msg}</div>}

        {card.step === 'new' && <div className="lf-act"><p className="small muted">The price comes from your rate list (package by city, or the minimum of another service). It is a draft until you approve it.</p>
          <button className="btn primary" onClick={() => run(() => draftQuoteForInquiry(card.inquiryId!), 'Quotation drafted. It waits for your approval.')}>Prepare the quotation</button>
          <button className="btn" onClick={() => nav(`/sales/quote/new?client=${card.clientId}&inquiry=${card.inquiryId}`)}>Price it by hand</button></div>}

        {card.step === 'quote' && <div className="lf-act"><p className="small muted">Check the quotation, then approve it to mark it as sent. Share it with the client from the quotation page.</p>
          <button className="btn" onClick={() => nav(`/sales/quote/${card.quotationId}`)}>Open the quotation</button>
          <button className="btn primary" onClick={() => run(() => sendQuote(card.quotationId!), 'Quotation approved and marked as sent.')}>Approve &amp; mark as sent</button></div>}

        {card.step === 'sent' && <div className="lf-act"><p className="small muted">When the client answers, record it here (or they accept it from the link and it moves by itself).</p>
          <button className="btn primary" onClick={() => run(() => recordClientDecision(card.quotationId!, true), 'Client approved. Ready to book.')}>Client said yes</button>
          <button className="btn" onClick={() => { const r = window.prompt('Why did the client decline? (optional)') ; if (r !== null) run(() => recordClientDecision(card.quotationId!, false, r), 'Marked as declined.'); }}>Client declined</button>
          <button className="btn" onClick={() => { void navigator.clipboard?.writeText(followUp); toast('Follow-up message copied', 'ok'); }}>Copy follow-up message</button></div>}

        {card.step === 'confirm' && <div className="lf-act"><div className="small muted">Pick a day. Days show who is free (same double-booking rule as the booking form).{asked ? ` The client asked for ${fmtDate(asked)}.` : ''}</div>
          <div className="lf-days">{days.map((d) => <button key={d.date} type="button" className={`${d.ok ? 'ok' : 'no'} ${d.date === date ? 'on' : ''}`} onClick={() => setDate(d.date)}><b>{d.weekday} {d.date.slice(8)}</b><span>{d.ok ? `${d.leaders.length + d.crew.length} free · ${d.vehicles.length} van` : 'not enough free'}</span></button>)}</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}><label className="small">Start <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            <label className="check small"><input type="checkbox" checked={withTeam} onChange={(e) => setWithTeam(e.target.checked)} /> Also assign {team?.leader ? `${team.leader.full_name} + ${team.crew.length} crew${team.vehicle ? ` and ${team.vehicle.name}` : ''}` : 'the suggested team'}</label></div>
          <button className="btn primary" disabled={!date} onClick={() => run(() => bookFromQuote(card.quotationId!, date, time, withTeam && team ? { leader: team.leader?.id, crew: team.crew.map((e) => e.id), vehicle: team.vehicle?.id } : undefined), 'Booked. The job order draft is created.')}>Book it</button></div>}

        {card.step === 'book' && <div className="lf-act">{slot?.ok && team?.leader ? <p className="small">Free on that day: <b>{team.leader.full_name}</b> (leader), {team.crew.map((e) => e.full_name).join(', ') || 'no crew'}{team.vehicle ? `, ${team.vehicle.name}` : ''}.</p> : <p className="small muted">Not enough free people or no free vehicle on that day. Open the booking to choose by hand.</p>}
          <button className="btn" onClick={() => nav(`/jobs/${card.jobId}`)}>Open the booking</button>
          {slot?.ok && team?.leader && <button className="btn primary" onClick={() => run(() => assignTeam(card.jobId!, { leader: team.leader?.id, crew: team.crew.map((e) => e.id), vehicle: team.vehicle?.id }), 'Team assigned.')}>Assign this team</button>}</div>}

        {card.step === 'order' && <div className="lf-act"><p className="small muted">The team is set. Review the job order and send it to the client from the booking.</p><button className="btn primary" onClick={() => nav(`/jobs/${card.jobId}`)}>Open the job order</button></div>}
        {card.step === 'ready' && <div className="lf-act"><p className="small muted">Confirmed and sent. Nothing left to do for this lead.</p><button className="btn" onClick={() => nav(`/jobs/${card.jobId}`)}>Open the booking</button></div>}
      </div>
    </Modal>
  );
}

const CSS = `
.lf{position:relative;margin:-4px;padding:18px 16px 14px;border-radius:18px;color:#dbe7ff;overflow:hidden;background:radial-gradient(ellipse at 50% -10%,#14379c 0,#08153f 42%,#030a22 100%);border:1px solid rgba(120,160,255,.22);box-shadow:0 0 60px rgba(40,90,255,.18) inset}
.lf:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(120,160,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,255,.05) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 80%);pointer-events:none}
.lf-stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 12% 20%,#9fd0ff,transparent),radial-gradient(1.5px 1.5px at 78% 12%,#fff,transparent),radial-gradient(1px 1px at 44% 66%,#7fe7ff,transparent),radial-gradient(1.5px 1.5px at 90% 70%,#ffd37a,transparent),radial-gradient(1px 1px at 25% 85%,#fff,transparent);animation:lfdrift 40s linear infinite;pointer-events:none;opacity:.7}
.lf-hero{position:relative;display:flex;gap:18px;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}
.lf-eyebrow{font:600 11px/1 system-ui,sans-serif;letter-spacing:.32em;color:#7fb5ff}.lf h1{margin:6px 0 4px;font:900 clamp(28px,5vw,46px)/1 system-ui,sans-serif;letter-spacing:.14em;background:linear-gradient(90deg,#fff,#7fd0ff 45%,#ffd37a);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 14px rgba(90,170,255,.55))}
.lf-hero p{margin:0;max-width:520px;color:#9fb3d9;font-size:.95em}
.lf-kpis{display:flex;gap:10px;flex-wrap:wrap}.lf-kpis>div{min-width:116px;padding:9px 14px;border-radius:12px;background:rgba(10,30,90,.55);border:1px solid rgba(120,170,255,.3);backdrop-filter:blur(6px);display:flex;flex-direction:column}
.lf-kpis b{font:800 28px/1 system-ui,sans-serif;color:#7fe7ff;text-shadow:0 0 12px rgba(90,200,255,.6)}.lf-kpis span{font-size:.74em;color:#9fb3d9;margin-top:3px}.lf-kpis .gold b{color:#ffd37a;text-shadow:0 0 12px rgba(255,200,90,.7)}.lf-kpis .hot b{color:#ff8a7a;text-shadow:0 0 12px rgba(255,100,80,.6)}
.lf-scroll{position:relative;overflow-x:auto;padding-bottom:6px}.lf-road{display:grid;grid-template-columns:repeat(7,minmax(190px,1fr));gap:12px;min-width:1400px;position:relative}
.lf-col{position:relative;display:flex;flex-direction:column;align-items:center;padding:10px 8px 12px;border-radius:16px;background:linear-gradient(180deg,rgba(14,40,110,.5),rgba(8,20,60,.35));border:1px solid rgba(120,170,255,.2);animation:lfrise .7s ease-out backwards;animation-delay:calc(var(--i)*.08s)}
.lf-col.gate{border-color:rgba(255,200,90,.45);box-shadow:0 0 22px rgba(255,190,70,.12) inset}.lf-col.gate.has{box-shadow:0 0 28px rgba(255,190,70,.28) inset,0 0 22px rgba(255,190,70,.18)}
.lf-link{position:absolute;left:-13px;top:44px;width:14px;height:3px;background:linear-gradient(90deg,transparent,#7fd0ff,transparent);background-size:200% 100%;animation:lfflow 1.6s linear infinite;border-radius:3px;box-shadow:0 0 8px #7fd0ff}
.lf-node{position:relative;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:24px;background:radial-gradient(circle at 35% 30%,#2a62ff,#0a2a8f);box-shadow:0 0 22px rgba(70,150,255,.7),inset 0 0 14px rgba(180,230,255,.5);animation:lfglow 3s ease-in-out infinite}
.lf-col.gate .lf-node{background:radial-gradient(circle at 35% 30%,#ffcf6a,#b8730a);box-shadow:0 0 22px rgba(255,190,70,.7),inset 0 0 14px rgba(255,240,200,.5)}
.lf-node em{position:absolute;bottom:-8px;font:800 8px/1 system-ui,sans-serif;letter-spacing:.12em;padding:2px 6px;border-radius:999px;background:#2a1a00;color:#ffd37a;border:1px solid #c9964a;font-style:normal}
.lf-robot{width:44px;margin-top:10px;display:flex;flex-direction:column;align-items:center}.lf-robot small{font:700 10px/1 system-ui,sans-serif;color:#cfe0ff;margin-top:1px}.lf-robot.sm{width:36px;margin:0}
.lf-col h3{margin:8px 0 0;font:700 13px/1.2 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#cfe0ff;text-align:center}.lf-count{font:900 34px/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 14px rgba(110,190,255,.7);margin:4px 0}.lf-col.gate .lf-count{color:#ffe0a0;text-shadow:0 0 14px rgba(255,200,90,.7)}
.lf-blurb{margin:0 0 8px;font-size:.74em;color:#8da3cc;text-align:center;min-height:2.6em}
.lf-cards{display:flex;flex-direction:column;gap:7px;width:100%}
.lf-card{width:100%;text-align:left;padding:8px 10px;border-radius:11px;background:linear-gradient(180deg,rgba(40,80,190,.45),rgba(14,34,100,.6));border:1px solid rgba(130,180,255,.4);color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:2px;transition:transform .18s,box-shadow .18s;font:inherit}
.lf-card:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 8px 22px rgba(60,140,255,.45)}.lf-card b{font-size:.92em;color:#fff}.lf-card span{font-size:.76em;color:#a9bfe8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lf-card.urgent{border-color:rgba(255,150,100,.7);animation:lfurgent 1.8s ease-in-out infinite}
.lf-meta{display:flex;gap:6px;margin-top:2px}.lf-meta em{font-style:normal;font-size:.68em;padding:1px 7px;border-radius:999px;background:rgba(120,170,255,.2);color:#cfe0ff}
.lf-flag{font-size:.74em;color:#ffc98a;margin-top:2px}.lf-more{border:1px dashed rgba(130,180,255,.5);background:transparent;color:#9fc0ff;border-radius:10px;padding:5px;cursor:pointer}.lf-empty{font-size:.76em;color:#6f86b3;text-align:center;padding:10px 0;font-style:italic}
.lf-stale{border:1px solid rgba(130,180,255,.4);background:rgba(20,50,130,.4);color:#9fc0ff;border-radius:999px;padding:4px 12px;cursor:pointer;margin-right:10px;font:inherit}
.lf-foot{position:relative;margin-top:10px;font-size:.8em;color:#7f97c4;text-align:center}.lf-foot a{color:#7fd0ff}
.lf-dlg .lf-who{display:flex;gap:10px;align-items:center}.lf-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.lf-act p{flex-basis:100%;margin:0}
.lf-days{display:flex;gap:6px;flex-wrap:wrap;flex-basis:100%}.lf-days button{border:1px solid var(--line,#c9d6ea);background:transparent;border-radius:9px;padding:6px 9px;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;color:inherit;font:inherit}.lf-days .ok{border-color:#2f9e6e}.lf-days .no{opacity:.55}.lf-days .on{background:rgba(47,110,246,.18);border-color:#2f6df6}.lf-days span{font-size:.72em;opacity:.75}
@keyframes lfdrift{to{transform:translateY(-60px)}}@keyframes lfrise{from{opacity:0;transform:translateY(16px)}}@keyframes lfflow{to{background-position:-200% 0}}@keyframes lfglow{50%{box-shadow:0 0 34px rgba(90,170,255,.9),inset 0 0 16px rgba(200,240,255,.6)}}@keyframes lfurgent{50%{box-shadow:0 0 18px rgba(255,120,80,.55)}}
@media (prefers-reduced-motion:reduce){.lf *,.lf:before{animation:none!important}}
@media (max-width:760px){.lf-road{min-width:1250px}.lf-kpis>div{min-width:100px}}
`;
