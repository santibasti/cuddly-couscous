// Mark up a picture before it goes into a quotation: circle, arrow, freehand or a short label, so the client sees what to look at.
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui';
import { MARK_COLORS, drawShape, type Shape, type Tool } from '@/lib/markup';

const TOOLS: { id: Tool; label: string }[] = [{ id: 'circle', label: '⭕ Circle' }, { id: 'arrow', label: '➜ Arrow' }, { id: 'pen', label: '✏ Draw' }, { id: 'text', label: 'T Text' }];

export function ImageMarkup({ src, onDone, onClose }: { src: string; onDone: (dataUrl: string) => void; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null); const img = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false); const [shapes, setShapes] = useState<Shape[]>([]); const [tool, setTool] = useState<Tool>('circle'); const [color, setColor] = useState<string>(MARK_COLORS[0]); const [label, setLabel] = useState('');
  const live = useRef<Shape | null>(null);

  const paint = () => {
    const c = cv.current, i = img.current; if (!c || !i) return; const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(i, 0, 0, c.width, c.height);
    for (const s of shapes) drawShape(ctx, s, c.width, c.height);
    if (live.current) drawShape(ctx, live.current, c.width, c.height);
  };
  useEffect(() => { const i = new Image(); i.onload = () => { img.current = i; if (cv.current) { cv.current.width = i.naturalWidth; cv.current.height = i.naturalHeight; } setReady(true); }; i.src = src; }, [src]);
  useEffect(paint, [shapes, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e: React.PointerEvent): [number, number] => { const c = cv.current!; const r = c.getBoundingClientRect(); return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height]; };
  const down = (e: React.PointerEvent) => {
    if (!ready) return; const [x, y] = at(e);
    if (tool === 'text') { if (label.trim()) setShapes((s) => [...s, { t: 'text', x, y, s: label.trim().slice(0, 40), c: color }]); return; }
    (e.target as Element).setPointerCapture(e.pointerId);
    live.current = tool === 'pen' ? { t: 'pen', pts: [[x, y]], c: color } : { t: tool, x1: x, y1: y, x2: x, y2: y, c: color }; paint();
  };
  const move = (e: React.PointerEvent) => {
    const s = live.current; if (!s) return; const [x, y] = at(e);
    if (s.t === 'pen') s.pts.push([x, y]); else if (s.t !== 'text') { s.x2 = x; s.y2 = y; }
    paint();
  };
  const up = () => { const s = live.current; live.current = null; if (s) setShapes((a) => [...a, s]); };
  const finish = () => { const c = cv.current; if (!c) return; onDone(shapes.length ? c.toDataURL('image/jpeg', 0.88) : src); };

  return (
    <Modal title="Mark up the picture" size="wide" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary lg" onClick={finish}>{shapes.length ? 'Use this marked picture' : 'Use the picture as it is'}</button></>}>
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="chips" role="group" aria-label="Tool" style={{ marginTop: 0 }}>{TOOLS.map((t) => <button key={t.id} type="button" className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)}>{t.label}</button>)}</div>
          <div className="row" style={{ gap: 6 }} role="group" aria-label="Colour">{MARK_COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ac, #22C1C3)' : '2px solid #94a3b8', cursor: 'pointer' }} />)}</div>
          <button type="button" className="btn sm" disabled={!shapes.length} onClick={() => setShapes((s) => s.slice(0, -1))}>↶ Undo</button>
          <button type="button" className="btn sm" disabled={!shapes.length} onClick={() => setShapes([])}>Clear</button>
        </div>
        {tool === 'text' && <input autoFocus maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Type a short label, then tap the picture where it goes" aria-label="Label text" />}
        <div className="small muted">{tool === 'circle' ? 'Drag to draw a circle around the area.' : tool === 'arrow' ? 'Drag from where the arrow starts to what it points at.' : tool === 'pen' ? 'Draw freely with your finger or mouse.' : 'Tap on the picture to place the label.'} Your original photo is not changed until you press the button below.</div>
        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ width: '100%', maxHeight: '62vh', objectFit: 'contain', touchAction: 'none', borderRadius: 8, background: '#f1f5f9', cursor: 'crosshair', alignSelf: 'center' }} />
      </div>
    </Modal>
  );
}
