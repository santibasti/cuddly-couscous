import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

/** Compact gradient header used at the top of each page. */
export default function PageHero({ icon, title, sub, children }: { icon: IconName; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="hero sm">
      <div className="hero-row">
        <span className="hero-ic"><Icon name={icon} size={24} /></span>
        <div className="grow"><h1>{title}</h1>{sub && <div className="hero-sub">{sub}</div>}</div>
        {children && <div className="row">{children}</div>}
      </div>
    </header>
  );
}

/** Circular progress used on the dashboard banner. */
export function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 38, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <div className="ring" role="img" aria-label={`${Math.round(pct * 100)}% ${label}`}>
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="9" />
        <circle cx="52" cy="52" r={r} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 52 52)" style={{ transition: 'stroke-dashoffset .8s' }} />
      </svg>
      <div className="ring-t"><b>{Math.round(pct * 100)}%</b><span>{label}</span></div>
    </div>
  );
}
