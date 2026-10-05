import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(15,29,58,.04)]', className)} {...p} />
);
export const CardHeader = ({ className, title, subtitle, action, ...p }: Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) => (
  <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)} {...p}>
    <div>
      <h3 className="font-display text-[15px] font-bold text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-mute">{subtitle}</p>}
    </div>
    {action}
  </div>
);

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'slate';
const tones: Record<Tone, string> = {
  green: 'bg-ok-50 text-ok-700 ring-ok-100',
  amber: 'bg-warn-50 text-warn-700 ring-warn-100',
  red: 'bg-coral-50 text-coral-700 ring-coral-100',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  blue: 'bg-brand-50 text-brand-700 ring-brand-100',
  slate: 'bg-slate-50 text-slate-700 ring-slate-200',
};
export const Badge = ({ tone = 'slate', className, dot, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)} {...p}>
    {dot && <span className="size-1.5 rounded-full bg-current" />}
    {p.children}
  </span>
);

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="rounded-2xl bg-brand-50 p-3 text-brand-600 [&_svg]:size-6">{icon}</div>}
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-soft">{body}</p>}
      {action}
    </div>
  );
}

export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto scroll-thin"><table className={cn('w-full text-sm', className)} {...p} /></div>
);
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('whitespace-nowrap border-b border-line bg-canvas/70 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-ink-mute first:rounded-tl-xl last:rounded-tr-xl', className)} {...p} />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('whitespace-nowrap border-b border-line/70 px-4 py-3 align-middle', className)} {...p} />;
