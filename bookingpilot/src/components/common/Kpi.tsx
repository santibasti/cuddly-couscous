import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const tone = {
  blue: 'bg-brand-50 text-brand-700', green: 'bg-ok-50 text-ok-700', amber: 'bg-warn-50 text-warn-700', red: 'bg-coral-50 text-coral-700', slate: 'bg-slate-100 text-slate-700',
};
export function Kpi({ label, value, sub, icon: Icon, tone: t = 'blue', onClick, alert }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: LucideIcon; tone?: keyof typeof tone; onClick?: () => void; alert?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('flex flex-col gap-3 rounded-2xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,29,58,.04)]', onClick && 'transition-shadow hover:shadow-md', alert ? 'border-coral-100 ring-1 ring-coral-100' : 'border-line')}>
      <div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink-soft">{label}</span><span className={cn('rounded-lg p-1.5 [&_svg]:size-4', tone[t])}><Icon /></span></div>
      <div className="font-display text-[26px] font-extrabold leading-none tabnum text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-mute">{sub}</div>}
    </Comp>
  );
}
