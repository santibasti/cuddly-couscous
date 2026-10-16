// Privacy editor for a site photo: hide faces, plates, house numbers and name boards, and optionally shift the colours so the property is harder to recognise.
// The original photo is never changed — the result is saved as a new photo.
import { useEffect, useRef, useState } from 'react';
import { CLOUD, supabase } from '@/lib/cloud';
import { Modal, toast } from '@/components/ui';

interface Box { x: number; y: number; w: number; h: number; label?: string }
type Mode = 'blur' | 'pixel' | 'cover';

const FALLBACK = 'AI is not available here — draw the boxes by hand.';

function render(c: HTMLCanvasElement, img: HTMLImageElement, boxes: Box[], mode: Mode, hue: number, max: number) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const W = Math.round(img.naturalWidth * s), H = Math.round(img.naturalHeight * s);
  c.width = W; c.height = H; const ctx = c.getContext('2d')!;
  ctx.filter = hue ? `hue-rotate(${hue}deg) saturate(1.05)` : 'none'; ctx.drawImage(img, 0, 0, W, H); ctx.filter = 'none';
  if (!boxes.length) return;
  const base = document.createElement('canvas'); base.width = W; base.height = H; base.getContext('2d')!.drawImage(c, 0, 0);
  for (const b of boxes) {
    const x = Math.round(b.x * W), y = Math.round(b.y * H), w = Math.max(2, Math.round(b.w * W)), h = Math.max(2, Math.round(b.h * H));
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (mode === 'cover') { ctx.fillStyle = '#14202e'; ctx.fillRect(x, y, w, h); }
    else if (mode === 'pixel') {
      const cell = Math.max(6, Math.round(Math.max(w, h) / 7)); const t = document.createElement('canvas'); t.width = Math.max(1, Math.ceil(w / cell)); t.height = Math.max(1, Math.ceil(h / cell));
      t.getContext('2d')!.drawImage(base, x, y, w, h, 0, 0, t.width, t.height); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, t.width * cell, t.height * cell);
    } else { ctx.filter = `blur(${Math.max(8, Math.round(Math.max(w, h) / 6))}px)`; ctx.drawImage(base, x - 20, y - 20, w + 40, h + 40, x - 20, y - 20, w + 40, h + 40); ctx.filter = 'none'; }
    ctx.restore();
  }
}

export function PrivacyEditor({ src, onClose, onSave }: { src: string; onClose: () => void; onSave: (blob: Blob) => Promise<void> | void }) {
  const cv = useRef<HTMLCanvasElement>(null); const [img, setImg] = useState<HTMLImageElement>();
  const [boxes, setBoxes] = useState<Box[]>([]); const [mode, setMode] = useState<Mode>('blur'); const [hue, setHue] = useState(0);
  const [drag, setDrag] = useState<Box>(); const [busy, setBusy] = useState<string>();
  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.onerror = () => toast('Could not open this photo', 'err'); i.src = src; }, [src]);
  useEffect(() => { if (img && cv.current) render(cv.current, img, boxes, mode, hue, 1100); }, [img, boxes, mode, hue]);

  const pt = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const down = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); start.current = pt(e); setDrag({ ...start.current!, w: 0, h: 0 }); };
  const move = (e: React.PointerEvent) => { if (!start.current) return; const p = pt(e); const s = start.current; setDrag({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); };
  const up = () => { if (drag && drag.w > 0.01 && drag.h > 0.01) setBoxes((b) => [...b, drag]); start.current = undefined; setDrag(undefined); };

  const detect = async () => {
    if (!img) return;
    if (!CLOUD) { toast(FALLBACK); return; }
    setBusy('Looking for faces, plates and house numbers…');
    try {
      const c = document.createElement('canvas'); const s = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const { data, error } = await supabase().functions.invoke('ai-privacy', { body: { image: c.toDataURL('image/jpeg', 0.8).split(',')[1] } });
      if (error) { let msg = error.message; try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* generic */ } throw new Error(msg); }
      const d = data as { boxes?: Box[]; error?: string }; if (d?.error) throw new Error(d.error);
      const found = d.boxes ?? []; setBoxes((b) => [...b, ...found]); toast(found.length ? `${found.length} spot${found.length === 1 ? '' : 's'} hidden — check them, add or remove boxes as needed` : 'Nothing sensitive found — you can still draw boxes by hand', 'ok');
    } catch (e) { toast(e instanceof Error ? e.message : 'The AI could not answer.', 'err'); } finally { setBusy(undefined); }
  };
  const save = async () => {
    if (!img) return; setBusy('Saving…');
    try { const c = document.createElement('canvas'); render(c, img, boxes, mode, hue, 1600); const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the photo'))), 'image/jpeg', 0.85)); await onSave(blob); onClose(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'err'); } finally { setBusy(undefined); }
  };

  return (
    <Modal title="Privacy edit" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!img || !!busy || (!boxes.length && !hue)} onClick={save}>Save as new photo</button></>}>
      <div className="stack">
        <div className="small muted">Drag on the photo to hide a spot. Your original photo is kept — this saves a separate copy and uses it in the report.</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn" disabled={!img || !!busy} onClick={detect}>✨ Find faces, plates &amp; house numbers</button>
          <div className="chips" role="group" aria-label="How to hide">{([['blur', 'Blur'], ['pixel', 'Pixelate'], ['cover', 'Cover']] as [Mode, string][]).map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
          {boxes.length > 0 && <button className="btn sm" onClick={() => setBoxes((b) => b.slice(0, -1))}>Undo last box</button>}
          {boxes.length > 0 && <button className="btn sm" onClick={() => setBoxes([])}>Clear boxes</button>}
          {busy && <span className="small muted">{busy}</span>}
        </div>
        <div style={{ position: 'relative', touchAction: 'none', lineHeight: 0 }}>
          <canvas ref={cv} style={{ width: '100%', height: 'auto', borderRadius: 8, cursor: 'crosshair', background: '#0b1f33' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} />
          {drag && <div style={{ position: 'absolute', left: `${drag.x * 100}%`, top: `${drag.y * 100}%`, width: `${drag.w * 100}%`, height: `${drag.h * 100}%`, border: '2px dashed #19c37d', background: 'rgba(25,195,125,.15)', pointerEvents: 'none' }} />}
        </div>
        <label className="small" style={{ display: 'grid', gap: 4 }}>Change the colours of the whole photo (makes the house harder to recognise)
          <input type="range" min={0} max={360} step={10} value={hue} onChange={(e) => setHue(Number(e.target.value))} />
        </label>
        {boxes.length > 0 && <div className="small muted">{boxes.length} hidden spot{boxes.length === 1 ? '' : 's'}</div>}
      </div>
    </Modal>
  );
}
