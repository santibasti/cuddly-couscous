import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarCheck2, ShieldCheck, Layers, Sparkles } from 'lucide-react';
import { useStore } from '@/store/store';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Logo, LogoMark } from '@/components/common/Logo';
import { DEMO_PASSWORD } from '@/data/seed';
import { ROLE_BLURB, ROLE_LABEL } from '@/domain/permissions';
import type { Role } from '@/types';

const DEMOS: { role: Role; email: string; name: string }[] = [
  { role: 'owner', email: 'owner@sunrise.ph', name: 'Maria Santos' },
  { role: 'manager', email: 'manager@sunrise.ph', name: 'Carlo Reyes' },
  { role: 'staff', email: 'staff@sunrise.ph', name: 'Ana Lim' },
  { role: 'viewer', email: 'viewer@sunrise.ph', name: 'Vince Tan' },
];

export default function Login() {
  const session = useStore((s) => s.session);
  const login = useStore((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  if (session) return <Navigate to="/" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = login(email, password);
    if (err) setError(err); else nav('/');
  };
  const demo = (em: string) => { const err = login(em, DEMO_PASSWORD); if (!err) nav('/'); };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex">
        <Logo />
        <div className="max-w-lg">
          <h1 className="font-display text-4xl font-extrabold leading-tight">One calendar. Every channel. <span className="text-brand-500">No conflicts.</span></h1>
          <p className="mt-4 text-lg text-navy-300">Booking.com, Agoda, Facebook, WhatsApp, your website, phone calls and walk-ins — in one live calendar that refuses to double-book.</p>
          <ul className="mt-10 space-y-5 text-sm">
            {[
              [CalendarCheck2, 'Conflict-proof confirmation', 'Overlaps, blocked dates, cleaning buffers, minimum stays and capacity are checked before anything is confirmed.'],
              [Layers, 'Unified inbox & channels', 'Turn a Messenger or WhatsApp chat into a pending booking in two clicks.'],
              [ShieldCheck, 'Full audit trail', 'Who created, edited, confirmed, cancelled — or overrode — every reservation.'],
            ].map(([I, t, d]) => { const Icon = I as typeof Sparkles; return (
              <li key={t as string} className="flex gap-4"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10"><Icon className="size-5" /></span><span><b className="block text-base">{t as string}</b><span className="text-navy-300">{d as string}</span></span></li>
            ); })}
          </ul>
        </div>
        <p className="text-xs text-navy-300">Demo workspace · Sunrise Villas &amp; Suites · Asia/Manila · ₱ PHP</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><LogoMark /><span className="font-display text-xl font-extrabold text-navy-900">BookingPilot</span></div>
          <h2 className="font-display text-2xl font-extrabold">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-soft">Sign in to your workspace.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" required /></Field>
            <Field label="Password" error={error}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <Button type="submit" size="lg" className="w-full">Sign in</Button>
          </form>

          <div className="mt-8 rounded-2xl border border-line bg-white p-4">
            <p className="font-display text-sm font-bold">Demo accounts <span className="font-normal text-ink-mute">· password <code className="rounded bg-canvas px-1">{DEMO_PASSWORD}</code></span></p>
            <div className="mt-3 grid gap-2">
              {DEMOS.map((d) => (
                <button key={d.role} onClick={() => demo(d.email)} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left transition-colors hover:border-brand-500 hover:bg-brand-50">
                  <span><b className="block text-sm">{ROLE_LABEL[d.role]}</b><span className="block text-xs text-ink-mute">{ROLE_BLURB[d.role].slice(0, 62)}…</span></span>
                  <span className="shrink-0 text-xs font-semibold text-brand-700">{d.name.split(' ')[0]} →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
