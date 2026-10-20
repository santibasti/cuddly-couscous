// A short celebration when something new has been posted for you (once per announcement, the first time you open the app after it is posted).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { AnnCard } from '@/components/AnnCard';
import { Modal } from '@/components/ui';
import { markSeen, react, useAnnouncements } from '@/lib/announcements';

export function AnnouncementPopup() {
  const { db, user } = useAuth(); const nav = useNavigate();
  const { unread, mine, stats, loaded } = useAnnouncements();
  const [shown, setShown] = useState<string | null>(null);
  const emps = useMemo(() => new Map(db.employees.map((e) => [e.id, e])), [db.employees]);
  const pick = loaded && !shown ? unread.find((a) => !seenThisSession(a.id)) : undefined;
  useEffect(() => { if (pick) { setShown(pick.id); rememberThisSession(pick.id); } }, [pick?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = shown ? unread.find((x) => x.id === shown) : undefined;
  if (!a || !user) return null;
  const me = !!user.employee_id && a.awardee_ids.includes(user.employee_id);
  const close = () => { void markSeen([a.id]); setShown(null); };
  return (
    <Modal title={me ? '🎉 Congratulations!' : '📣 New from TopMop'} onClose={close} footer={<><button className="btn" onClick={() => { close(); nav('/announcements'); }}>See all</button><button className="btn primary" onClick={() => { void react(a.id, '👏').catch(() => undefined); close(); }}>👏 {me ? 'Thank you!' : 'Congratulate'}</button></>}>
      {(me || ['Award', 'Reward'].includes(a.kind)) && <div className="confetti" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.25}s`, animationDuration: `${2.6 + (i % 5) * 0.5}s` }}>{['🎉', '✨', '🎊', '⭐'][i % 4]}</i>)}</div>}
      <AnnCard a={a} emps={emps} meId={user.employee_id ?? null} myReaction={mine[a.id]?.reaction ?? null} stats={stats[a.id]} preview />
    </Modal>
  );
}
const KEY = 'topmop-ann-popped';
const seenThisSession = (id: string) => { try { return (JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]).includes(id); } catch { return false; } };
const rememberThisSession = (id: string) => { try { sessionStorage.setItem(KEY, JSON.stringify([...(JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]), id])); } catch { /* private window */ } };
