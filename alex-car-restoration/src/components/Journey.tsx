import type { CSSProperties } from 'react';
import { fmtDate } from '../lib/dates';
import { phaseShort } from '../lib/logic';
import type { Phase, PhaseKey } from '../lib/types';
import { Icon } from './ui';

export type JourneyTone = 'ok' | 'warn' | 'bad' | 'hold';

/**
 * The job as a trip: a dashed road with a stop for each step, a car badge parked at the current step,
 * and a glowing line filling in behind it. Moves when the page opens.
 */
export default function Journey({ phases, selected, onSelect, tone = 'ok', compact = false }: { phases: Phase[]; selected?: PhaseKey; onSelect?: (k: PhaseKey) => void; tone?: JourneyTone; compact?: boolean }) {
  const n = phases.length;
  const open = phases.findIndex((p) => p.status !== 'done');
  const finished = open === -1;
  const ci = finished ? n - 1 : open;
  const f = n > 1 ? (finished ? 1 : ci / (n - 1)) : 0;
  const icon = finished ? 'check' : tone === 'warn' ? 'lock' : tone === 'bad' ? 'warn' : tone === 'hold' ? 'clock' : 'car';
  const style = { '--n': n, '--i': ci, '--f': f } as CSSProperties;
  const label = finished ? 'All steps done' : `Now: ${phaseShort(phases[ci].key)}`;
  return (
    <div className={compact ? '' : 'jt-scroll'}>
      <div className={`jt ${tone} ${compact ? 'compact' : ''}`} style={{ ...style, minWidth: compact ? undefined : n * 84 }} role="img" aria-label={label} title={compact ? label : undefined}>
        <div className="jt-line"><i className="jt-fill" /></div>
        <div className="jt-nodes">
          {phases.map((ph, i) => {
            const state = ph.status === 'done' ? 'done' : i === ci ? 'current' : 'todo';
            const cls = `jt-node ${state} ${selected === ph.key ? 'sel' : ''}`;
            const inner = (
              <>
                <span className="jt-dot">{state === 'done' && !compact && <Icon name="check" size={12} />}</span>
                {!compact && <span className="jt-l">{phaseShort(ph.key)}</span>}
                {!compact && <span className="jt-d">{state === 'current' && !finished ? `since ${fmtDate(ph.start)}` : fmtDate(ph.start)}</span>}
              </>
            );
            return onSelect ? <button type="button" key={ph.key} className={cls} onClick={() => onSelect(ph.key)}>{inner}</button> : <span key={ph.key} className={cls}>{inner}</span>;
          })}
        </div>
        <span className="jt-car"><Icon name={icon} size={compact ? 13 : 18} /></span>
      </div>
    </div>
  );
}
