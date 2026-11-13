// On the Job Order (staff side): what the crew earn extra on this job. The panel bonus is worked out from the final billable panels and the crew size;
// the Owner can add the Outside Metro Manila and Commercial Project bonuses. Shown per crew member and in total; payroll records it under each employee.
import { Badge } from '@/components/ui';
import { attempt } from '@/components/ui';
import { useAuth } from '@/lib/store';
import { isCommercialClient, jobBonus, jobPaySettings, outsideMetroHint } from '@/lib/jobpay';
import { setJobPayOptions } from '@/lib/joborders';
import { money } from '@/lib/util';
import type { Job } from '@/lib/types';

export function JobCrewPay({ job }: { job: Job }) {
  const { db, can } = useAuth();
  const cfg = jobPaySettings(db.settings); const b = jobBonus(db, job);
  const owner = can('payroll.approve');
  const name = (id: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
  const hint = outsideMetroHint(db, job); const commercial = isCommercialClient(db, job);
  return (
    <div className="card" style={{ padding: 12, marginTop: 12 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>Crew bonus for this job</b>
        <Badge tone={b.final ? 'green' : 'amber'}>{b.final ? 'Final' : 'Provisional — the panel count is not final until the work is finished'}</Badge>
      </div>
      <div className="small muted" style={{ margin: '4px 0 8px' }}>
        Panel bonus: {money(cfg.panel_bonus)} for every complete {cfg.panel_step} additional panels per crew member. This job has <b>{b.additional_panels}</b> additional billable panel{b.additional_panels === 1 ? '' : 's'} beyond the package and <b>{b.crew}</b> assigned crew, so each crew member earns <b>{money(b.panel_each)}</b>. No partial bonuses.
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="check" title={hint}><input type="checkbox" disabled={!owner} checked={!!job.pay_outside_mm} onChange={(e) => attempt(() => setJobPayOptions(job.id, { outside: e.target.checked }), e.target.checked ? 'Outside Metro Manila bonus added' : 'Outside Metro Manila bonus removed')} />Outside Metro Manila bonus ({money(cfg.outside_mm_bonus)} each){hint && <span className="small muted"> — {hint}</span>}</label>
        <label className="check"><input type="checkbox" disabled={!owner} checked={!!job.pay_commercial} onChange={(e) => attempt(() => setJobPayOptions(job.id, { commercial: e.target.checked }), e.target.checked ? 'Commercial Project bonus added' : 'Commercial Project bonus removed')} />Commercial Project bonus ({money(cfg.commercial_bonus)} each){commercial && <span className="small muted"> — commercial client</span>}</label>
        {!owner && <span className="small muted">Only the Owner can change these two.</span>}
      </div>
      {(cfg.outside_mm_bonus === 0 && !!job.pay_outside_mm || cfg.commercial_bonus === 0 && !!job.pay_commercial) && <div className="alert warn" style={{ marginTop: 8 }}>An amount is still ₱0. Set the bonus amounts in Payroll → Job pay settings.</div>}
      <div className="tbl-wrap" style={{ marginTop: 8 }}><table className="tbl compact"><thead><tr><th>Crew member</th><th className="num">Panel</th><th className="num">Outside MM</th><th className="num">Commercial</th><th className="num">Bonus</th></tr></thead>
        <tbody>{b.ids.map((id) => <tr key={id}><td>{name(id)}{id === job.leader_id && <span className="small muted"> · leader</span>}</td><td className="num">{money(b.panel_each)}</td><td className="num">{b.outside_each ? money(b.outside_each) : '—'}</td><td className="num">{b.commercial_each ? money(b.commercial_each) : '—'}</td><td className="num"><b>{money(b.each)}</b></td></tr>)}
          {!b.ids.length && <tr><td colSpan={5} className="muted">No crew assigned yet.</td></tr>}</tbody>
        {b.ids.length > 0 && <tfoot><tr><th>Total crew bonus</th><th className="num">{money(b.panel_each * b.crew)}</th><th className="num">{money(b.outside_each * b.crew)}</th><th className="num">{money(b.commercial_each * b.crew)}</th><th className="num">{money(b.total)}</th></tr></tfoot>}
      </table></div>
      <div className="small muted" style={{ marginTop: 6 }}>Recorded under each assigned employee once the job is finished, and added to their payroll as incentives (separate from their regular pay). Only crew with approved attendance on the job are paid.</div>
    </div>
  );
}
