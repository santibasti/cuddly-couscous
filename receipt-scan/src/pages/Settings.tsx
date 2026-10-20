import { useState } from 'react';
import { useApp } from '@/ctx';
import Icon from '@/components/Icon';
import { formatTin, isValidTin } from '@/lib/bir';

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
  function backup() {
    const blob = new Blob([JSON.stringify({ company, receipts, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${company.name.replace(/\W+/g, '-').toLowerCase()}-backup.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Settings</h1><div className="sub">Company profile, usage and your data.</div></div></div>
      <div className="card stack">
        <h2>Company profile</h2>
        <div className="form">
          <label className="f"><span className="lbl">Registered business name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!isOwner} /></label>
          <label className="f"><span className="lbl">Business TIN</span><input value={f.tin} inputMode="numeric" onChange={(e) => setF({ ...f, tin: formatTin(e.target.value) })} disabled={!isOwner} /></label>
          <div className="full"><label className="f"><span className="lbl">Address</span><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!isOwner} /></label></div>
        </div>
        {f.tin && !isValidTin(f.tin) && <div className="notice warn"><Icon name="alert" />TIN should be 9 digits, or 12–14 with the branch code.</div>}
        <label className="check"><input type="checkbox" checked={f.vatRegistered} disabled={!isOwner} onChange={(e) => setF({ ...f, vatRegistered: e.target.checked })} /> We are VAT-registered (enables input-VAT tracking and the SLP)</label>
        {msg && <div className="notice ok"><Icon name="check" />{msg}</div>}{err && <div className="notice bad"><Icon name="error" />{err}</div>}
        <div><button className="primary" onClick={save} disabled={!isOwner}>Save changes</button></div>
      </div>

      <div className="card stack">
        <h2>Scan usage</h2>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={company.scanLimit} aria-valuenow={scansUsed}><i style={{ width: `${Math.min(100, (scansUsed / company.scanLimit) * 100)}%` }} /></div>
        <div className="small muted">{scansUsed} of {company.scanLimit} receipt scans used this month. The count resets on the 1st. Need more? Contact support.</div>
      </div>

      <div className="card stack">
        <h2>Your data</h2>
        <div className="small muted">Signed in as {session.email} ({session.role}). {receipts.length} receipts stored.</div>
        <div><button onClick={backup}><Icon name="download" size={17} />Download full backup (JSON)</button></div>
      </div>
    </div>
  );
}
