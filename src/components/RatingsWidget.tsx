// Team ratings for the Admin dashboard: average, spread, top performers and people who could use support.
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { Badge, Bar, Card, Empty } from '@/components/ui';
import { ratingLabel, ratingStats, ratingTone, stars } from '@/lib/rating-core';

export function RatingsWidget() {
  const { db, can } = useAuth();
  if (!can('performance.view')) return null;
  const s = ratingStats(db);
  const row = (e: (typeof s.rated)[number]) => <li key={e.id}><span><Link to={`/employees/${e.id}`}><b>{e.full_name}</b></Link><span className="small muted"> · {e.position}</span></span><span><span style={{ color: '#f5b83d' }}>{stars(e.rating!)}</span> <b>{e.rating!.toFixed(1)}</b></span></li>;
  return (
    <Card title="Employee ratings" actions={<Link to="/employees" className="btn sm">Scorecards</Link>}>
      {s.avg === undefined ? <Empty>Ratings appear after employees have approved attendance.</Empty> : <>
        <div className="grid g3" style={{ gridTemplateColumns: 'minmax(150px, .8fr) minmax(0, 1.2fr) minmax(0, 1.2fr)', alignItems: 'start' }}>
          <div>
            <div className="small muted" style={{ textTransform: 'uppercase', fontWeight: 650, letterSpacing: '.05em' }}>Team average</div>
            <div style={{ fontSize: 34, fontWeight: 750, lineHeight: 1.1 }}>{s.avg.toFixed(1)} <span className="muted" style={{ fontSize: 16 }}>/ 5</span></div>
            <div style={{ color: '#f5b83d', fontSize: 18 }}>{stars(s.avg)}</div>
            <Badge tone={ratingTone(s.avg)}>{ratingLabel(s.avg)}</Badge>
            <div className="small muted" style={{ marginTop: 6 }}>{s.rated.length} rated{s.unrated ? ` · ${s.unrated} not yet` : ''}</div>
          </div>
          <div>{s.dist.map((d) => <div key={d.star} className="row" style={{ gap: 8, marginBottom: 4 }}><span className="small" style={{ width: 28 }}>{d.star} ★</span><div className="grow"><Bar value={d.n} max={Math.max(1, ...s.dist.map((x) => x.n))} /></div><span className="small" style={{ width: 22, textAlign: 'right' }}>{d.n}</span></div>)}</div>
          <div><div className="small muted" style={{ fontWeight: 650, marginBottom: 4 }}>Needs support (below 3.0)</div><ul className="list">{s.support.map(row)}{!s.support.length && <li className="muted">No one below 3.0 — great!</li>}</ul></div>
        </div>
        <div className="small muted" style={{ fontWeight: 650, margin: '12px 0 2px' }}>Top performers</div>
        <ul className="list">{s.top.map(row)}</ul>
      </>}
    </Card>
  );
}
