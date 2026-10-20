import { Avatar } from '@/components/EmployeeCard';
import { Badge } from '@/components/ui';
import { EMOJI, KINDS, type Announcement, type Emoji } from '@/lib/announcements';
import { fmtDate } from '@/lib/util';
import type { Employee } from '@/lib/types';

const first = (n: string) => n.replace(/^(Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0];

export function AnnCard({ a, emps, meId, myReaction, stats, manage, onShare, onReact, onEdit, onStatus, onDelete, preview }: {
  a: Announcement; emps: Map<string, Employee>; meId: string | null; myReaction: Emoji | null; stats?: { seen: number; reactions: Partial<Record<Emoji, number>> }; manage?: boolean; preview?: boolean;
  onShare?: () => void; onReact?: (e: Emoji | null) => void; onEdit?: () => void; onStatus?: (s: Announcement['status']) => void; onDelete?: () => void;
}) {
  const k = KINDS[a.kind]; const winners = a.awardee_ids.map((id) => emps.get(id)).filter((e): e is Employee => !!e);
  const me = !!meId && a.awardee_ids.includes(meId);
  const when = a.created_at ? fmtDate(a.created_at.slice(0, 10)) : 'Today';
  const scheduled = !!a.publish_at && a.publish_at > new Date().toISOString();
  return (
    <div className={`card ann ann-${k.tone}${me ? ' ann-me' : ''}`} style={{ padding: 16 }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="ann-ic" aria-hidden="true">{k.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ fontSize: 18 }}>{a.pinned ? '📌 ' : ''}{a.title}</b>
            <Badge tone={k.tone as never}>{a.kind}</Badge>
            {manage && a.status !== 'Published' && <Badge tone="gray">{a.status}</Badge>}
            {manage && a.status === 'Published' && scheduled && <Badge tone="blue">Scheduled</Badge>}
          </div>
          <div className="small muted">{when}{a.expires_on ? ` · until ${fmtDate(a.expires_on)}` : ''}{manage ? ` · for ${a.audience === 'all' ? 'everyone' : a.audience === 'leaders' ? 'team leaders' : `${a.audience_ids.length} selected`}` : ''}</div>
          {me && <div className="ann-congrats">🎉 That’s you! Congratulations!{onShare && <> <button type="button" className="btn sm primary" style={{ marginLeft: 8 }} onClick={onShare}>📲 Share my award</button></>}</div>}
          {!!winners.length && <div className="row" style={{ gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>{winners.map((e) => <span key={e.id} className="row" style={{ gap: 8, alignItems: 'center' }}><Avatar emp={e} size={44} /><b>{first(e.full_name)}</b></span>)}</div>}
          {a.reward && <div className="ann-reward">{k.icon} {a.reward}</div>}
          {a.body && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{a.body}</p>}
          {!preview && onReact && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              {EMOJI.map((e) => <button key={e} type="button" className={`ann-react${myReaction === e ? ' on' : ''}`} onClick={() => onReact(myReaction === e ? null : e)} aria-pressed={myReaction === e}>{e} <span>{stats?.reactions?.[e] ?? 0}</span></button>)}
              {manage && stats && <span className="small muted" style={{ marginLeft: 6 }}>seen by {stats.seen}</span>}
            </div>
          )}
          {manage && !preview && (
            <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={onEdit}>Edit</button>
              {a.status === 'Published' ? <button className="btn sm" onClick={() => onStatus?.('Archived')}>Archive</button> : <button className="btn sm primary" onClick={() => onStatus?.('Published')}>Publish</button>}
              <button className="btn sm danger" onClick={onDelete}>Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

