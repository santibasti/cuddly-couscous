import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Camera, ImagePlus, MapPin, Plus, Trash2, Users, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/store/hooks';
import { useStore } from '@/store/store';
import { RESOURCE_COLORS, RESOURCE_TYPES } from '@/domain/meta';
import { peso } from '@/domain/money';
import type { Resource, ResourceStatus, ResourceType } from '@/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/bits';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlays';
import { cn } from '@/lib/utils';

const STATUS_TONE = { available: 'green', maintenance: 'amber', inactive: 'gray' } as const;

/** Downscale photos before storing: demo keeps them in the browser; production uploads to Supabase Storage (bucket `property-photos`). */
async function shrink(file: File, max = 900): Promise<string> {
  const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78);
}

type Draft = Omit<Resource, 'id' | 'orgId' | 'sortOrder'> & { id?: string; amenitiesText: string };
const blank = (propertyId: string): Draft => ({ propertyId, name: '', type: 'room', capacity: 2, description: '', photos: [], baseRate: 5000, minStay: 1, bufferDays: 0, status: 'available', color: RESOURCE_COLORS[0], amenities: [], notes: '', amenitiesText: '' });

export default function Properties() {
  const org = useOrg()!;
  const [sp, setSp] = useSearchParams();
  const upsert = useStore((s) => s.upsertResource);
  const del = useStore((s) => s.deleteResource);
  const upsertProperty = useStore((s) => s.upsertProperty);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [propDlg, setPropDlg] = useState<null | { id?: string; name: string; address: string }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const manage = org.can('properties.manage');
  const open = sp.get('open');

  useEffect(() => {
    if (!open) return;
    const r = org.resourceById(open); if (r) setDraft({ ...r, amenitiesText: r.amenities.join(', ') });
    setSp({}, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error('Give the resource a name.'); return; }
    const { amenitiesText, ...rest } = draft;
    upsert({ ...rest, amenities: amenitiesText.split(',').map((a) => a.trim()).filter(Boolean) });
    toast.success(draft.id ? 'Resource updated' : 'Resource created'); setDraft(null);
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files || !draft) return;
    const imgs = await Promise.all([...files].slice(0, 6).map((f) => shrink(f)));
    setDraft({ ...draft, photos: [...draft.photos, ...imgs].slice(0, 8) });
  };

  const groups = org.properties.map((p) => ({ p, list: org.resources.filter((r) => r.propertyId === p.id) })).filter((g) => g.list.length || manage);
  return (
    <div>
      <PageHeader title="Properties / Resources" subtitle="Anything bookable: villas, rooms, vehicles, event spaces, crews, equipment."
        actions={manage && <><Button variant="outline" onClick={() => setPropDlg({ name: '', address: '' })}><Building2 />New location</Button><Button onClick={() => setDraft(blank(org.properties[0]?.id ?? ''))}><Plus />New resource</Button></>} />
      {groups.length === 0 && <Card><EmptyState icon={<Building2 />} title="No properties yet" /></Card>}
      {groups.map(({ p, list }) => (
        <section key={p.id} className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="font-display text-lg font-bold">{p.name}</h2><p className="flex items-center gap-1.5 text-sm text-ink-mute"><MapPin className="size-3.5" />{p.address}</p></div>
            {manage && <Button variant="ghost" size="sm" onClick={() => setPropDlg(p)}>Edit location</Button>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <div className="relative h-36 bg-canvas">
                  {r.photos[0] ? <img src={r.photos[0]} alt={r.name} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center" style={{ background: `${r.color}18` }}><Camera className="size-8" style={{ color: r.color }} /></div>}
                  <span className="absolute left-3 top-3"><Badge tone={STATUS_TONE[r.status]} className="bg-white/95 capitalize">{r.status}</Badge></span>
                  <span className="absolute bottom-0 left-0 h-1 w-full" style={{ background: r.color }} />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2"><h3 className="font-display font-bold">{r.name}</h3><span className="tabnum text-sm font-bold text-brand-700">{peso(r.baseRate)}</span></div>
                  <p className="text-xs text-ink-mute"><span className="capitalize">{r.type.replace('_', ' ')}</span> · min {r.minStay} night{r.minStay > 1 ? 's' : ''}{r.bufferDays ? ` · ${r.bufferDays}-night buffer` : ''}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{r.description || 'No description yet.'}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="slate"><Users className="size-3" />Sleeps {r.capacity}</Badge>{r.amenities.slice(0, 3).map((a) => <Badge key={a} tone="slate">{a}</Badge>)}{r.amenities.length > 3 && <Badge tone="slate">+{r.amenities.length - 3}</Badge>}</div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDraft({ ...r, amenitiesText: r.amenities.join(', ') })}>{manage ? 'Edit' : 'View'}</Button>
                    {manage && <Button variant="ghost" size="sm" onClick={() => upsert({ id: r.id, name: r.name, status: (r.status === 'available' ? 'maintenance' : 'available') as ResourceStatus })}><Wrench />{r.status === 'available' ? 'Mark under maintenance' : 'Make available'}</Button>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && (
          <DialogContent wide title={draft.id ? `${manage ? 'Edit' : 'View'} ${draft.name}` : 'New resource'} description="These settings drive availability rules in the conflict engine.">
            <DialogBody>
              <fieldset disabled={!manage} className="grid gap-4 md:grid-cols-2">
                <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Type"><Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ResourceType })}>{RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
                <Field label="Property / location"><Select value={draft.propertyId} onChange={(e) => setDraft({ ...draft, propertyId: e.target.value })}>{org.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Availability status"><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ResourceStatus })}><option value="available">Available</option><option value="maintenance">Under maintenance</option><option value="inactive">Inactive</option></Select></Field>
                <Field label="Capacity (guests / seats)"><Input type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} /></Field>
                <Field label="Base rate (₱ per night / day)"><Input type="number" min={0} value={draft.baseRate} onChange={(e) => setDraft({ ...draft, baseRate: Number(e.target.value) })} /></Field>
                <Field label="Minimum stay / duration (nights)" hint="Shorter bookings need manager approval."><Input type="number" min={1} value={draft.minStay} onChange={(e) => setDraft({ ...draft, minStay: Number(e.target.value) })} /></Field>
                <Field label="Cleaning / setup buffer (empty nights)" hint="0 = same-day turnover is allowed."><Input type="number" min={0} value={draft.bufferDays} onChange={(e) => setDraft({ ...draft, bufferDays: Number(e.target.value) })} /></Field>
                <Field label="Calendar color" className="md:col-span-2"><div className="flex flex-wrap gap-2">{RESOURCE_COLORS.map((c) => <button type="button" key={c} onClick={() => setDraft({ ...draft, color: c })} className={cn('size-8 rounded-full ring-offset-2', draft.color === c && 'ring-2 ring-navy-900')} style={{ background: c }} aria-label={c} />)}</div></Field>
                <Field label="Description" className="md:col-span-2"><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
                <Field label="Amenities (comma separated)" className="md:col-span-2"><Input value={draft.amenitiesText} onChange={(e) => setDraft({ ...draft, amenitiesText: e.target.value })} placeholder="Pool, Air-con, WiFi" /></Field>
                <Field label="Internal notes" className="md:col-span-2"><Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Staff-only: cleaning notes, access codes…" /></Field>
                <div className="md:col-span-2">
                  <p className="mb-1.5 text-xs font-semibold text-ink-soft">Photos</p>
                  <div className="flex flex-wrap gap-3">
                    {draft.photos.map((ph, i) => <div key={i} className="relative size-24 overflow-hidden rounded-xl"><img src={ph} alt="" className="size-full object-cover" />{manage && <button type="button" onClick={() => setDraft({ ...draft, photos: draft.photos.filter((_, j) => j !== i) })} className="absolute right-1 top-1 rounded-full bg-navy-900/80 p-1 text-white" aria-label="Remove photo"><X className="size-3" /></button>}</div>)}
                    {manage && <button type="button" onClick={() => fileRef.current?.click()} className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-xs font-semibold text-ink-mute hover:border-brand-500 hover:text-brand-700"><ImagePlus className="size-5" />Add photo</button>}
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-mute">Demo mode keeps resized photos in your browser. With Supabase connected they are uploaded to Storage.</p>
                </div>
              </fieldset>
            </DialogBody>
            <DialogFooter>
              {manage && draft.id && <Button variant="danger-outline" className="mr-auto" onClick={() => { const e = del(draft.id!); if (e) toast.error(e); else { toast.success('Resource deleted'); setDraft(null); } }}><Trash2 />Delete</Button>}
              <Button variant="ghost" onClick={() => setDraft(null)}>{manage ? 'Cancel' : 'Close'}</Button>
              {manage && <Button onClick={save}>Save resource</Button>}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!propDlg} onOpenChange={(o) => !o && setPropDlg(null)}>
        {propDlg && (
          <DialogContent title={propDlg.id ? 'Edit location' : 'New location'}>
            <DialogBody className="space-y-4"><Field label="Name"><Input value={propDlg.name} onChange={(e) => setPropDlg({ ...propDlg, name: e.target.value })} /></Field><Field label="Address"><Input value={propDlg.address} onChange={(e) => setPropDlg({ ...propDlg, address: e.target.value })} /></Field></DialogBody>
            <DialogFooter><Button variant="ghost" onClick={() => setPropDlg(null)}>Cancel</Button><Button disabled={!propDlg.name.trim()} onClick={() => { upsertProperty(propDlg); setPropDlg(null); toast.success('Location saved'); }}>Save</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
