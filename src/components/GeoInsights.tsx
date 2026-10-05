// Client Distribution Map + Area Performance Insights (Executive Dashboard). Exact pins and all money columns are Admin / CEO only.
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, Field, Modal, attempt } from '@/components/ui';
import { STAGES, areaHighlights, areaRows, mapData, sortAreas, type AreaRow, type AreaSort, type Pin, type Scope } from '@/lib/insights';
import { setManualLocation } from '@/lib/geocode';
import { locate } from '@/lib/geo-ph';
import { fmtDate, money } from '@/lib/util';
import type { DB } from '@/lib/types';

const ClientMap = lazy(() => import('./ClientMap'));
const STAGE_COLOR = { Lead: '#9db0c5', Quoted: '#B7791F', Booked: '#0E9AA7', Completed: '#0B2545' } as const;
const SORTS: [AreaSort, string][] = [['clients', 'Client count'], ['billed', 'Billed revenue'], ['jobs', 'Job count'], ['outstanding', 'Outstanding']];

export default function GeoInsights({ db, scope }: { db: DB; scope: Scope }) {
  const exec = scope.exec;
  const geo = useMemo(() => mapData(db, scope), [db, scope]);
  const areas = useMemo(() => areaRows(db, scope), [db, scope]);
  const [sel, setSel] = useState<Pin[]>([]);
  const [selArea, setSelArea] = useState<AreaRow | null>(null);
  const [by, setBy] = useState<AreaSort>(exec ? 'billed' : 'clients');
  const [fix, setFix] = useState<MapFix | null>(null);
  const sorted = useMemo(() => sortAreas(areas, by), [areas, by]);
  const hi = useMemo(() => areaHighlights(areas, exec), [areas, exec]);
  const sorts = exec ? SORTS : SORTS.filter(([k]) => k === 'clients' || k === 'jobs');

  return (
    <>
      <Card title="Client distribution map" actions={<div className="legend">{STAGES.map((s) => <span key={s}><i style={{ background: STAGE_COLOR[s] }} />{s}</span>)}</div>}>
        {!exec && <p className="small muted" style={{ marginTop: 0 }}>Showing city / area totals only. Exact client locations are visible to the Admin / CEO.</p>}
        <div className="map-split">
          <Suspense fallback={<div className="client-map" style={{ display: 'grid', placeItems: 'center' }}><span className="muted">Loading map…</span></div>}>
            <ClientMap pins={geo.pins} areas={areas} exact={exec} onSelect={setSel} onArea={setSelArea} />
          </Suspense>
          <div style={{ maxHeight: 440, overflow: 'auto' }}>
            {exec && !sel.length && <Empty>Select a pin or a cluster to see the client, location, services and balances.</Empty>}
            {exec && sel.length > 0 && <div className="small muted" style={{ marginBottom: 6 }}>{sel.length} location{sel.length === 1 ? '' : 's'} selected · <button className="btn sm" onClick={() => setSel([])}>Clear</button></div>}
            {exec && sel.slice(0, 40).map((p) => <PinCard key={p.key} p={p} />)}
            {exec && sel.length > 40 && <div className="small muted">…and {sel.length - 40} more — zoom in to see them.</div>}
            {!exec && !selArea && <Empty>Select a city bubble to see its totals.</Empty>}
            {!exec && selArea && <AreaCard a={selArea} />}
          </div>
        </div>
        {geo.unmapped.length > 0 && (
          <div style={{ marginTop: 12 }} className="small">
            <b style={{ color: 'var(--amber)' }}>{geo.unmapped.length} location{geo.unmapped.length === 1 ? '' : 's'} could not be placed on the map</b>
            {exec ? <span className="muted"> — the booking is saved as normal; correct the location here: </span> : <span className="muted"> — an Admin can correct these addresses.</span>}
            {exec && <ul className="list" style={{ marginTop: 6 }}>{geo.unmapped.slice(0, 8).map((u) => <li key={`${u.table}${u.id}`}><div><Link to={`/clients/${u.clientId}`}><b>{u.clientName}</b></Link><div className="muted">{u.address || 'No address'}</div></div><button className="btn sm" onClick={() => setFix({ ...u, lat: '', lng: '', q: u.address })}>Fix location</button></li>)}{geo.unmapped.length > 8 && <li className="muted">…and {geo.unmapped.length - 8} more</li>}</ul>}
          </div>
        )}
      </Card>

      <div style={{ height: 14 }} />
      <Card title="Area performance — top service areas" actions={<Field label="Sort by" className="inline"><select value={by} onChange={(e) => setBy(e.target.value as AreaSort)}>{sorts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>} flush>
        {sorted.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Area</th><th className="num">Clients</th><th className="num">Completed jobs</th>{exec && <><th className="num">Billed revenue</th><th className="num">Verified collections</th><th className="num">Outstanding</th><th className="num">Avg job value</th></>}<th className="num">Repeat clients</th><th>Most requested</th>{exec && <th>Profitability</th>}</tr></thead>
            <tbody>{sorted.map((a, i) => (
              <tr key={a.key}>
                <td>{i + 1}</td><td><b>{a.label}</b></td><td className="num">{a.clients}</td><td className="num">{a.jobs}</td>
                {exec && <><td className="num mono">{money(a.billed)}</td><td className="num mono">{money(a.collected)}</td><td className="num mono">{a.outstanding > 0.005 ? money(a.outstanding) : '—'}</td><td className="num mono">{a.jobs ? money(a.avgJob) : '—'}</td></>}
                <td className="num">{a.repeatClients}</td><td>{a.topService}</td>
                {exec && <td>{a.gross === undefined ? <Badge tone="amber">Pending Cost Data</Badge> : <span className="mono">{money(a.gross)}</span>}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>No client locations match these filters.</Empty>}
      </Card>

      <div className="grid g3" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Top title="Top 5 client-dense areas" rows={hi.dense} val={(a) => `${a.clients} clients`} />
        {exec && <Top title="Top 5 revenue areas" rows={hi.revenue} val={(a) => money(a.billed)} />}
        <Top title="Overdue follow-ups" rows={hi.overdue} val={(a) => `${a.overdueFollowUps} overdue`} />
        {exec && <Top title="Most unpaid receivables" rows={hi.unpaid} val={(a) => money(a.outstanding)} />}
        <Top title="Strong repeat-service potential" rows={hi.repeat} val={(a) => `${a.repeatPotential} clients to re-engage`} />
      </div>
      {fix && <FixLocation fix={fix} onClose={() => setFix(null)} />}
    </>
  );
}

function Top({ title, rows, val }: { title: string; rows: AreaRow[]; val: (a: AreaRow) => string }) {
  return <Card title={title} flush><ul className="list">{rows.map((a, i) => <li key={a.key}><span><b>{i + 1}.</b> {a.label}</span><span className="mono small">{val(a)}</span></li>)}{!rows.length && <li className="muted">Nothing to show.</li>}</ul></Card>;
}
function AreaCard({ a }: { a: AreaRow }) {
  return <div className="pin-card"><b>{a.label}</b><dl><dt>Clients</dt><dd>{a.clients}</dd><dt>Completed jobs</dt><dd>{a.jobs}</dd><dt>Repeat clients</dt><dd>{a.repeatClients}</dd><dt>Most requested</dt><dd>{a.topService}</dd><dt>Overdue follow-ups</dt><dd>{a.overdueFollowUps}</dd></dl></div>;
}
function PinCard({ p }: { p: Pin }) {
  return (
    <div className="pin-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><Link to={`/clients/${p.clientId}`}><b>{p.clientName}</b></Link><Badge tone={p.stage === 'Completed' ? 'navy' : p.stage === 'Booked' ? 'teal' : p.stage === 'Quoted' ? 'amber' : 'gray'}>{p.stage}</Badge></div>
      <div className="small muted">{p.siteName} · {p.address}{p.precision !== 'precise' && ` (≈ ${p.precision}-level position)`}</div>
      <dl>
        <dt>Completed services</dt><dd>{p.completed}</dd>
        <dt>Services</dt><dd>{p.services.join(', ') || '—'}</dd>
        <dt>Lifetime billed (incl. VAT)</dt><dd className="mono">{money(p.billed)}</dd>
        <dt>Verified collected</dt><dd className="mono">{money(p.collected)}</dd>
        <dt>Outstanding</dt><dd className="mono">{money(p.outstanding)}</dd>
        <dt>Last service</dt><dd>{p.lastService ? fmtDate(p.lastService) : '—'}</dd>
        <dt>Next follow-up</dt><dd>{p.nextFollowUp ? `${fmtDate(p.nextFollowUp)} · ${p.followStatus}` : '—'}</dd>
      </dl>
    </div>
  );
}

interface MapFix { table: 'sites' | 'clients' | 'ocular_visits'; id: string; address: string; clientName: string; lat: string; lng: string; q: string }
function FixLocation({ fix, onClose }: { fix: MapFix; onClose: () => void }) {
  const [f, setF] = useState(fix);
  const hit = locate(f.q);
  return (
    <Modal title={`Fix location — ${fix.clientName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => {
      const lat = Number(f.lat), lng = Number(f.lng);
      if (attempt(() => { if (!Number.isFinite(lat) || !Number.isFinite(lng) || f.lat === '' || f.lng === '') throw new Error('Enter the latitude and longitude, or use a suggested city.'); setManualLocation(f.table, f.id, lat, lng, hit?.city, hit?.province); return true; }, 'Location saved')) onClose();
    }}>Save location</button></>}>
      <p className="small muted">The saved address stays as written ({fix.address || 'none'}). This only sets where it appears on the map.</p>
      <Field label="Search a city / area"><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
      {hit && <p className="small">Match: <b>{hit.city || hit.province}</b>{hit.city && `, ${hit.province}`} <button className="btn sm" onClick={() => setF({ ...f, lat: String(hit.lat), lng: String(hit.lng) })}>Use this</button></p>}
      <div className="grid g2"><Field label="Latitude"><input inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="14.5547" /></Field><Field label="Longitude"><input inputMode="decimal" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="121.0244" /></Field></div>
    </Modal>
  );
}
