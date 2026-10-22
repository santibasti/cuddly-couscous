import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { partRisk, partStatusLabel, type Health, type PartRisk } from '../lib/logic';
import type { Mechanic, Part, Project } from '../lib/types';

const ICONS: Record<string, string> = {
  dash: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  car: 'M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11m-14 0h14a2 2 0 012 2v4h-2m-14-6a2 2 0 00-2 2v4h2m0 0a2 2 0 104 0m6 0a2 2 0 104 0m-10 0h6',
  cal: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  gantt: 'M4 6h8M8 12h10M6 18h9',
  wrench: 'M14.7 6.3a4 4 0 005 5L21 13l-8 8a2.8 2.8 0 01-4-4l8-8zM17 3l-3 3 4 4 3-3',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5m0 0l9-5m-9 5v9',
  lock: 'M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z',
  truck: 'M2 6h11v10H2zM13 9h5l3 3v4h-8M6 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z',
  warn: 'M12 3l10 18H2zM12 10v5m0 3v.01',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  arrow: 'M5 12h14m-6-6l6 6-6 6',
};

export const Icon = ({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name] ?? ''} />
  </svg>
);

export const carName = (p: Project) => `${p.year} ${p.make} ${p.model}`;
export const statusLabel = (s: string) => s.replace('_', ' ');

export const Bar = ({ value, tone, thin }: { value: number; tone?: string; thin?: boolean }) => (
  <div className={`bar ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={`bar-fill ${tone ?? ''}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export const Pill = ({ tone = 'gray', children, dot = true }: { tone?: string; children: ReactNode; dot?: boolean }) => (
  <span className={`pill ${tone}`}>{dot && <i />}{children}</span>
);

const HEALTH: Record<Health, [string, string]> = {
  on_track: ['green', 'On track'], at_risk: ['amber', 'At risk'], blocked: ['orange', 'Blocked'],
  late: ['red', 'Late'], hold: ['gray', 'On hold'], quote: ['violet', 'Quote'], done: ['blue', 'Complete'],
};
export const healthTone = (h: Health) => HEALTH[h][0];
export const HealthPill = ({ h }: { h: Health }) => <Pill tone={HEALTH[h][0]}>{HEALTH[h][1]}</Pill>;

const RISK: Record<PartRisk, [string, string]> = {
  late: ['red', 'Overdue'], order_now: ['orange', 'Order now'], at_risk: ['amber', 'At risk'], ok: ['green', 'On time'], done: ['gray', 'In shop'],
};
export const RiskPill = ({ r }: { r: PartRisk }) => <Pill tone={RISK[r][0]}>{RISK[r][1]}</Pill>;

export const PartStatusPill = ({ part }: { part: Part }) => (
  <Pill tone={part.status === 'backordered' ? 'red' : part.status === 'shipped' ? 'blue' : part.status === 'ordered' ? 'amber' : part.status === 'needed' ? 'orange' : 'green'}>
    {partStatusLabel(part.kind, part.status)}
  </Pill>
);

export function Spark({ data, tone = 'accent' }: { data: number[]; tone?: string }) {
  const max = Math.max(1, ...data);
  const w = 90;
  const h = 28;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - 2 - (v / max) * (h - 6)}`);
  return (
    <svg className={`spark ${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} className="area" />
      <polyline points={pts.join(' ')} className="line" fill="none" />
    </svg>
  );
}

export const Kpi = ({ label, value, sub, tone, spark, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; spark?: number[]; icon?: string }) => (
  <div className={`card kpi ${tone ?? ''}`}>
    <div className="kpi-top"><span className="eyebrow">{label}</span>{icon && <span className="kpi-ico"><Icon name={icon} /></span>}</div>
    <div className="kpi-mid"><span className="kpi-val">{value}</span>{spark && <Spark data={spark} tone={tone} />}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
);

export const Card = ({ title, action, children, flush, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) => (
  <section className={`card ${className}`}>
    {(title || action) && <header className="card-h"><h2>{title}</h2><div>{action}</div></header>}
    <div className={flush ? 'flush' : ''}>{children}</div>
  </section>
);

export const Avatar = ({ m, size = 24 }: { m?: Mechanic; size?: number }) =>
  m ? (
    <span className="avatar" style={{ background: m.color, width: size, height: size, fontSize: size * 0.4 }} title={m.name}>
      {m.name.split(' ').map((w) => w[0]).join('')}
    </span>
  ) : (
    <span className="avatar empty" style={{ width: size, height: size, fontSize: size * 0.45 }} title="Unassigned">?</span>
  );

export const ProjectLink = ({ p }: { p: Project }) => (
  <Link to={`/projects/${p.id}`} className="plink">
    <strong>{p.code}</strong><span>{carName(p)}</span>
  </Link>
);

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export { partRisk };
