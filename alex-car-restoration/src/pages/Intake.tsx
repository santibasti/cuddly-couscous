import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CarArt, Card, Icon, Pill, Seg } from '../components/ui';
import { DEFAULT_CHECKLIST, PAYMENT_KINDS, PAYMENT_LABEL, SOURCES, SOURCE_KEYS, customerStats } from '../lib/crm';
import { addDays, todayIso } from '../lib/dates';
import { BAYS, PACKAGES, SERVICES, SERVICE_KEYS, moneyC } from '../lib/logic';
import { paintHex } from '../lib/paint';
import { resizeImage } from '../lib/photo';
import { useStore } from '../lib/store';
import type { Estimate, LeadSource, PaymentKind, ServiceType } from '../lib/types';

const STEPS = ['Client', 'Car', 'Checklist', 'Job', 'Price', 'Agree'] as const;

interface Prefill { estimate?: Estimate; service?: ServiceType; price?: number; customerId?: string; car?: string; packageName?: string }

export default function Intake() {
  const { data, dispatch } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const pre = (useLocation().state ?? {}) as Prefill;
  const today = todayIso();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');

  // 1 client
  const [custId, setCustId] = useState(pre.customerId ?? params.get('customer') ?? '');
  const [isNew, setIsNew] = useState(!pre.customerId && !params.get('customer'));
  const [nc, setNc] = useState({ name: '', phone: '', email: '', birthday: '', source: '' as '' | LeadSource });
  // 2 car
  const carBits = (pre.car ?? '').trim().split(/\s+/);
  const [car, setCar] = useState({ year: /^\d{4}$/.test(carBits[0] ?? '') ? carBits[0] : '', make: carBits[1] ?? '', model: carBits.slice(2).join(' '), color: '', vin: '' });
  const [photo, setPhoto] = useState<string | undefined>();
  // 3 checklist
  const [orcr, setOrcr] = useState(false);
  const [items, setItems] = useState(DEFAULT_CHECKLIST.map((label) => ({ label, present: true })));
  const [notes, setNotes] = useState('');
  // 4 job
  const [svc, setSvc] = useState<ServiceType>(pre.service ?? 'restoration');
  const packages = svc === 'detailing' || svc === 'ceramic' ? PACKAGES[svc] : [];
  const [pkgIdx, setPkgIdx] = useState(Math.max(0, packages.findIndex((p) => p.name === pre.packageName)));
  const [title, setTitle] = useState('');
  const [bay, setBay] = useState('Unassigned');
  const [start, setStart] = useState(today);
  const [target, setTarget] = useState(addDays(today, SERVICES[pre.service ?? 'restoration'].typicalDays));
  const [scope, setScope] = useState(packages[Math.max(0, packages.findIndex((p) => p.name === pre.packageName))]?.scope ?? '');
  // 5 price
  const [price, setPrice] = useState(pre.price ? String(pre.price) : pre.service && (pre.service === 'detailing' || pre.service === 'ceramic') ? '' : '');
  // 6 agree
  const [agreed, setAgreed] = useState(false);
  const [payKind, setPayKind] = useState<PaymentKind | ''>('');
  const [payAmt, setPayAmt] = useState('');

  const isPackage = SERVICES[svc].pricing === 'package';
  const customer = data.customers.find((c) => c.id === custId);
  const stats = customer ? customerStats(data, customer) : undefined;
  const missing = [...(orcr ? [] : ['OR/CR copy']), ...items.filter((i) => !i.present).map((i) => i.label)];
  const clientName = isNew ? nc.name : customer?.name;

  function chooseService(next: ServiceType) {
    setSvc(next);
    setTarget(addDays(start, SERVICES[next].typicalDays));
    const list = next === 'detailing' || next === 'ceramic' ? PACKAGES[next] : [];
    setPkgIdx(0);
    setScope(list[0]?.scope ?? '');
    if (list[0]) setPrice(String(list[0].price));
  }
  function choosePackage(i: number) {
    setPkgIdx(i);
    const pkg = packages[i];
    if (pkg) { setPrice(String(pkg.price)); setScope(pkg.scope); }
  }
  function check(): string {
    if (step === 0) { if (isNew ? !nc.name.trim() || !nc.phone.trim() : !custId) return 'Choose the client, or fill in a name and phone number.'; }
    if (step === 1 && (!car.year || !car.make.trim() || !car.model.trim())) return 'Fill in the year, make and model.';
    if (step === 3 && target < start) return 'The target date cannot be before the start date.';
    if (step === 4 && !(Number(price) > 0)) return 'Enter the price for this job.';
    return '';
  }
  function next() { const e = check(); setErr(e); if (!e) setStep(step + 1); }

  function create() {
    const customerId = isNew ? `c${Date.now().toString(36)}` : custId;
    if (isNew) dispatch({ type: 'addCustomer', customer: { id: customerId, name: nc.name.trim(), phone: nc.phone.trim(), email: nc.email.trim(), birthday: nc.birthday || undefined, source: nc.source || undefined } });
    const id = `p${Date.now().toString(36)}`;
    const pkg = isPackage ? packages[pkgIdx] : undefined;
    const dep = payKind ? Math.round(Number(payAmt) || 0) : 0;
    dispatch({
      type: 'addProject',
      project: {
        id, service: svc, packageName: pkg?.name, customerId, title: pkg?.name ?? (title.trim() || SERVICES[svc].label),
        year: Number(car.year), make: car.make.trim(), model: car.model.trim(), color: car.color.trim(), vin: car.vin.trim(), scope,
        priority: 'normal', bay, startDate: start, targetDate: target, budget: Math.round(Number(price)), photo, receivedOn: start,
        intake: { orcr, items, notes: notes.trim() || undefined }, estimate: pre.estimate, status: agreed ? 'active' : 'quote',
        payments: dep > 0 && payKind ? [{ id: `${id}-pay`, date: today, amount: dep, kind: payKind }] : [],
      },
    });
    nav(`/projects/${id}`);
  }

  return (
    <>
      <div className="head"><div><div className="eyebrow">New job</div><h1>Intake</h1><p>One pass from the first call to the signed job.</p></div></div>
      <div className="wiz-steps" role="list">
        {STEPS.map((s, i) => (
          <button key={s} type="button" role="listitem" className={`ws ${i < step ? 'done' : ''} ${i === step ? 'cur' : ''}`} onClick={() => i < step && setStep(i)} disabled={i > step}>
            <span className="n">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>{s}
          </button>
        ))}
      </div>

      <div className="grid g21">
        <Card>
          {step === 0 && (
            <div className="stack">
              <h2 className="serif" style={{ fontSize: 26 }}>Who is the client?</h2>
              <Seg value={isNew ? 'new' : 'old'} onChange={(v) => setIsNew(v === 'new')} options={[{ value: 'new', label: 'New client' }, { value: 'old', label: 'Past client' }]} />
              {isNew ? (
                <div className="form" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
                  <label>Name<input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} autoFocus /></label>
                  <label>Phone<input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} inputMode="tel" /></label>
                  <label>Email<input type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></label>
                  <label>Birthday<input type="date" value={nc.birthday} onChange={(e) => setNc({ ...nc, birthday: e.target.value })} /></label>
                  <div className="full">
                    <div className="small muted" style={{ marginBottom: 6 }}>Where did they come from?</div>
                    <div className="seg" role="group" aria-label="Source">{SOURCE_KEYS.map((k) => <button type="button" key={k} className={nc.source === k ? 'on' : ''} onClick={() => setNc({ ...nc, source: nc.source === k ? '' : k })}>{SOURCES[k]}</button>)}</div>
                  </div>
                </div>
              ) : (
                <label className="form" style={{ display: 'block' }}>
                  <span className="small muted">Client</span>
                  <select value={custId} onChange={(e) => setCustId(e.target.value)} style={{ width: '100%' }}><option value="">Choose…</option>{data.customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select>
                  {stats && <div className="row small" style={{ marginTop: 10 }}><Pill tone={stats.kind === 'past' ? 'violet' : 'blue'}>{stats.kind === 'past' ? 'Past client' : 'New'}</Pill><span className="muted">{stats.jobs.length} jobs · {customer?.source ? SOURCES[customer.source] : 'source not recorded'}</span></div>}
                </label>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <h2 className="serif" style={{ fontSize: 26 }}>The car</h2>
              <div className="form">
                <label>Year<input value={car.year} onChange={(e) => setCar({ ...car, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" placeholder="2019" autoFocus /></label>
                <label>Make<input value={car.make} onChange={(e) => setCar({ ...car, make: e.target.value })} placeholder="Toyota" /></label>
                <label>Model<input value={car.model} onChange={(e) => setCar({ ...car, model: e.target.value })} placeholder="Fortuner" /></label>
                <label>Colour<input value={car.color} onChange={(e) => setCar({ ...car, color: e.target.value })} placeholder="Pearl White" /></label>
                <label>Plate or VIN<input value={car.vin} onChange={(e) => setCar({ ...car, vin: e.target.value })} placeholder="Optional" /></label>
              </div>
              <label className="photo-drop">
                {photo ? <img src={photo} alt="The car" /> : <span><Icon name="plus" size={18} /> Take or add a photo of the car</span>}
                <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setPhoto(await resizeImage(f)); setErr(''); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not use that image.'); } } }} />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <h2 className="serif" style={{ fontSize: 26 }}>What came in with the car?</h2>
              <div className="checklist">
                <label className="chk"><input type="checkbox" checked={orcr} onChange={(e) => setOrcr(e.target.checked)} />OR/CR copy received</label>
                {items.map((x, i) => <label key={x.label} className="chk"><input type="checkbox" checked={x.present} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, present: e.target.checked } : y)))} />{x.label}</label>)}
              </div>
              {missing.length > 0 && <div className="small over">Missing: {missing.join(', ')}</div>}
              <form className="row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const l = String(f.get('item')).trim(); if (l) setItems([...items, { label: l, present: true }]); e.currentTarget.reset(); }}>
                <input name="item" placeholder="Add an item (e.g. dashcam)" style={{ width: 260 }} /><button className="sm" type="submit">Add</button>
              </form>
              <label className="small muted">Notes<input style={{ width: '100%', marginTop: 4 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the owner said at drop-off" /></label>
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              <h2 className="serif" style={{ fontSize: 26 }}>What are we doing?</h2>
              <Seg<ServiceType> value={svc} onChange={chooseService} options={SERVICE_KEYS.map((k) => ({ value: k, label: SERVICES[k].label }))} />
              <div className="form">
                {isPackage ? (
                  <label>Package<select value={pkgIdx} onChange={(e) => choosePackage(Number(e.target.value))}>{packages.map((p, i) => <option key={p.name} value={i}>{p.name} · ₱{p.price.toLocaleString('en-PH')}</option>)}</select></label>
                ) : (
                  <label>Type of repair<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={svc === 'paint' ? 'Full respray' : 'Full restoration'} /></label>
                )}
                <label>Bay<select value={bay} onChange={(e) => setBay(e.target.value)}><option>Unassigned</option>{BAYS.map((b) => <option key={b}>{b}</option>)}</select></label>
                <span />
                <label>Start date<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setTarget(addDays(e.target.value, SERVICES[svc].typicalDays)); }} /></label>
                <label>Target date<input type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
                <label className="full">Specifics<textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What exactly the client asked for" /></label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="stack">
              <h2 className="serif" style={{ fontSize: 26 }}>The price</h2>
              {pre.estimate ? <div className="small muted">From the estimate calculator. Change it here if the client negotiated.</div> : isPackage ? <div className="small muted">From your price list.</div> : <div className="small">Not sure of the price yet? <Link to="/estimate" style={{ color: 'var(--accent2)' }}>Work it out in the Estimate Calculator</Link>, then start the job from there.</div>}
              <label className="form" style={{ display: 'block', maxWidth: 280 }}><span className="small muted">Price (₱)</span><input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus style={{ width: '100%', fontSize: 22 }} /></label>
            </div>
          )}

          {step === 5 && (
            <div className="stack">
              <h2 className="serif" style={{ fontSize: 26 }}>Agree and start</h2>
              <Seg value={agreed ? 'yes' : 'no'} onChange={(v) => setAgreed(v === 'yes')} options={[{ value: 'yes', label: 'Client agreed: start the job' }, { value: 'no', label: 'Not yet: keep as a quote' }]} />
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>Payment received now</div>
                <div className="seg" role="group" aria-label="Payment">
                  <button type="button" className={payKind === '' ? 'on' : ''} onClick={() => { setPayKind(''); setPayAmt(''); }}>None yet</button>
                  {PAYMENT_KINDS.map((k) => <button type="button" key={k} className={payKind === k ? 'on' : ''} onClick={() => { setPayKind(k); if (k === 'full') setPayAmt(price); }}>{PAYMENT_LABEL[k]}</button>)}
                </div>
              </div>
              {payKind && <label className="form" style={{ display: 'block', maxWidth: 240 }}><span className="small muted">Amount (₱)</span><input type="number" min="0" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} style={{ width: '100%' }} /></label>}
              {missing.length > 0 && <div className="small warn">Still missing from the car: {missing.join(', ')}. You can sort that out on the job.</div>}
            </div>
          )}

          {err && <div className="over small" role="alert" style={{ marginTop: 12 }}>{err}</div>}
          <div className="row spread" style={{ marginTop: 20 }}>
            <button type="button" className="ghost" onClick={() => { setErr(''); setStep(Math.max(0, step - 1)); }} disabled={step === 0}>Back</button>
            {step < STEPS.length - 1 ? <button className="primary" type="button" onClick={next}>Next</button> : <button className="primary" type="button" onClick={create}>{agreed ? 'Create and start the job' : 'Save as a quote'}</button>}
          </div>
        </Card>

        <Card title="So far">
          <div className="intake-art"><CarArt color={paintHex({ color: car.color })} car={{ make: car.make, model: car.model }} /></div>
          <ul className="sofar">
            <li><span>Client</span><b>{clientName || '—'}</b></li>
            <li><span>Car</span><b>{[car.year, car.make, car.model].filter(Boolean).join(' ') || '—'}</b></li>
            <li><span>Service</span><b>{SERVICES[svc].label}</b></li>
            <li><span>Target</span><b>{target}</b></li>
            <li><span>Price</span><b>{Number(price) > 0 ? moneyC(Number(price)) : '—'}</b></li>
            <li><span>Missing</span><b className={missing.length ? 'over' : 'ok'}>{missing.length ? `${missing.length} item${missing.length === 1 ? '' : 's'}` : 'None'}</b></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
