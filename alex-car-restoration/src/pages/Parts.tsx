import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Icon, PartStatusPill, RiskPill, Seg, carName } from '../components/ui';
import { diffDays, fmtDate, todayIso } from '../lib/dates';
import { isPartIn, money, partRisk, partStatusLabel, RISK_RANK } from '../lib/logic';
import { useStore } from '../lib/store';
import type { PartKind, PartStatus } from '../lib/types';

const NEXT: Partial<Record<PartStatus, PartStatus>> = { needed: 'ordered', ordered: 'shipped', shipped: 'received', backordered: 'shipped' };
const COLUMNS: PartStatus[] = ['needed', 'ordered', 'shipped', 'backordered', 'received'];
type Kind = 'all' | PartKind;

export default function Parts() {
  const { data, dispatch } = useStore();
  const [kind, setKind] = useState<Kind>('all');
  const today = todayIso();
  const list = data.parts.filter((x) => kind === 'all' || x.kind === kind);
  const open = list.filter((x) => !isPartIn(x));
  const exposure = open.reduce((s, x) => s + x.cost, 0);

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{open.length} open · {money(exposure)} on order</div><h1>Parts & sublets</h1>
          <p>Everything the work is waiting on — parts from suppliers and jobs sent to outside specialists (machine shop, chrome, upholstery).</p></div>
        <Seg<Kind> value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'part', label: 'Parts' }, { value: 'sublet', label: 'Sublet jobs' }]} />
      </div>

      <div className="kan">
        {COLUMNS.map((col) => {
          const items = list.filter((x) => (col === 'received' ? x.status === 'received' : x.status === col)).sort((a, b) => RISK_RANK[partRisk(a, today)] - RISK_RANK[partRisk(b, today)] || a.neededBy.localeCompare(b.neededBy));
          return (
            <div key={col} className="kcol">
              <h3><span>{kind === 'sublet' ? partStatusLabel('sublet', col) : partStatusLabel('part', col)}</span><span>{items.length}</span></h3>
              {items.length === 0 && <div className="muted small" style={{ padding: 8 }}>—</div>}
              {items.map((x) => {
                const p = data.projects.find((y) => y.id === x.projectId)!;
                const r = partRisk(x, today);
                const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
                const next = NEXT[x.status];
                return (
                  <div className="kcard" key={x.id}>
                    <div className="row spread" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <strong>{x.name}</strong>{r !== 'ok' && <RiskPill r={r} />}
                    </div>
                    <div className="small muted">{x.kind === 'sublet' ? 'Sublet · ' : ''}{x.supplier}{x.po ? ` · ${x.po}` : ''}</div>
                    <Link to={`/projects/${p.id}`} className="small" style={{ color: 'var(--accent)' }}>{p.code} · {carName(p)}</Link>
                    <div className="small" style={{ marginTop: 6 }}>
                      Needed <b>{fmtDate(x.neededBy)}</b>{x.eta && <> · ETA <b className={gap! > 0 || r === 'late' ? 'over' : ''}>{fmtDate(x.eta)}</b></>}
                      {gap !== null && gap > 0 && !isPartIn(x) && <span className="over"> (+{gap}d)</span>}
                    </div>
                    {x.note && <div className="small muted" style={{ marginTop: 4 }}>{x.note}</div>}
                    {!isPartIn(x) && (
                      <div className="row" style={{ marginTop: 8 }}>
                        <input type="date" className="inline" value={x.eta ?? ''} title="Update ETA" style={{ fontSize: 12, padding: '3px 6px' }}
                          onChange={(e) => dispatch({ type: 'updatePart', id: x.id, patch: { eta: e.target.value || undefined } })} />
                        {x.status !== 'backordered' && x.status !== 'needed' && <button className="sm" onClick={() => dispatch({ type: 'setPartStatus', id: x.id, status: 'backordered' })}>Delayed</button>}
                        {next && <button className="sm primary" onClick={() => dispatch({ type: 'setPartStatus', id: x.id, status: next })}>{partStatusLabel(x.kind, next)} <Icon name="arrow" size={12} /></button>}
                      </div>
                    )}
                    {x.status === 'received' && <div className="row" style={{ marginTop: 8 }}><PartStatusPill part={x} /><button className="sm" onClick={() => dispatch({ type: 'setPartStatus', id: x.id, status: 'installed' })}>Mark installed</button></div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {list.length === 0 && <Empty>No items.</Empty>}
      <Card className="mt" title="Why this matters">
        <p className="small muted" style={{ margin: 0 }}>
          Tasks linked to a part or sublet job are automatically marked <b>blocked</b> on the schedule until it is received. Moving a card to <b>Received</b> frees the work instantly.
          A red date means the part lands after the day the work needs it.
        </p>
      </Card>
    </>
  );
}
