import { useState } from 'react';
import { useApp } from '@/ctx';
import { PLANS, formatTin, isValidTin, peso, planOf } from '@/lib/bir';

export default function Settings() {
  const { api, company, setCompany, scansUsed, session, receipts } = useApp();
  const [f, setF] = useState(company);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const isOwner = session.role === 'owner' || session.role === 'admin';

  async function save() {
    setErr(''); setMsg('');
    try { setCompany(await api.updateCompany({ name: f.name, tin: f.tin, vatRegistered: f.vatRegistered, address: f.address })); setMsg('Saved.'); } catch (e) { setErr((e as Error).message); }
  }
  async function choose(id: typeof company.plan) {
    setErr(''); setMsg('');
    try { setCompany(await api.setPlan(id)); setMsg('Plan updated.'); } catch (e) { setErr((e as Error).message); }
  }
  function backup() {
    const blob = new Blob([JSON.stringify({ company, receipts, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${company.name.replace(/\W+/g, '-').toLowerCase()}-backup.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const cur = planOf(company.plan);

  return (
    <div className="stack">
      <h1>Settings</h1>
      <div className="card stack">
        <h2>Company profile</h2>
        <div className="form">
          <label className="f"><span className="lbl">Registered business name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!isOwner} /></label>
          <label className="f"><span className="lbl">Business TIN</span><input value={f.tin} inputMode="numeric" onChange={(e) => setF({ ...f, tin: formatTin(e.target.value) })} disabled={!isOwner} /></label>
          <div className="full"><label className="f"><span className="lbl">Address</span><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!isOwner} /></label></div>
        </div>
        {f.tin && !isValidTin(f.tin) && <div className="notice warn">TIN should be 9 digits, or 12–14 with the branch code.</div>}
        <label className="row" style={{ gap: '.5rem' }}><input type="checkbox" checked={f.vatRegistered} disabled={!isOwner} onChange={(e) => setF({ ...f, vatRegistered: e.target.checked })} /> We are VAT-registered (enables input-VAT tracking and the SLP)</label>
        {msg && <div className="notice ok">{msg}</div>}{err && <div className="notice bad">{err}</div>}
        <div><button className="primary" onClick={save} disabled={!isOwner}>Save changes</button></div>
      </div>

      <div className="card stack">
        <h2>Plan & usage</h2>
        <div className="small muted">{scansUsed} of {cur.scansPerMonth} scans used this month. Prices shown are placeholders.</div>
        <div className="grid g4">
          {PLANS.map((p) => (
            <div key={p.id} className={`card plan ${p.id === company.plan ? 'current' : ''}`}>
              <h3>{p.name}</h3><div className="kpi"><div className="value">{p.pricePhp ? peso(p.pricePhp) : 'Free'}</div><div className="sub">{p.pricePhp ? 'per month' : 'forever'}</div></div>
              <p className="small">{p.scansPerMonth} scans / month<br />{p.blurb}</p>
              {p.id === company.plan ? <span className="chip ok">Current plan</span> : (
                <button disabled={!isOwner || (api.mode === 'cloud' && p.id !== 'free')} onClick={() => choose(p.id)}>{api.mode === 'cloud' && p.id !== 'free' ? 'Contact us to upgrade' : 'Switch'}</button>)}
            </div>))}
        </div>
        {api.mode === 'cloud' && <div className="small muted">Upgrades are activated by your payment provider webhook (see README) — clients cannot grant themselves a plan.</div>}
      </div>

      <div className="card stack">
        <h2>Your data</h2>
        <div className="small muted">Signed in as {session.email} ({session.role}). {receipts.length} receipts stored.</div>
        <div><button onClick={backup}>⬇ Download full backup (JSON)</button></div>
      </div>
    </div>
  );
}
