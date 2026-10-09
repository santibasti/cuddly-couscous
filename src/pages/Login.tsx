import { InstallButton } from '@/components/InstallPrompt';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { store, useAuth } from '@/lib/store';
import { ROLE_LABEL, ROUTE_ACCESS } from '@/lib/rbac';
import { Field, toast, Badge } from '@/components/ui';
import { LOGO_URL } from '@/lib/logo';
import { CLOUD } from '@/lib/cloud';

const DEMO = [
  ['owner@topmop.ph', 'owner'], ['ops@topmop.ph', 'ops'], ['finance@topmop.ph', 'finance'],
  ['leader@topmop.ph', 'leader'], ['field@topmop.ph', 'field'], ['accountant@topmop.ph', 'viewer'],
] as const;

export default function Login() {
  const { user, any } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(CLOUD ? '' : 'owner@topmop.ph');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const home = () => (any(ROUTE_ACCESS.dashboard) ? '/dashboard' : any(ROUTE_ACCESS.attendance) ? '/attendance' : '/reports');
  if (user) return <Navigate to={home()} replace />;
  const go = async (e: string, p: string) => {
    setBusy(true);
    try { await store.login(e, p); nav('/', { replace: true }); } catch (err) { toast((err as Error).message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="login-glow" aria-hidden />
      <main className="login-card">
        <img className="login-logo" src={LOGO_URL} alt="TopMop" width={112} height={112} />
        <h1>TOPMOP</h1>
        <div className="login-sub">Window Cleaning Solutions Corp.</div>
        <div className="login-rule" />
        <form className="stack" onSubmit={(e) => { e.preventDefault(); go(email, pw); }}>
          <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ph" required /></Field>
          <Field label="Password"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required /></Field>
          <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <InstallButton />
        {!CLOUD && (
        <div className="alert info" style={{ marginTop: 18 }}>
          <b>Demo mode.</b> Data lives in this browser. All demo accounts use password <code>topmop123</code>.
          <div className="demo-accts">
            {DEMO.map(([em, r]) => <button key={em} type="button" className="btn sm" onClick={() => go(em, 'topmop123')}>{ROLE_LABEL[r]}</button>)}
          </div>
        </div>
        )}
        {!CLOUD && <p className="small muted" style={{ marginTop: 16 }}>Client? <Link to="/portal">Open the client portal</Link> <Badge tone="teal">demo</Badge></p>}
      </main>
      <footer className="login-foot">Operations System · Asia/Manila</footer>
    </div>
  );
}
