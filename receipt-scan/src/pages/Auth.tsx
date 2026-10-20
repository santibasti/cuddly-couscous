import { useState, type FormEvent } from 'react';
import type { Api } from '@/lib/api';
import type { Session } from '@/lib/types';
import { formatTin } from '@/lib/bir';

export default function Auth({ api, onSession }: { api: Api; onSession: (s: Session) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [f, setF] = useState({ email: '', password: '', companyName: '', tin: '', vat: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      onSession(mode === 'in'
        ? await api.signIn(f.email, f.password)
        : await api.signUp({ email: f.email, password: f.password, companyName: f.companyName, tin: f.tin, vatRegistered: f.vat }));
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><i>🧾</i> ResiboScan</div>
        <div className="muted">Scan receipts. Stay BIR-ready. One account per company.</div>
        <div className="tabs">
          <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
        </div>
        {mode === 'up' && (
          <>
            <label className="f"><span className="lbl">Business name</span><input required value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} autoComplete="organization" /></label>
            <label className="f"><span className="lbl">Business TIN (optional now)</span><input inputMode="numeric" placeholder="000-000-000-00000" value={f.tin} onChange={(e) => setF({ ...f, tin: formatTin(e.target.value) })} /></label>
            <label className="row" style={{ gap: '.5rem' }}><input type="checkbox" checked={f.vat} onChange={(e) => setF({ ...f, vat: e.target.checked })} /> <span>We are VAT-registered (we claim input VAT)</span></label>
          </>
        )}
        <label className="f"><span className="lbl">Email</span><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
        <label className="f"><span className="lbl">Password (8+ characters)</span><input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        {err && <div className="notice bad" role="alert">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create my company account'}</button>
        <div className="small muted">{api.mode === 'demo' ? 'Demo mode — your data stays in this browser.' : 'Your company’s receipts are private to your company.'}</div>
      </form>
    </div>
  );
}
