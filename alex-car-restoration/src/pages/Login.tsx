import { useState } from 'react';
import logo from '../assets/alex-logo.png';
import { CarArt, Icon } from '../components/ui';
import { ACCOUNTS, ROLES, useRole } from '../lib/role';

const SERVICES = ['Restoration', 'Paint', 'Detailing', 'Ceramic Coating'];

/** The front door: a dark, quiet page with the brand on the left and the sign-in on the right. */
export default function Login() {
  const { login } = useRole();
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!login(user, pw)) setErr('That username or password is not right.');
  }
  return (
    <div className="lux">
      <section className="lux-hero" aria-hidden>
        <img className="lux-logo" src={logo} alt="" width={190} height={78} />
        <div className="lux-copy">
          <div className="lux-eyebrow">Shop control center</div>
          <h1>Crafted with care.<br /><em>Run with precision.</em></h1>
          <p>Every car, every stage, every hand on the job, in one calm view.</p>
        </div>
        <div className="lux-car"><CarArt color="#b8bdc7" car={{ make: 'Mercedes-Benz', model: '190SL' }} /></div>
        <ul className="lux-services">{SERVICES.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>

      <main className="lux-panel">
        <form className="lux-card" onSubmit={submit}>
          <img className="lux-logo-sm" src={logo} alt="Alex Restoration" width={120} height={50} />
          <div>
            <div className="lux-eyebrow">Welcome back</div>
            <h2>Sign in</h2>
          </div>
          <label className="lux-field">
            <span>Username</span>
            <span className="lux-input"><Icon name="user" size={16} /><input value={user} onChange={(e) => { setUser(e.target.value); setErr(''); }} autoComplete="username" autoCapitalize="none" required autoFocus placeholder="Your username" /></span>
          </label>
          <label className="lux-field">
            <span>Password</span>
            <span className="lux-input"><Icon name="lock" size={16} /><input type={show ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} autoComplete="current-password" required placeholder="Your password" />
              <button type="button" className="lux-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><Icon name={show ? 'eyeoff' : 'eye'} size={16} /></button></span>
          </label>
          {err && <div className="lux-err" role="alert">{err}</div>}
          <button className="lux-go" type="submit">Sign in <Icon name="arrow" size={16} /></button>

          <div className="lux-demo">
            <div className="lux-rule"><span>Quick access · demo</span></div>
            <div className="lux-chips">
              {ACCOUNTS.map((a) => (
                <button type="button" key={a.username} className="lux-chip" title={`${a.username} / ${a.password}`} onClick={() => { setUser(a.username); setPw(a.password); setErr(''); }}>
                  <b>{ROLES[a.role].label}</b>
                  <span>{a.username}</span>
                </button>
              ))}
            </div>
            <p>Tap a role to fill it in. Logins are for the demo only.</p>
          </div>
        </form>
      </main>
    </div>
  );
}
