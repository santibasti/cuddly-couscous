// The furniture and decoration that make each department look like a real office: filing cabinets, shelves of folders, mail slots, a mood board, whiteboards, a wall calendar,
// plants, printers, posters, a rug under the desks and a runner to the door. Everything is drawn in code and is decorative (it never shows a status).
import { box, type Room } from '@/lib/hqwing';
import { THEME } from '@/lib/hqtheme';

const Plant = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cx="0" cy="1" rx="8" ry="2.4" fill="rgba(0,0,0,.35)" /><path d="M-6 0L-4.6 -9H4.6L6 0Z" fill="#b5653a" stroke="#7a3f1f" strokeWidth=".6" />
    <path d="M0 -9Q-9 -14 -8 -24Q-2 -20 0 -9Z" fill="#2f9e56" /><path d="M0 -9Q9 -13 8 -24Q2 -20 0 -9Z" fill="#3cb868" /><path d="M0 -9Q-2 -18 0 -29Q3 -19 0 -9Z" fill="#44c474" /><path d="M0 -9Q-12 -8 -11 -16Q-4 -15 0 -9Z" fill="#2a8c4c" /></g>
);
const Cabinet = ({ x, y, w = 24, h = 40, c = '#8d9bb8' }: { x: number; y: number; w?: number; h?: number; c?: string }) => (
  <g><rect x={x} y={y} width={w} height={h} rx="2" fill={c} stroke="#4d5a78" strokeWidth=".8" />{[0, 1, 2].map((i) => <g key={i}><rect x={x + 2} y={y + 2 + i * ((h - 4) / 3)} width={w - 4} height={(h - 4) / 3 - 2} rx="1" fill="rgba(255,255,255,.18)" /><rect x={x + w / 2 - 3.5} y={y + 2 + i * ((h - 4) / 3) + ((h - 4) / 3 - 2) / 2 - 1} width="7" height="2" rx="1" fill="#2a3350" /></g>)}</g>
);
const Shelf = ({ x, y, w = 40, h = 52, a }: { x: number; y: number; w?: number; h?: number; a: string }) => (
  <g><rect x={x} y={y} width={w} height={h} rx="2" fill="#5a3d25" stroke="#2f1d10" strokeWidth=".8" />{[0, 1, 2].map((i) => { const sy = y + 3 + i * (h / 3 - 1); return <g key={i}><rect x={x + 2} y={sy} width={w - 4} height={h / 3 - 5} fill="#2c1c10" />{[...Array(Math.floor((w - 6) / 5))].map((_, j) => <rect key={j} x={x + 3.5 + j * 5} y={sy + 1 + (j % 3)} width="3.6" height={h / 3 - 7 - (j % 3)} rx=".6" fill={['#e0554f', a, '#f2c94c', '#f4f7ff', '#4f9ee0'][(i + j) % 5]} />)}</g>; })}</g>
);
const Board = ({ x, y, w, h, children, frame = '#cfd8ee' }: { x: number; y: number; w: number; h: number; children?: React.ReactNode; frame?: string }) => <g><rect x={x} y={y} width={w} height={h} rx="2" fill="#f7f9ff" stroke={frame} strokeWidth="2" />{children}</g>;
const Printer = ({ x, y }: { x: number; y: number }) => <g><rect x={x} y={y} width="26" height="14" rx="2.5" fill="#dde4f2" stroke="#8d9bb8" strokeWidth=".8" /><rect x={x + 4} y={y - 4} width="18" height="5" fill="#f7f9ff" stroke="#8d9bb8" strokeWidth=".6" /><rect x={x + 5} y={y + 7} width="16" height="3" rx="1" fill="#2a3350" /><circle cx={x + 22} cy={y + 4} r="1.4" fill="#4dffa0" /></g>;

/** Rug under the desks and a runner from the door, in the room's colour. */
export function Rug({ r }: { r: Room }) {
  const b = box(r), t = THEME[r];
  return (
    <g className="rug" pointerEvents="none"><rect x={b.x + 22} y={b.top + 96} width={b.w - 44} height={b.walkY - b.top - 92} rx="14" fill={t.rug} opacity=".34" /><rect x={b.x + 28} y={b.top + 102} width={b.w - 56} height={b.walkY - b.top - 104} rx="11" fill="none" stroke={t.trim} strokeWidth="1.2" opacity=".5" strokeDasharray="5 4" />
      <rect x={b.cx - 24} y={b.walkY - 4} width="48" height={b.wallY - b.walkY + 4} rx="4" fill={t.rug} opacity=".5" /><rect x={b.cx - 24} y={b.walkY - 4} width="48" height={b.wallY - b.walkY + 4} rx="4" fill="none" stroke={t.trim} strokeWidth="1" opacity=".7" /></g>
  );
}
/** What stands against the back wall of each office. */
export function Decor({ r }: { r: Room }) {
  const b = box(r), t = THEME[r]; const y = b.top + 68, L = b.x + 8, R = b.x + b.w - 36;
  switch (r) {
    case 'email': return <g><Shelf x={L} y={y} a="#4fb0ff" /><g transform={`translate(${R - 6} ${y})`}><rect width="42" height="52" rx="3" fill="#35557f" stroke="#1c3558" />{[0, 1, 2, 3].flatMap((i) => [0, 1, 2].map((j) => <g key={`${i}${j}`}><rect x={3 + j * 13} y={3 + i * 12} width="11" height="9.5" rx="1.4" fill="#17294a" />{(i + j) % 2 === 0 && <path d={`M${4 + j * 13} ${4 + i * 12}l4.5 3.6l4.5 -3.6`} fill="none" stroke="#f4f7ff" strokeWidth="1" />}</g>))}</g><Plant x={b.x + 44} y={b.top + 120} s={0.9} /></g>;
    case 'creative': return <g><Board x={L} y={y - 2} w={44} h={54} frame="#2a1b40">{[[5, 5, 14, 10, '#e0a8ff'], [22, 8, 16, 13, '#ffd694'], [6, 20, 12, 14, '#7fe4ff'], [21, 26, 17, 11, '#ff9ac0']].map(([px, py, pw, ph, c], i) => <rect key={i} x={L + (px as number)} y={y - 2 + (py as number)} width={pw as number} height={ph as number} fill={c as string} stroke="#fff" strokeWidth="1" transform={`rotate(${(i % 2 ? 4 : -4)} ${L + 20} ${y + 20})`} />)}</Board><g transform={`translate(${R - 4} ${y + 6})`}><rect x="0" y="22" width="34" height="22" rx="2" fill="#1b1e30" stroke="#a655dc" /><path d="M0 22L34 22L30 12L-3 12Z" fill="#0d0f1c" stroke="#a655dc" />{[0, 1, 2, 3].map((i) => <rect key={i} x={2 + i * 8} y="13" width="4" height="7" fill="#f4f7ff" opacity=".85" />)}</g><Plant x={b.x + 60} y={b.top + 122} s={0.8} /></g>;
    case 'ads': return <g><Board x={L} y={y} w={46} h={40}>{[8, 14, 10, 20, 16].map((h, i) => <rect key={i} x={L + 6 + i * 7.5} y={y + 33 - h} width="5" height={h} fill={['#e8a43d', '#e0554f', '#4fb0ff', '#4dffa0', '#a655dc'][i]} />)}<path d={`M${L + 5} ${y + 22}L${L + 18} ${y + 14}L${L + 28} ${y + 18}L${L + 41} ${y + 6}`} fill="none" stroke="#e0554f" strokeWidth="1.6" /></Board><g transform={`translate(${R - 2} ${y + 4})`}><rect width="36" height="36" rx="3" fill="#f7f9ff" stroke="#cfd8ee" strokeWidth="2" />{[16, 11, 6, 2].map((rr, i) => <circle key={rr} cx="18" cy="18" r={rr} fill={i % 2 ? '#f7f9ff' : '#e0554f'} />)}</g><Cabinet x={b.x + 60} y={b.top + 100} w={20} h={34} c="#7a8499" /></g>;
    case 'desk': return <g><Board x={L} y={y} w={44} h={36}>{[[7, 6, 22, 8, '#34c8a8'], [15, 18, 22, 8, '#4fb0ff'], [7, 28, 16, 6, '#ffd694']].map(([bx, by, bw, bh, c], i) => <rect key={i} x={L + (bx as number)} y={y + (by as number)} width={bw as number} height={bh as number} rx="4" fill={c as string} />)}</Board><g transform={`translate(${R} ${y + 2})`}><rect width="34" height="40" rx="3" fill="#35557f" stroke="#1c3558" />{[0, 1, 2].map((i) => <g key={i}><path d={`M${6 + i * 11} 6v10`} stroke="#2a3350" strokeWidth="2" /><path d={`M${3 + i * 11} 18q5 -12 11 0`} fill="none" stroke="#f4f7ff" strokeWidth="1.8" /></g>)}</g><Printer x={b.x + 60} y={b.top + 124} /></g>;
    case 'booking': return <g><Board x={L} y={y - 4} w={46} h={44}><rect x={L} y={y - 4} width="46" height="9" fill="#e0554f" />{[0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3, 4].map((j) => <rect key={`${i}${j}`} x={L + 3 + j * 8.4} y={y + 8 + i * 8} width="6.6" height="6" fill={(i * 5 + j) % 7 === 3 ? '#ffd694' : '#e8eefb'} />))}</Board><Cabinet x={R + 4} y={y + 2} c="#7f8fb4" /><Printer x={b.x + 58} y={b.top + 126} /></g>;
    case 'hr': return <g><Cabinet x={L} y={y + 4} /><Cabinet x={L + 26} y={y + 4} c="#7f9a8b" /><Board x={R - 10} y={y} w={46} h={40}><rect x={R + 8} y={y + 4} width="10" height="6" fill="#4fb0ff" />{[R - 2, R + 8, R + 18].map((cx, i) => <rect key={i} x={cx} y={y + 17} width="8" height="6" fill="#72c88a" />)}<path d={`M${R + 13} ${y + 10}V${y + 14}M${R + 2} ${y + 14}H${R + 32}`} stroke="#2a3350" strokeWidth="1" /></Board><Plant x={b.x + 78} y={b.top + 122} s={0.9} /></g>;
    case 'hub': return <g><Plant x={L + 10} y={b.top + 118} s={1.1} /><Plant x={b.x + b.w - 20} y={b.top + 118} s={1.1} /><ellipse cx={b.cx} cy={b.top + 168} rx="86" ry="22" fill="none" stroke={t.trim} strokeWidth="1.4" opacity=".5" /></g>;
    case 'board': return <g><Board x={b.cx - 54} y={y - 4} w={108} h={42} frame="#ffc94d"><rect x={b.cx - 52} y={y - 2} width="104" height="38" fill="#0e1430" />{[12, 22, 16, 30, 24, 34].map((h, i) => <rect key={i} x={b.cx - 46 + i * 15} y={y + 32 - h} width="9" height={h} fill="#7fe4ff" opacity=".85" />)}</Board><Plant x={L + 8} y={b.top + 120} s={1} /><Plant x={b.x + b.w - 20} y={b.top + 120} s={1} /></g>;
    default: return <g />;
  }
}
