import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { store, useAuth } from '@/lib/store';
import { ROLE_LABEL, ROUTE_ACCESS } from '@/lib/rbac';
import { Field, toast, Badge } from '@/components/ui';
import { Logo } from '@/components/Logo';
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
      <section className="hero">
        <div className="row"><Logo size={40} /><div><b style={{ letterSpacing: '.04em' }}>TOPMOP</b><div className="small" style={{ color: '#8fb0d3' }}>Window Cleaning Solutions Corp.</div></div></div>
        <div>
          <h1>Field-service operations, from inquiry to collection.</h1>
          <p>Scheduling, crews, equipment out/in, materials, payroll and profitability — one system for exterior cleaning and property-care work.</p>
          <ul><li>Conflict-free booking of crews, vehicles and machines</li><li>GPS attendance linked to payroll</li><li>Job costing with estimated vs actual</li><li>Audit trail on every financial, stock and asset record</li></ul>
        </div>
        <div className="small" style={{ color: '#6f8fb3' }}>PHP (₱) • Asia/Manila</div>
      </section>
      <section className="form">
        <h1>Sign in</h1>
        <p className="muted">Use your TopMop account.</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); go(email, pw); }}>
          <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
          <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {!CLOUD && (
        <div className="alert info" style={{ marginTop: 18 }}>
          <b>Demo mode.</b> Data lives in this browser. All demo accounts use password <code>topmop123</code>.
          <div className="demo-accts">
            {DEMO.map(([em, r]) => <button key={em} type="button" className="btn sm" onClick={() => go(em, 'topmop123')}>{ROLE_LABEL[r]}</button>)}
          </div>
        </div>
        )}
        {!CLOUD && <p className="small muted" style={{ marginTop: 16 }}>Client? <Link to="/portal">Open the client portal</Link> <Badge tone="teal">demo</Badge></p>}
      </section>
    </div>
  );
}
