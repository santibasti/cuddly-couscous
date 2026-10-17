// Premium attendance card for one employee: photo (or initials), name, star rating and today's clock status.
import { useRef } from 'react';
import { Badge, toast } from '@/components/ui';
import { Badges } from '@/components/Badges';
import { ratingLabel, ratingTone } from '@/lib/rating-core';
import { avatarDataUrl } from '@/lib/photos';
import type { Employee } from '@/lib/types';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
const HUES = ['#12a7d8', '#52c75a', '#0b5f9e', '#1fb6a6', '#4f8df0', '#2c9a45'];
const hueOf = (id: string) => HUES[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % HUES.length];

/** Five stars, filled to the exact rating (4.3 fills 86 %). */
export function StarRating({ value, size = 20 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return <span className="starrate" style={{ fontSize: size, ['--p' as string]: `${pct}%` }} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>★★★★★</span>;
}

export function Avatar({ emp, size = 72, onUpload }: { emp: Employee; size?: number; onUpload?: (dataUrl: string) => void }) {
  const inp = useRef<HTMLInputElement>(null);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, ['--hue' as string]: hueOf(emp.id) }}>
      {emp.avatar ? <img src={emp.avatar} alt={emp.full_name} /> : <span className="av-init">{initials(emp.full_name)}</span>}
      {onUpload && <>
        <input ref={inp} type="file" accept="image/*" className="hide" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { onUpload(await avatarDataUrl(f)); } catch { toast('Could not read that photo', 'err'); } }} />
        <button type="button" className="av-cam" title="Upload a photo" aria-label={`Upload a photo for ${emp.full_name}`} onClick={() => inp.current?.click()}>📷</button>
      </>}
    </span>
  );
}

export function EmployeeCard({ emp, status, tone, lines, actions, onUpload }: { emp: Employee; status: string; tone: string; lines: { k: string; v: string }[]; actions?: React.ReactNode; onUpload?: (dataUrl: string) => void }) {
  return (
    <article className="ecard">
      <div className="ec-top">
        <Avatar emp={emp} onUpload={onUpload} />
        <div className="ec-id">
          <b className="ec-name">{emp.full_name}</b>
          <span className="ec-pos">{emp.position}</span>
          <Badge tone={tone}>{status}</Badge>
        </div>
      </div>
      <div className="ec-rating">
        {emp.rating !== undefined ? <>
          <StarRating value={emp.rating} />
          <span className="ec-num"><b>{emp.rating.toFixed(1)}</b><small> / 5</small></span>
          <Badge tone={ratingTone(emp.rating)}>{ratingLabel(emp.rating)}</Badge>
        </> : <span className="small muted">No rating yet — it starts once attendance is approved</span>}
      </div>
      <Badges recog={emp.recog} />
      <dl className="ec-lines">{lines.map((l) => <div key={l.k}><dt>{l.k}</dt><dd>{l.v}</dd></div>)}</dl>
      {actions && <div className="ec-actions">{actions}</div>}
    </article>
  );
}
