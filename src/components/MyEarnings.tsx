// The crew's own pay week: for each day the rate, the bonus and the total, building up until Saturday payday. Only their own numbers.
import { useEffect, useMemo, useState } from 'react';
import { CLOUD, supabase } from '@/lib/cloud';
import { useAuth } from '@/lib/store';
import { Card } from '@/components/ui';
import { crewEarnings, type CrewWeek } from '@/lib/crewearnings';
import { fmtDate, fmtTime, money, nowLocal } from '@/lib/util';
import type { Employee } from '@/lib/types';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MyEarnings({ emp }: { emp: Employee }) {
  const { db } = useAuth();
  const local = useMemo(() => (CLOUD ? null : crewEarnings(db, emp)), [db, emp]);
  const [remote, setRemote] = useState<CrewWeek | null | undefined>(undefined);
  useEffect(() => {
    if (!CLOUD) return;
    let live = true;
    const load = async () => {
      const { data, error } = await supabase().from('crew_week_earnings').select('*').eq('employee_id', emp.id).order('week_start', { ascending: false }).limit(1);
      if (!live) return;
      const r = !error && data?.[0];
      setRemote(r ? { start: r.week_start, end: r.days?.[6]?.date ?? r.week_start, days: r.days ?? [], rate: +r.rate, bonus: +r.bonus, total: +r.total, estimate: !!r.estimate, notes: r.notes ?? [], updated_at: r.updated_at } : null);
    };
    void load(); const i = setInterval(load, 60_000);
    return () => { live = false; clearInterval(i); };
  }, [emp.id]);
  if (emp.pay_basis === 'monthly') return null;
  const w = CLOUD ? remote : local;
  if (w === undefined) return null;
  // a saved week that has already been paid is old news: start from zero until the new week is published
  const stale = !!w && w.end < nowLocal().slice(0, 10);
  const wk = w && !stale ? w : null;
  return (
    <Card title={`My earnings this week${wk ? ` · ${fmtDate(wk.start)} – ${fmtDate(wk.end)}` : ''}`}>
      {!wk ? <p className="muted">Your new week starts on Sunday. Your rate and bonus will show here day by day.</p> : (
        <>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Day</th><th className="r">Rate</th><th className="r">Bonus</th><th className="r">Total</th></tr></thead>
            <tbody>
              {wk.days.map((d) => (
                <tr key={d.date}>
                  <td>{WD[new Date(d.date + 'T00:00:00Z').getUTCDay()]} {d.date.slice(8)}</td>
                  <td className="r">{d.rate ? money(d.rate) : '—'}</td>
                  <td className="r">{d.bonus ? <>{money(d.bonus)}{d.estimate && <span className="muted"> estimate</span>}</> : '—'}</td>
                  <td className="r">{d.total ? money(d.total) : '—'}</td>
                </tr>
              ))}
              <tr><th>Week</th><th className="r">{money(wk.rate)}</th><th className="r">{money(wk.bonus)}{wk.estimate && <span className="muted"> estimate</span>}</th><th className="r">{money(wk.total)}</th></tr>
            </tbody>
          </table></div>
          {wk.notes.map((n) => <p key={n} className="muted" style={{ margin: '6px 0 0' }}>{n}</p>)}
          <p className="muted" style={{ margin: '6px 0 0' }}>Work after Saturday 9 PM counts in next week's pay. Updated {fmtTime(wk.updated_at)}.</p>
        </>
      )}
    </Card>
  );
}
