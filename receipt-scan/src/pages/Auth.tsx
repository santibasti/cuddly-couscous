import { useState, type FormEvent } from 'react';
import Icon from '@/components/Icon';
import type { Api } from '@/lib/api';
import type { Session } from '@/lib/types';
import { formatTin } from '@/lib/bir';
import { DEMO_ADMIN } from '@/lib/demo';
import type { AccountKind } from '@/lib/types';

export default function Auth({ api, onSession }: { api: Api; onSession: (s: Session) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [f, setF] = useState({ email: '', password: '', companyName: '', tin: '', vat: false });
  const [kind, setKind] = useState<AccountKind>('business');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      onSession(mode === 'in'
        ? await api.signIn(f.email, f.password)
        : await api.signUp({ email: f.email, password: f.password, companyName: f.companyName, tin: f.tin, vatRegistered: f.vat, kind }));
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="auth2">
      <aside className="auth-hero">
        <div className="brand" style={{ padding: 0 }}><span className="logo"><Icon name="receipt" size={19} /></span>ResiboScan</div>
        <div>
          <h2>Your receipts, ready for BIR.</h2>
          <p>Snap a receipt, check the details, and export clean records for your accountant — without the shoebox of paper.</p>
          <ul className="feat">
            <li><span className="fi"><Icon name="camera" /></span><div><b>Capture in seconds</b><span>Photograph a receipt; the details are read for you to confirm.</span></div></li>
            <li><span className="fi"><Icon name="shield" /></span><div><b>Catches mistakes early</b><span>Missing TINs, VAT that doesn’t add up, and duplicate invoices are flagged.</span></div></li>
            <li><span className="fi"><Icon name="sheet" /></span><div><b>Export to Excel or CSV</b><span>Purchase journal, input VAT list, and withholding schedule by month or quarter.</span></div></li>
          </ul>
        </div>
        <div className="small" style={{ color: '#7f9bab' }}>One private workspace per company.</div>
      </aside>

      <main className="auth-form">
        <form className="stack" onSubmit={submit}>
          <div className="brand mobile-brand" style={{ padding: 0, color: 'var(--ink)' }}><span className="logo"><Icon name="receipt" size={19} /></span>ResiboScan</div>
          <div>
            <h1>{mode === 'in' ? 'Welcome back' : kind === 'firm' ? 'Create your firm account' : 'Create your company account'}</h1>
            <div className="muted" style={{ marginTop: '.3rem' }}>{mode === 'up' ? (kind === 'firm' ? 'Manage all your clients’ receipts in one place.' : 'Free to start. Takes a minute.') : 'Sign in to your workspace.'}</div>
          </div>
          <div className="tabs">
            <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
            <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
          </div>
          {mode === 'up' && (
            <>
              <div className="seg" role="radiogroup" aria-label="Account type">
                <button type="button" role="radio" aria-checked={kind === 'business'} className={kind === 'business' ? 'on' : ''} onClick={() => setKind('business')}><Icon name="receipt" size={17} />I run a business</button>
                <button type="button" role="radio" aria-checked={kind === 'firm'} className={kind === 'firm' ? 'on' : ''} onClick={() => setKind('firm')}><Icon name="users" size={17} />I’m an accountant / bookkeeper</button>
              </div>
              <label className="f"><span className="lbl">{kind === 'firm' ? 'Firm name' : 'Business name'}</span><input required value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} autoComplete="organization" /></label>
              {kind === 'business' && (
                <>
                  <label className="f"><span className="lbl">Business TIN (optional now)</span><input inputMode="numeric" placeholder="000-000-000-00000" value={f.tin} onChange={(e) => setF({ ...f, tin: formatTin(e.target.value) })} /></label>
                  <label className="check"><input type="checkbox" checked={f.vat} onChange={(e) => setF({ ...f, vat: e.target.checked })} /> <span>We are VAT-registered (we claim input VAT)</span></label>
                </>
              )}
            </>
          )}
          <label className="f"><span className="lbl">Email</span><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
          <label className="f"><span className="lbl">Password (8+ characters)</span><input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
          {err && <div className="notice bad" role="alert"><Icon name="error" />{err}</div>}
          <button className="primary" style={{ width: '100%', minHeight: 46 }} disabled={busy}>{busy ? <Icon name="spinner" /> : null}{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create my company account'}</button>
          {api.mode === 'demo' && mode === 'in' && (
            <button type="button" className="sm" style={{ width: '100%' }} onClick={() => setF({ ...f, email: DEMO_ADMIN.email, password: DEMO_ADMIN.password })}><Icon name="shield" size={16} />Fill the demo platform-owner login</button>
          )}
          <div className="small muted" style={{ textAlign: 'center' }}>{api.mode === 'demo' ? 'Demo mode — your data stays in this browser.' : 'Your company’s receipts are private to your company.'}</div>
        </form>
      </main>
    </div>
  );
}
