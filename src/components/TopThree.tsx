// "Top 3" podium: the three highest-rated employees, shown to every account on the attendance screen.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/store';
import { CLOUD, supabase } from '@/lib/cloud';
import { Avatar, StarRating } from '@/components/EmployeeCard';
import { ratingLabel } from '@/lib/rating-core';
import type { Employee } from '@/lib/types';

interface Top { id: string; full_name: string; position: string; rating: number; avatar?: string }
const MEDAL = ['#f5b83d', '#b8c4d2', '#cd8b4f'];
const WORD = ['1st', '2nd', '3rd'];

export function TopThree({ meId }: { meId?: string }) {
  const { db } = useAuth(); const [rows, setRows] = useState<Top[]>([]);
  useEffect(() => {
    if (!CLOUD) return;
    let alive = true;
    supabase().rpc('top_employees', { p_n: 3 }).then(({ data }) => { if (alive && Array.isArray(data)) setRows((data as Top[]).map((r) => ({ ...r, rating: Number(r.rating) }))); });
    return () => { alive = false; };
  }, [db.employees.length]);
  const local: Top[] = CLOUD ? [] : db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive' && e.rating !== undefined).sort((a, b) => b.rating! - a.rating! || a.full_name.localeCompare(b.full_name)).slice(0, 3).map((e) => ({ id: e.id, full_name: e.full_name, position: e.position, rating: e.rating!, avatar: e.avatar }));
  const top = (CLOUD ? rows : local).slice(0, 3);
  if (!top.length) return null;
  const asEmp = (t: Top) => ({ id: t.id, full_name: t.full_name, avatar: t.avatar } as Employee);
  return (
    <section className="top3" aria-label="Top 3 rated employees">
      <div className="top3-head"><span className="top3-trophy">🏆</span><div><b>Top 3 this month</b><div className="small muted">The highest-rated people on the crew — keep climbing!</div></div></div>
      <div className="top3-row">
        {top.map((t, i) => (
          <div key={t.id} className={`top3-card r${i + 1}${t.id === meId ? ' me' : ''}`} style={{ ['--medal' as string]: MEDAL[i] }}>
            <span className="top3-rank">{WORD[i]}</span>
            <Avatar emp={asEmp(t)} size={i === 0 ? 84 : 68} />
            <b className="top3-name">{t.full_name}</b>
            <span className="small muted">{t.position}</span>
            <StarRating value={t.rating} size={18} />
            <span className="top3-num"><b>{t.rating.toFixed(1)}</b> / 5 · {ratingLabel(t.rating)}</span>
            {t.id === meId && <span className="top3-you">That's you! 🎉</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
