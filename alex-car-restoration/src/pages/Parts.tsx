import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, statusTone } from '../components/ui';
import { fmtDate } from '../lib/dates';
import { money } from '../lib/logic';
import { useStore } from '../lib/store';
import type { PartStatus } from '../lib/types';

const FLOW: PartStatus[] = ['needed', 'ordered', 'received', 'installed'];

export default function Parts() {
  const { data, dispatch } = useStore();
  const [filter, setFilter] = useState<PartStatus | 'open'>('open');
  const rows = data.parts.filter((x) => (filter === 'open' ? x.status === 'needed' || x.status === 'ordered' : x.status === filter));
  const total = rows.reduce((s, x) => s + x.cost, 0);

  return (
    <>
      <div className="head"><h1>Parts & orders</h1><span className="muted">{rows.length} items · {money(total)}</span></div>
      <div className="row" style={{ marginBottom: 12 }}>
        {(['open', ...FLOW] as const).map((f) => <button key={f} className={`sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>{f === 'open' ? 'To order / on order' : f}</button>)}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Project</th><th>Supplier</th><th>Cost</th><th>ETA</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((x) => {
              const p = data.projects.find((y) => y.id === x.projectId);
              return (
                <tr key={x.id}>
                  <td>{x.name}</td><td>{p && <Link to={`/projects/${p.id}`}>{p.code}</Link>}</td><td>{x.supplier}</td><td>{money(x.cost)}</td>
                  <td>{x.eta ? fmtDate(x.eta) : '—'}</td>
                  <td><Badge tone={statusTone[x.status]}>{x.status}</Badge>{' '}
                    <select value={x.status} onChange={(e) => dispatch({ type: 'setPartStatus', id: x.id, status: e.target.value as PartStatus })}>
                      {FLOW.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
