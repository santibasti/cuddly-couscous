import { useRef, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Badge, Field, Modal, attempt, fileToDataUrl, toast } from '@/components/ui';
import { IMAGE_CATEGORIES, MAX_IMAGES_PER_RECORD, addQuoteImage, deleteQuoteImage, imageBlock, quoteImagesOf, updateQuoteImage, type ImageTarget } from '@/lib/quoteimages';
import type { QuoteImage, QuoteImageCategory, QuoteItem } from '@/lib/types';

interface Picked { key: string; file: string; name: string; width: number; height: number; category: QuoteImageCategory; caption: string; item?: number; share: boolean }

const dims = (src: string) => new Promise<{ width: number; height: number }>((res, rej) => { const i = new Image(); i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight }); i.onerror = rej; i.src = src; });
const lineLabel = (it: QuoteItem, n: number) => `${n + 1}. ${it.description.slice(0, 60)}`;

/** Optional quotation images for a quotation or a variation: thumbnail gallery, caption / category / line-item link, and "share with client". */
export function QuoteImageGallery({ target, items = [], title = 'Images / attachments (optional)', client = false, compact = false }: { target: ImageTarget; items?: QuoteItem[]; title?: string; client?: boolean; compact?: boolean }) {
  const { db } = useAuth();
  const imgs = quoteImagesOf(db, target, client);
  const block = client ? 'read-only' : imageBlock(db, target);
  const can = !block;
  const [adding, setAdding] = useState<Picked[] | null>(null);
  const [view, setView] = useState<QuoteImage | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const onFiles = async (files: FileList | null) => {
    const room = MAX_IMAGES_PER_RECORD - imgs.length;
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    if ((files?.length ?? 0) > list.length) toast(`Only image files, up to ${MAX_IMAGES_PER_RECORD} per record.`, 'err');
    const out: Picked[] = [];
    for (const f of list) { try { const file = await fileToDataUrl(f, 1280); out.push({ key: `${f.name}-${out.length}-${Date.now()}`, file, name: f.name, ...(await dims(file)), category: 'Scope Area', caption: '', share: false }); } catch { toast('Could not read that image', 'err'); } }
    if (pick.current) pick.current.value = '';
    if (out.length) setAdding(out);
  };
  const upd = (key: string, p: Partial<Picked>) => setAdding((a) => a && a.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const saveAll = () => {
    if (!adding) return;
    const ok = attempt(() => { for (const p of adding) addQuoteImage(target, { file: p.file, name: p.name, width: p.width, height: p.height, category: p.category, caption: p.caption, item_index: p.item, share_with_client: p.share }); return true; }, adding.length === 1 ? 'Image added' : `${adding.length} images added`);
    if (ok) setAdding(null);
  };
  if (client && !imgs.length) return null;
  if (!client && !imgs.length && !can && compact) return null;
  return (
    <div className={`qimgs${compact ? ' compact' : ''}`}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <b className="small" style={{ textTransform: client ? 'none' : undefined }}>{client ? 'Site images' : title}{imgs.length ? ` · ${imgs.length}` : ''}</b>
        {can && imgs.length < MAX_IMAGES_PER_RECORD && <><input ref={pick} type="file" accept="image/*" multiple className="hide" onChange={(e) => onFiles(e.target.files)} /><button type="button" className="btn sm" onClick={() => pick.current?.click()}>+ Add images</button></>}
      </div>
      {!imgs.length && !client && <div className="small muted">{block && block !== 'read-only' ? block : 'No images. Add pictures only when they help explain the quotation — they are never required.'}</div>}
      {imgs.length > 0 && (
        <div className="qgrid">
          {imgs.map((im) => (
            <button key={im.id} type="button" className="qthumb" onClick={() => setView(im)} aria-label={`${im.category}: ${im.caption || im.name}`}>
              <img src={im.file} alt={im.caption || im.category} loading="lazy" />
              <span className="qcap"><i>{im.category}</i>{im.caption && <em>{im.caption}</em>}</span>
              {!client && <span className={`qshare ${im.share_with_client ? 'on' : ''}`} title={im.share_with_client ? 'Shared with the client' : 'Internal only'}>{im.share_with_client ? '👁 client' : '🔒 internal'}</span>}
            </button>
          ))}
        </div>
      )}
      {adding && (
        <Modal title={`Add ${adding.length === 1 ? 'image' : `${adding.length} images`}`} size="wide" onClose={() => setAdding(null)} footer={<><button className="btn" onClick={() => setAdding(null)}>Cancel</button><button className="btn primary lg" onClick={saveAll}>Save {adding.length === 1 ? 'image' : 'images'}</button></>}>
          <div className="stack">
            <div className="alert info">These pictures belong to the quotation only — they are kept apart from job and service photos. Tick “Show to client” for the ones the client should see (and that can go in the PDF).</div>
            {adding.map((p) => (
              <div key={p.key} className="qadd">
                <img src={p.file} alt={p.name} />
                <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                  <div className="chips" role="group" aria-label="Category" style={{ marginTop: 0 }}>{IMAGE_CATEGORIES.map((c) => <button key={c} type="button" className={p.category === c ? 'on' : ''} onClick={() => upd(p.key, { category: c })}>{c}</button>)}</div>
                  <input placeholder="Short caption (optional)" maxLength={140} value={p.caption} onChange={(e) => upd(p.key, { caption: e.target.value })} aria-label="Caption" />
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {items.length > 0 && <select aria-label="Related line item" value={p.item ?? ''} onChange={(e) => upd(p.key, { item: e.target.value === '' ? undefined : +e.target.value })}><option value="">Related line item — none</option>{items.map((it, n) => <option key={n} value={n}>{lineLabel(it, n)}</option>)}</select>}
                    <label className="check"><input type="checkbox" checked={p.share} onChange={(e) => upd(p.key, { share: e.target.checked })} />Show to client</label>
                    <button type="button" className="btn sm danger" onClick={() => setAdding(adding.length > 1 ? adding.filter((x) => x.key !== p.key) : null)}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {view && <ImageViewer img={view} items={items} client={client} can={can} onClose={() => setView(null)} />}
    </div>
  );
}

function ImageViewer({ img, items, client, can, onClose }: { img: QuoteImage; items: QuoteItem[]; client: boolean; can: boolean; onClose: () => void }) {
  const { db } = useAuth();
  const cur = db.quote_images.find((i) => i.id === img.id && !i.deleted_at);
  const [edit, setEdit] = useState(false);
  const [cat, setCat] = useState<QuoteImageCategory>(img.category); const [cap, setCap] = useState(img.caption); const [item, setItem] = useState<number | undefined>(img.item_index); const [share, setShare] = useState(img.share_with_client);
  if (!cur) { onClose(); return null; }
  const save = () => { if (attempt(() => updateQuoteImage(img.id, { category: cat, caption: cap, item_index: item, share_with_client: share }), 'Image updated')) setEdit(false); };
  return (
    <Modal title={<>{cur.category} {!client && <Badge tone={cur.share_with_client ? 'teal' : 'gray'}>{cur.share_with_client ? 'Shown to client' : 'Internal only'}</Badge>}</>} size="wide" onClose={onClose} footer={<>
      {can && !client && !edit && <><button className="btn danger" onClick={() => { if (attempt(() => deleteQuoteImage(cur.id), 'Image deleted')) onClose(); }}>Delete</button><button className="btn" onClick={() => setEdit(true)}>Edit caption / category</button></>}
      <button className="btn" onClick={onClose}>Close</button></>}>
      <div className="stack">
        <img src={cur.file} alt={cur.caption || cur.category} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8, alignSelf: 'center', background: '#f1f5f9' }} />
        {!edit ? <div><b>{cur.caption || <span className="muted">No caption</span>}</b>{cur.item_label && <div className="small muted">Related line: {cur.item_label}</div>}</div> : (
          <div className="stack">
            <div className="chips" role="group" aria-label="Category" style={{ marginTop: 0 }}>{IMAGE_CATEGORIES.map((c) => <button key={c} type="button" className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
            <Field label="Caption"><input maxLength={140} value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
            {items.length > 0 && <Field label="Related line item"><select value={item ?? ''} onChange={(e) => setItem(e.target.value === '' ? undefined : +e.target.value)}><option value="">None</option>{items.map((it, n) => <option key={n} value={n}>{lineLabel(it, n)}</option>)}</select></Field>}
            <label className="check"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />Show to client</label>
            <div className="row"><button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={() => setEdit(false)}>Cancel</button></div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** "Include Images in PDF" checkbox: only offered when the record has images selected for the client. */
export function IncludeImagesToggle({ target, checked, onChange }: { target: ImageTarget | ImageTarget[]; checked: boolean; onChange: (v: boolean) => void }) {
  const { db } = useAuth();
  const n = (Array.isArray(target) ? target : [target]).reduce((c, t) => c + quoteImagesOf(db, t, true).length, 0);
  if (!n) return null;
  return <label className="check small" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />Include images in PDF ({n})</label>;
}
