// Dashboard: bills from before the system, by month, beside what the system has billed this year. Comparison only; none of it is counted in the dashboard totals.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/lib/store';
import { Card } from '@/components/ui';
import { earlierYears, systemMonths } from '@/lib/earlier';
import { money, moneyShort, today } from '@/lib/util';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function EarlierYears() {
  const { db } = useAuth(); const now = +today().slice(0, 4);
  const years = useMemo(() => earlierYears(db), [db.clients]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<number | null>(null);
  const y = years.find((e) => e.year === (pick ?? years[0]?.year)) ?? years[0];
  const sys = useMemo(() => systemMonths(db, now), [db.invoices, now]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!y) return null;
  const data = MON.map((m, i) => ({ m, [`${y.year} (previous bills)`]: y.months[i], ...(y.year !== now ? { [`${now} (in the system)`]: sys[i] } : {}) }));
  return (
    <Card title="Previous years — bills from before the system" actions={years.length > 1 && <select value={y.year} onChange={(e) => setPick(+e.target.value)} aria-label="Year">{years.map((e) => <option key={e.year} value={e.year}>{e.year}</option>)}</select>}>
      <div className="grid g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div><div className="small muted">Billed in {y.year}</div><b style={{ fontSize: 20 }}>{money(y.total)}</b></div>
        <div><div className="small muted">Bills</div><b style={{ fontSize: 20 }}>{y.bills}</b></div>
        <div><div className="small muted">Customers</div><b style={{ fontSize: 20 }}>{y.clients}</b></div>
        <div><div className="small muted">Average bill</div><b style={{ fontSize: 20 }}>{money(y.avg)}</b></div>
        <div><div className="small muted">Best month</div><b style={{ fontSize: 20 }}>{MON[y.bestMonth]} · {moneyShort(y.months[y.bestMonth])}</b></div>
      </div>
      <div style={{ height: 230 }}><ResponsiveContainer><BarChart data={data} margin={{ left: -6, right: 8, top: 6 }}>
        <CartesianGrid stroke="rgba(128,128,128,.2)" vertical={false} /><XAxis dataKey="m" fontSize={11} tickLine={false} /><YAxis fontSize={11} tickLine={false} tickFormatter={(v: number) => moneyShort(v)} width={56} />
        <Tooltip formatter={(v) => money(Number(v))} /><Legend iconType="circle" />
        <Bar dataKey={`${y.year} (previous bills)`} fill="#f5b83d" radius={[3, 3, 0, 0]} />
        {y.year !== now && <Bar dataKey={`${now} (in the system)`} fill="#4cc0ff" radius={[3, 3, 0, 0]} />}
      </BarChart></ResponsiveContainer></div>
      {y.top.length > 0 && <div className="tbl-wrap" style={{ marginTop: 10 }}><table className="tbl compact"><thead><tr><th>Biggest customers in {y.year}</th><th className="num">Bills</th><th className="num">Billed</th></tr></thead><tbody>{y.top.map((t) => <tr key={t.name}><td>{t.name}</td><td className="num">{t.bills}</td><td className="num">{money(t.total)}</td></tr>)}</tbody></table></div>}
      <div className="small muted" style={{ marginTop: 8 }}>For comparison only. These are the bills entered on each client from before the system (amounts as billed, which may include VAT). They are not invoices, so they are not in the revenue, collections, Finance, BIR or bookkeeping figures. {y.year !== now ? `"${now} (in the system)" is billed revenue excluding VAT.` : ''}</div>
    </Card>
  );
}
