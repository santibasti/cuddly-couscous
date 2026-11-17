// Draws the pixel-art robots (sprites come from lib/pixelbot.ts). A context lets the office switch every robot to pixels without passing a prop through every component.
import { createContext, useContext, useMemo } from 'react';
import { PIX_W, spriteRows, spriteRuns, type PixView } from '@/lib/pixelbot';
export const PixelCtx = createContext(false);
export const usePixel = () => useContext(PixelCtx);
const COL: Record<string, string> = { o: '#0b1230', w: '#e8eefb', g: '#9fb0d4', v: '#0b1b45', e: 'var(--eye, #7fe4ff)', f: '#2a3555' };
export const P = 3;
function Sprite({ k, view, frame, seated, accent }: { k: string; view: PixView; frame: 0 | 1; seated: boolean; accent: string }) {
  const runs = useMemo(() => spriteRuns(spriteRows(k, view, frame, seated)), [k, view, frame, seated]);
  return <g shapeRendering="crispEdges">{runs.map((r, i) => <rect key={i} x={r.x * P} y={r.y * P} width={r.w * P} height={P} fill={r.c === 'a' ? accent : COL[r.c]} />)}</g>;
}
/** A seated pixel robot (head and torso; the desk hides the rest). */
export function PixelSeated({ k, accent }: { k: string; accent: string }) { return <g transform={`translate(${-PIX_W * P / 2} -90)`}><Sprite k={k} view="front" frame={0} seated accent={accent} /></g>; }
/** A walking pixel robot: two leg frames swap while it moves (CSS), so it stays still when standing. */
export function PixelWalker({ k, view, accent }: { k: string; view: PixView; accent: string }) {
  return <g transform={`translate(${-PIX_W * P / 2} -102)`}><g className="pf pf0"><Sprite k={k} view={view} frame={0} seated={false} accent={accent} /></g><g className="pf pf1"><Sprite k={k} view={view} frame={1} seated={false} accent={accent} /></g></g>;
}
export const PIXEL_CSS = `.pf1{opacity:0}.walker.go .pf0{animation:pfa .46s steps(1) infinite}.walker.go .pf1{animation:pfb .46s steps(1) infinite}@keyframes pfa{0%{opacity:1}50%{opacity:0}}@keyframes pfb{0%{opacity:0}50%{opacity:1}}.wing.still .pf0,.wing.still .pf1{animation:none}`;
