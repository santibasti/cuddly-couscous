// Small badge chips (perfect attendance, on-time streak, most improved, documentation star) from an employee's recognition data.
import { badgesOf, type Recog } from '@/lib/recognition-core';

export function Badges({ recog }: { recog?: Recog }) {
  const list = badgesOf(recog);
  if (!list.length) return null;
  return <span className="rbadges">{list.map((b) => <span key={b.key} className={`rbadge ${b.key}`} title={b.label}>{b.icon} {b.label}</span>)}</span>;
}
