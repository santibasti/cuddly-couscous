import { useState } from 'react';
import { useAuth, live } from '@/lib/store';
import { Badge, Field, Icon, Modal, PhotoInput, Photos, attempt, toast } from '@/components/ui';
import { getGeo } from '@/lib/geo';
import { completeArrival } from '@/lib/dispatch';
import { fmtDateTime, nowLocal } from '@/lib/util';
import type { Job } from '@/lib/types';

/** "Arrived at Site" action: arrival time, GPS, site contact, before-work photos, safety briefing, site notes and extra requests. */
export function ArrivalModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { db } = useAuth();
  const site = db.sites.find((s) => s.id === job.site_id)!;
  const [gps, setGps] = useState<{ lat?: number; lng?: number; note: string }>({ note: '' });
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: site.contact_person ?? '', mobile: site.contact_mobile ?? '', photos: [] as string[], safety: false, bnotes: '', snotes: '', requests: '' });
  const [mats, setMats] = useState<{ item_id: string; qty: number }[]>([]);
  const [equip, setEquip] = useState<string[]>([]);
  const spare = live(db.assets).filter((a) => a.status === 'Available' || a.status === 'Reserved');
  const submit = () => {
    const r = attempt(() => completeArrival(job.id, { arr_lat: gps.lat, arr_lng: gps.lng, arr_gps_note: gps.note, arr_photos: f.photos, arr_contact_name: f.name, arr_contact_mobile: f.mobile, arr_safety_briefing: f.safety, arr_briefing_notes: f.bnotes, arr_site_notes: f.snotes, arr_requests: f.requests, extra_materials: mats, extra_equipment: equip }), 'Arrival recorded — status: Arrived at Site');
    if (r) onClose();
  };
  return (
    <Modal title={`Arrived at site – ${job.number}`} size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={submit}>Confirm arrival</button></>}>
      <div className="stack">
        <div className="alert info"><b>{site.name}</b> — {site.address}<br />Arrival time is stamped now: <b>{fmtDateTime(nowLocal())}</b></div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); const g = await getGeo(); setBusy(false); if (g.lat === undefined) toast('GPS unavailable — allow location access, or explain below.', 'err'); setGps({ ...gps, lat: g.lat, lng: g.lng }); }}><Icon name="pin" />{busy ? 'Locating…' : gps.lat !== undefined ? 'Re-capture GPS' : 'Capture GPS location'}</button>
            {gps.lat !== undefined && <Badge tone="green">{gps.lat}, {gps.lng}</Badge>}
          </div>
          {gps.lat === undefined && <input value={gps.note} onChange={(e) => setGps({ ...gps, note: e.target.value })} placeholder="If GPS is unavailable, say why" aria-label="GPS unavailable reason" />}
        </div>
        <div className="form-grid">
          <Field label="Site contact person" required><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Contact mobile"><input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        </div>
        <div>
          <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Before-work photos (required)</div>
          <Photos items={f.photos.map((p, i) => ({ src: p, caption: `Before ${i + 1}` }))} onRemove={(i) => setF({ ...f, photos: f.photos.filter((_, k) => k !== i) })} />
          <div style={{ marginTop: 8 }}><PhotoInput label="Add before-work photo" capture="environment" multiple onAdd={(d) => setF((x) => ({ ...x, photos: [...x.photos, d] }))} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={f.safety} onChange={(e) => setF({ ...f, safety: e.target.checked })} />Safety briefing completed with all crew (PPE: {job.ppe.join(', ') || 'none specified'})</label>
        <Field label="Briefing notes"><input value={f.bnotes} onChange={(e) => setF({ ...f, bnotes: e.target.value })} placeholder="Hazards discussed, exclusion zones, emergency contacts" /></Field>
        <Field label="Site condition / access notes"><textarea value={f.snotes} onChange={(e) => setF({ ...f, snotes: e.target.value })} placeholder="Access route, water/power, obstructions, existing damage…" /></Field>
        <div className="card" style={{ padding: 12 }}>
          <b>Additional equipment or material request</b> <span className="muted small">(optional — sent to Operations)</span>
          <div className="stack" style={{ marginTop: 8 }}>
            {mats.map((m, i) => <div key={i} className="row"><select value={m.item_id} onChange={(e) => setMats(mats.map((x, k) => (k === i ? { ...x, item_id: e.target.value } : x)))} style={{ flex: 1 }}>{live(db.items).map((it) => <option key={it.id} value={it.id}>{it.name} ({it.uom})</option>)}</select><input type="number" min="0" style={{ width: 80 }} value={m.qty} onChange={(e) => setMats(mats.map((x, k) => (k === i ? { ...x, qty: +e.target.value } : x)))} aria-label="Quantity" /><button className="icon-btn" onClick={() => setMats(mats.filter((_, k) => k !== i))} aria-label="Remove"><Icon name="trash" /></button></div>)}
            <div className="row"><button className="btn sm" onClick={() => setMats([...mats, { item_id: db.items[0].id, qty: 1 }])}><Icon name="plus" />Material</button>
              <select value="" onChange={(e) => e.target.value && setEquip([...new Set([...equip, e.target.value])])} style={{ width: 'auto' }} aria-label="Add equipment"><option value="">+ Equipment…</option>{spare.filter((a) => !equip.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></div>
            {equip.length > 0 && <div className="row">{equip.map((id) => <Badge key={id} tone="blue">{db.assets.find((a) => a.id === id)?.code} <a href="#rm" onClick={(e) => { e.preventDefault(); setEquip(equip.filter((x) => x !== id)); }}>✕</a></Badge>)}</div>}
            <Field label="Request note"><input value={f.requests} onChange={(e) => setF({ ...f, requests: e.target.value })} placeholder="What is needed and why" /></Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}
