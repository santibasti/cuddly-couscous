import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Mechanic, Project } from '../lib/types';

export const Progress = ({ value, tone }: { value: number; tone?: 'warn' | 'bad' }) => (
  <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={`bar-fill ${tone ?? ''}`} style={{ width: `${value}%` }} />
  </div>
);

export const Badge = ({ children, tone = 'gray' }: { children: ReactNode; tone?: string }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: string }) => (
  <div className={`card stat ${tone ?? ''}`}>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {sub && <div className="muted small">{sub}</div>}
  </div>
);

export const Avatar = ({ m }: { m?: Mechanic }) =>
  m ? (
    <span className="avatar" style={{ background: m.color }} title={m.name}>
      {m.name.split(' ').map((w) => w[0]).join('')}
    </span>
  ) : (
    <span className="avatar empty" title="Unassigned">?</span>
  );

export const carName = (p: Project) => `${p.year} ${p.make} ${p.model}`;

export const ProjectLink = ({ p }: { p: Project }) => (
  <Link to={`/projects/${p.id}`}>
    <strong>{p.code}</strong> · {carName(p)}
  </Link>
);

export const statusTone: Record<string, string> = {
  quote: 'gray', active: 'blue', on_hold: 'amber', completed: 'green', delivered: 'green',
  todo: 'gray', in_progress: 'blue', done: 'green',
  needed: 'gray', ordered: 'amber', received: 'blue', installed: 'green',
  high: 'red', normal: 'gray', low: 'gray',
};

export const statusLabel = (s: string) => s.replace('_', ' ');
