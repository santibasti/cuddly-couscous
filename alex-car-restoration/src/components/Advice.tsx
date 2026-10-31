import type { ReactNode } from 'react';
import type { Advice } from '../lib/advice';
import { Card, Icon, Pill } from './ui';

const TONE = { go: 'green', conditions: 'amber', wait: 'red' } as const;
const MARK = { good: '✓', warn: '!', bad: '✕' } as const;

/** The go / no-go suggestion for a job, with the reasons behind it. */
export function AdviceCard({ advice, title = 'Should we take this job?', children }: { advice: Advice; title?: string; children?: ReactNode }) {
  return (
    <Card className="advice" title={title} action={<Pill tone={TONE[advice.verdict]}>{advice.headline}</Pill>}>
      <ul className="reasons">
        {advice.reasons.map((r, i) => <li key={i} className={r.tone}><span className="mk">{MARK[r.tone]}</span><span>{r.text}</span></li>)}
      </ul>
      <div className="small" style={{ marginTop: 12 }}><Icon name="check" size={13} /> Suggested deposit: <b>{Math.round(advice.deposit * 100)}%</b> before work starts.</div>
      {children && <div className="row" style={{ marginTop: 12 }}>{children}</div>}
      <div className="small muted" style={{ marginTop: 10 }}>A suggestion from the shop&apos;s own numbers. The decision is yours.</div>
    </Card>
  );
}
