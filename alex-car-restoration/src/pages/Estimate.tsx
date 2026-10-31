import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SmsAction } from '../components/Sms';
import { Card, Icon, Ring, Seg } from '../components/ui';
import { fmtDate, todayIso } from '../lib/dates';
import { defaultEstimate, estimateTotals, lineTotal } from '../lib/estimate';
import { PACKAGES, SERVICES, SERVICE_KEYS, moneyC } from '../lib/logic';
import { useStore } from '../lib/store';
import type { Estimate, EstimateLine, ServiceType } from '../lib/types';

type Group = 'labor' | 'parts' | 'materials' | 'outside';
const GROUPS: { key: Group; title: string; qty: string; unit: string; color: string; sample: string }[] = [
  { key: 'labor', title: 'Labour', qty: 'Hours', unit: 'Rate per hour', color: 'var(--arc)', sample: 'Bodywork' },
  { key: 'parts', title: 'Parts', qty: 'Qty', unit: 'Price each', color: '#ff4d8d', sample: 'Fender pair' },
  { key: 'materials', title: 'Paint and materials', qty: 'Qty', unit: 'Price each', color: '#ffb04d', sample: 'Primer and clear coat' },
  { key: 'outside', title: 'Outside work', qty: 'Qty', unit: 'Price each', color: '#8b7bff', sample: 'Machine shop' },
];

export default function EstimatePage() {
  const { data } = useStore();
  const nav = useNavigate();
  const today = todayIso();
  const [service, setService] = useState<ServiceType>('restoration');
  const [est, setEst] = useState<Estimate>(() => defaultEstimate('restoration', data, today));
  const [customerId, setCustomerId] = useState('');
  const [car, setCar] = useState('');
  const [pkgIdx, setPkgIdx] = useState(0);
  const isPackage = SERVICES[service].pricing === 'package';
  const packages = service === 'detailing' || service === 'ceramic' ? PACKAGES[service] : [];
  const t = useMemo(() => estimateTotals(est), [est]);
  const customer = data.customers.find((c) => c.id === customerId);

  function chooseService(next: ServiceType) {
    setService(next);
    if (SERVICES[next].pricing === 'package') applyPackage(next, 0);
    else setEst(defaultEstimate(next, data, today));
  }
  function applyPackage(s: ServiceType, i: number) {
    const pkg = (s === 'detailing' || s === 'ceramic' ? PACKAGES[s] : [])[i];
    setPkgIdx(i);
    setEst({ labor: [], parts: pkg ? [{ label: pkg.name, qty: 1, unit: pkg.price }] : [], materials: [], outside: [], markupPct: 0, discount: 0, vat: false, createdOn: today });
  }
  const setLines = (g: Group, f: (ls: EstimateLine[]) => EstimateLine[]) => setEst((e) => ({ ...e, [g]: f(e[g]) }));
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v)));
  const lines = [...est.labor, ...est.parts, ...est.materials, ...est.outside].filter((l) => lineTotal(l) > 0);
  const quoteNo = `EST-${today.replaceAll('-', '')}`;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">For the service advisor</div><h1>Estimate calculator</h1><p>Add up the work, set the markup, and send the quote.</p></div>
      </div>

      <div className="grid g21">
        <div className="stack">
          <Card>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Service</div>
            <Seg<ServiceType> value={service} onChange={chooseService} options={SERVICE_KEYS.map((k) => ({ value: k, label: SERVICES[k].label }))} />
            {isPackage && (
              <label className="form" style={{ display: 'block', marginTop: 12 }}>
                <span className="small muted">Package</span>
                <select value={pkgIdx} onChange={(e) => applyPackage(service, Number(e.target.value))} style={{ width: '100%' }}>{packages.map((p, i) => <option key={p.name} value={i}>{p.name} · ₱{p.price.toLocaleString('en-PH')}</option>)}</select>
              </label>
            )}
          </Card>

          {GROUPS.filter((g) => !isPackage || g.key === 'parts').map((g) => (
            <Card key={g.key} title={isPackage ? 'Package price' : g.title} action={<span className="num small" style={{ color: g.color }}>{moneyC(t[g.key])}</span>}>
              {est[g.key].map((l, i) => (
                <div key={i} className="calc-row">
                  <input value={l.label} placeholder={g.sample} onChange={(e) => setLines(g.key, (ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Item" />
                  <input type="number" min="0" step="any" value={l.qty || ''} placeholder={g.qty} onChange={(e) => setLines(g.key, (ls) => ls.map((x, j) => (j === i ? { ...x, qty: num(e.target.value) } : x)))} aria-label={g.qty} />
                  <input type="number" min="0" step="any" value={l.unit || ''} placeholder={g.unit} onChange={(e) => setLines(g.key, (ls) => ls.map((x, j) => (j === i ? { ...x, unit: num(e.target.value) } : x)))} aria-label={g.unit} />
                  <span className="num calc-total">{moneyC(lineTotal(l))}</span>
                  <button type="button" className="sm ghost" title="Remove" onClick={() => setLines(g.key, (ls) => ls.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {est[g.key].length === 0 && <div className="small muted">Nothing here yet.</div>}
              {!isPackage && <button type="button" className="sm" style={{ marginTop: 10 }} onClick={() => setLines(g.key, (ls) => [...ls, { label: '', qty: g.key === 'labor' ? 8 : 1, unit: g.key === 'labor' ? Math.round(est.labor[0]?.unit || 500) : 0 }])}><Icon name="plus" size={13} />Add {g.title.toLowerCase()}</button>}
              <div className="small muted" style={{ marginTop: 6 }}>{g.qty} × {g.unit.toLowerCase()}</div>
            </Card>
          ))}

          <Card title="Price">
            <div className="form" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              <label>Markup (%)<input type="number" min="0" step="any" value={est.markupPct || ''} placeholder="0" onChange={(e) => setEst({ ...est, markupPct: num(e.target.value) })} /></label>
              <label>Discount (₱)<input type="number" min="0" step="any" value={est.discount || ''} placeholder="0" onChange={(e) => setEst({ ...est, discount: num(e.target.value) })} /></label>
              <label className="chk" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={est.vat} onChange={(e) => setEst({ ...est, vat: e.target.checked })} />Add 12% VAT</label>
            </div>
          </Card>
        </div>

        <div className="stack" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
          <Card title="Quote" action={<span className="muted small">{quoteNo}</span>}>
            <div className="form" style={{ gridTemplateColumns: '1fr', marginBottom: 12 }}>
              <label>Client<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Not chosen yet</option>{data.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Car<input value={car} onChange={(e) => setCar(e.target.value)} placeholder="2019 Toyota Fortuner" /></label>
            </div>
            <div className="row" style={{ gap: 18, flexWrap: 'nowrap', alignItems: 'center' }}>
              <div className="grow">
                <div className="eyebrow">Total</div>
                <div className="serif" style={{ fontSize: 40, lineHeight: 1 }}>{moneyC(t.total)}</div>
              </div>
              {!isPackage && t.cost > 0 && <Ring value={Math.max(0, Math.min(100, t.marginPct))} size={78} stroke={7} tone={t.marginPct >= 25 ? 'green' : t.marginPct >= 15 ? 'amber' : 'red'} label={`${t.marginPct}%`} />}
            </div>
            {t.cost > 0 && (
              <>
                <div className="hbar-track" style={{ margin: '14px 0 6px' }} role="img" aria-label="Where the cost goes">
                  {GROUPS.filter((g) => t[g.key] > 0).map((g) => <i key={g.key} style={{ flex: t[g.key], background: g.color }} title={`${g.title}: ${moneyC(t[g.key])}`} />)}
                </div>
                <div className="hbar-key">{GROUPS.filter((g) => t[g.key] > 0).map((g) => <span key={g.key}><i style={{ background: g.color }} />{g.title} {Math.round((t[g.key] / t.cost) * 100)}%</span>)}</div>
              </>
            )}
            <table className="sum">
              <tbody>
                <tr><td>Cost</td><td className="num">{moneyC(t.cost)}</td></tr>
                {t.markup > 0 && <tr><td>Markup {est.markupPct}%</td><td className="num">+ {moneyC(t.markup)}</td></tr>}
                {t.discount > 0 && <tr><td>Discount</td><td className="num">− {moneyC(t.discount)}</td></tr>}
                {t.vat > 0 && <tr><td>VAT 12%</td><td className="num">+ {moneyC(t.vat)}</td></tr>}
                <tr className="tot"><td>Total</td><td className="num">{moneyC(t.total)}</td></tr>
              </tbody>
            </table>
            {t.marginPct < 15 && t.cost > 0 && !isPackage && <div className="small warn" style={{ marginTop: 8 }}>The profit is thin. Raise the markup or check the costs.</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="primary" disabled={t.total <= 0} onClick={() => nav('/intake', { state: { estimate: est, service, price: Math.round(t.total), customerId: customerId || undefined, car: car || undefined, packageName: isPackage ? packages[pkgIdx]?.name : undefined } })}>Start the job</button>
              <button className="sm" disabled={t.total <= 0} onClick={() => window.print()}>Print or save PDF</button>
              {customer && t.total > 0 && <SmsAction customer={customer} kind="estimate" label="Send to client" />}
            </div>
          </Card>
        </div>
      </div>

      <section className="quote-sheet" aria-hidden>
        <h1>Alex Car Restoration</h1>
        <p>Estimate {quoteNo} · {fmtDate(today)} {today.slice(0, 4)}</p>
        <p><b>{customer?.name ?? 'Client'}</b>{car ? ` · ${car}` : ''} · {SERVICES[service].label}</p>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={i}><td>{l.label || 'Item'}</td><td>{l.qty}</td><td>{moneyC(l.unit)}</td><td>{moneyC(lineTotal(l))}</td></tr>)}</tbody>
        </table>
        {t.markup > 0 && <p>Service fee: {moneyC(t.markup)}</p>}
        {t.discount > 0 && <p>Discount: − {moneyC(t.discount)}</p>}
        {t.vat > 0 && <p>VAT 12%: {moneyC(t.vat)}</p>}
        <h2>Total {moneyC(t.total)}</h2>
        <p>This estimate is valid for 14 days.</p>
      </section>
    </>
  );
}
