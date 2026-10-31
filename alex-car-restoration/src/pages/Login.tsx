import { useState } from 'react';
import logo from '../assets/alex-logo.png';
import { ACCOUNTS, ROLES, useRole } from '../lib/role';

export default function Login() {
  const { login } = useRole();
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!login(user, pw)) setErr('That username or password is not right.');
  }
  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <img src={logo} alt="Alex Restoration" width={170} height={70} />
        <h1 style={{ fontSize: 30 }}>Sign in</h1>
        <label>Username<input value={user} onChange={(e) => { setUser(e.target.value); setErr(''); }} autoComplete="username" autoCapitalize="none" required autoFocus /></label>
        <label>Password<input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} autoComplete="current-password" required /></label>
        {err && <div className="over small" role="alert">{err}</div>}
        <button className="primary" type="submit">Sign in</button>
        <div className="login-demo">
          <div className="eyebrow">Demo accounts</div>
          {ACCOUNTS.map((a) => (
            <button type="button" key={a.username} className="demo-acct" onClick={() => { setUser(a.username); setPw(a.password); setErr(''); }}>
              <b>{ROLES[a.role].label}</b><span className="small muted">{ROLES[a.role].hint}</span>
              <span className="small muted">{a.username} / {a.password}</span>
            </button>
          ))}
          <div className="small muted">Tap an account to fill it in. These logins are for the demo only.</div>
        </div>
      </form>
    </div>
  );
}
