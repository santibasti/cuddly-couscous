import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Icon, RiskPill, Seg, carName } from '../components/ui';
import { diffDays, fmtDate, todayIso } from '../lib/dates';
import { isPartIn, money, partRisk, partStatusLabel, RISK_RANK } from '../lib/logic';
import { useStore } from '../lib/store';
import type { PartKind, PartStatus } from '../lib/types';

const NEXT: Partial<Record<PartStatus, PartStatus>> = { needed: 'ordered', ordered: 'shipped', shipped: 'received', backordered: 'shipped' };
const COLUMNS: PartStatus[] = ['needed', 'ordered', 'shipped', 'backordered'];
type Kind = 'all' | PartKind;

export default function Parts() {
  const { data, dispatch } = useStore();
  const [kind, setKind] = useState<Kind>('all');
  const today = todayIso();
  const list = data.parts.filter((x) => kind === 'all' || x.kind === kind);
  const open = list.filter((x) => !isPartIn(x));
  const arrived = list.filter((x) => x.status === 'received');
  const label = (s: PartStatus) => (kind === 'sublet' ? partStatusLabel('sublet', s) : partStatusLabel('part', s));

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{open.length} open · {money(open.reduce((s, x) => s + x.cost, 0))} on order</div>
          <h1>Parts &amp; sublets</h1>
          <p>Everything the work is waiting on: parts from suppliers and jobs sent to outside specialists such as the machine shop, chrome plater or upholsterer.</p>
        </div>
        <Seg<Kind> value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'part', label: 'Parts' }, { value: 'sublet', label: 'Sublet jobs' }]} />
      </div>

      <div className="kan">
        {COLUMNS.map((col) => {
          const items = list.filter((x) => x.status === col).sort((a, b) => RISK_RANK[partRisk(a, today)] - RISK_RANK[partRisk(b, today)] || a.neededBy.localeCompare(b.neededBy));
          return (
            <div key={col} className="kcol">
              <h3><span>{label(col)}</span><span>{items.length}</span></h3>
              {items.length === 0 && <div className="muted small" style={{ padding: '8px 6px' }}>Nothing here</div>}
              {items.map((x) => {
                const p = data.projects.find((y) => y.id === x.projectId)!;
                const r = partRisk(x, today);
                const gap = x.eta ? diffDays(x.neededBy, x.eta) : null;
                const next = NEXT[x.status];
                return (
                  <div className="kcard" key={x.id}>
                    <div className="row spread" style={{ flexWrap: 'nowrap', marginBottom: 8 }}>
                      <Link to={`/projects/${p.id}`} className="eyebrow">{p.code}</Link>
                      {r !== 'ok' && <RiskPill r={r} />}
                    </div>
                    <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{x.name}</div>
                    <div className="small muted">{x.kind === 'sublet' ? 'Sublet · ' : ''}{x.supplier}{x.po ? ` · ${x.po}` : ''}</div>
                    <div className="kdates">
                      <div><span>Needed</span><b>{fmtDate(x.neededBy)}</b></div>
                      <div><span>ETA</span><b className={r === 'late' || (gap ?? 0) > 0 ? 'over' : ''}>{x.eta ? fmtDate(x.eta) : '—'}</b></div>
                      <div><span>Cost</span><b>{money(x.cost)}</b></div>
                    </div>
                    {gap !== null && gap > 0 && <div className="small over">Lands {gap} day{gap > 1 ? 's' : ''} after it is needed</div>}
                    {x.note && <div className="small muted knote">{x.note}</div>}
                    <div className="kact">
                      {x.status !== 'needed' && (
                        <input type="date" aria-label="ETA" title="Update ETA" value={x.eta ?? ''} onChange={(e) => dispatch({ type: 'updatePart', id: x.id, patch: { eta: e.target.value || undefined } })} />
                      )}
                      {next && <button className="sm primary" onClick={() => dispatch({ type: 'setPartStatus', id: x.id, status: next })}>{partStatusLabel(x.kind, next)} <Icon name="arrow" size={12} /></button>}
                      {(x.status === 'ordered' || x.status === 'shipped') && <button className="sm" onClick={() => dispatch({ type: 'setPartStatus', id: x.id, status: 'backordered' })}>Delayed</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="section-t"><h2>Arrived — ready to fit</h2><span className="muted small">{arrived.length} items</span></div>
      <Card flush>
        {arrived.length === 0 && <Empty>Nothing waiting to be fitted.</Empty>}
        {arrived.map((x) => {
          const p = data.projects.find((y) => y.id === x.projectId)!;
          return (
            <div className="item" key={x.id}>
              <span className="ico"><Icon name={x.kind === 'sublet' ? 'truck' : 'box'} /></span>
              <div className="grow"><div style={{ fontWeight: 500 }}>{x.name}</div><div className="small muted">{x.supplier} · {p.code} · {carName(p)}</div></div>
              <span className="small muted">Needed {fmtDate(x.neededBy)}</span>
              <button className="sm" onClick={() => dispatch({ type: 'setPartStatus', id: x.id, status: 'installed' })}>Mark installed</button>
            </div>
          );
        })}
      </Card>
      <p className="small muted" style={{ marginTop: 16 }}>Tasks linked to a part or sublet job stay blocked on the schedule until it is received. Red dates mean it lands after the day the work needs it.</p>
    </>
  );
}
