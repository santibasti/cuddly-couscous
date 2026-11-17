// Draws the pixel-art robots (sprites come from lib/pixelbot.ts). A context lets the office switch every robot to pixels without passing a prop through every component.
import { createContext, useContext, useMemo } from 'react';
import { PIX_W, spriteRows, spriteRuns, type PixView } from '@/lib/pixelbot';
export const PixelCtx = createContext(false);
export const usePixel = () => useContext(PixelCtx);
/** True in the Pixel office view: flat colours, hard edges, tile floors. */
export const RetroCtx = createContext(false);
export const useRetro = () => useContext(RetroCtx);
const COL: Record<string, string> = { o: '#0b1230', w: '#e8eefb', g: '#9fb0d4', v: '#0b1b45', e: 'var(--eye, #7fe4ff)', f: '#2a3555', l: '#ffffff', p: '#d9993f', q: '#f7f9ff', k: '#1b2750' };
export const P = 3.6;
function Sprite({ k, view, frame, seated, accent, prop }: { k: string; view: PixView; frame: 0 | 1; seated: boolean; accent: string; prop?: string }) {
  const runs = useMemo(() => spriteRuns(spriteRows(k, view, frame, seated, prop)), [k, view, frame, seated, prop]);
  return <g shapeRendering="crispEdges">{runs.map((r, i) => <rect key={i} x={r.x * P} y={r.y * P} width={r.w * P} height={P} fill={r.c === 'a' ? accent : COL[r.c]} />)}</g>;
}
/** A seated pixel robot (head and torso; the desk hides the rest). */
export function PixelSeated({ k, accent, prop }: { k: string; accent: string; prop?: string }) { return <g transform={`translate(${-PIX_W * P / 2} ${-54 - 12 * P})`}><Sprite k={k} view="front" frame={0} seated accent={accent} prop={prop} /></g>; }
/** A walking pixel robot: two leg frames swap while it moves (CSS), so it stays still when standing. */
export function PixelWalker({ k, view, accent, prop }: { k: string; view: PixView; accent: string; prop?: string }) {
  return <g transform={`translate(${-PIX_W * P / 2} ${-34 * P})`}><g className="pf pf0"><Sprite k={k} view={view} frame={0} seated={false} accent={accent} prop={prop} /></g><g className="pf pf1"><Sprite k={k} view={view} frame={1} seated={false} accent={accent} prop={prop} /></g></g>;
}
export const PIXEL_CSS = `.pf1{opacity:0}.walker.go .pf0{animation:pfa .46s steps(1) infinite}.walker.go .pf1{animation:pfb .46s steps(1) infinite}@keyframes pfa{0%{opacity:1}50%{opacity:0}}@keyframes pfb{0%{opacity:0}50%{opacity:1}}.wing.still .pf0,.wing.still .pf1{animation:none}`;

/** Retro look for the whole office: no blur or glow, hard pixel edges, a pixel font, flat tile floors. */
export const RETRO_CSS = `.wing.retro svg,.wing.retro svg *{shape-rendering:crispEdges}.wing.retro svg [style*="drop-shadow"],.wing.retro svg [style*="blur"]{filter:none!important}.wing.retro svg text{font-family:"Courier New",ui-monospace,monospace!important;font-weight:800}.wing.retro svg polygon[fill*="glassg"],.wing.retro svg .rug rect:first-child{display:none}.wing.retro .holo-pad,.wing.retro svg ellipse[fill*="glow-"]{display:none}`;
