// "My rating" with a motivational message — shown to the employee on the attendance screen before they clock in or out.
import type { Employee } from '@/lib/types';
import { Badge, Bar } from '@/components/ui';
import { motivation, ratingLabel, ratingTone, stars } from '@/lib/rating-core';
import { fmtDate } from '@/lib/util';

const PARTS: [keyof NonNullable<Employee['rating_parts']>, string][] = [['attendance', 'Attendance'], ['punctuality', 'On time'], ['client', 'Client feedback'], ['safety', 'Safety'], ['teamwork', 'Teamwork']];

export function RatingCard({ emp, phase }: { emp: Employee; phase: 'in' | 'out' | 'done' }) {
  const m = motivation(emp.rating, emp.rating_parts, emp.full_name.split(' ')[0], phase);
  const p = emp.rating_parts;
  return (
    <div className="ratingcard">
      <div className="rc-left">
        <div className="rc-label">My rating</div>
        {emp.rating !== undefined ? <>
          <div className="rc-stars" aria-label={`${emp.rating.toFixed(1)} out of 5 stars`}>{stars(emp.rating)}</div>
          <div className="rc-num"><b>{emp.rating.toFixed(1)}</b> / 5 <Badge tone={ratingTone(emp.rating)}>{ratingLabel(emp.rating)}</Badge></div>
          {emp.rating_at && <div className="small muted">Updated {fmtDate(emp.rating_at)} · last {p?.months ?? 1} month(s)</div>}
        </> : <div className="rc-num muted">No rating yet</div>}
      </div>
      <div className="rc-mid">
        <div className="rc-head">{m.headline}</div>
        <p>{m.message}</p>
        {m.tip && <p className="rc-tip">💡 {m.tip}</p>}
      </div>
      {p && <div className="rc-parts">{PARTS.filter(([k]) => p[k] !== undefined).map(([k, label]) => <div key={k}><div className="row between small"><span>{label}</span><b>{Math.round(p[k] as number)}%</b></div><Bar value={p[k] as number} max={100} tone={(p[k] as number) >= 90 ? 'good' : (p[k] as number) >= 75 ? undefined : 'warn'} /></div>)}</div>}
    </div>
  );
}
