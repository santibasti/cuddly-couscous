import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { partRisk, partStatusLabel, SERVICES, type Health, type PartRisk } from '../lib/logic';
import type { Mechanic, Part, Project, ServiceType } from '../lib/types';

const ICONS: Record<string, string> = {
  dash: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  car: 'M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11m-14 0h14a2 2 0 012 2v4h-2m-14-6a2 2 0 00-2 2v4h2m0 0a2 2 0 104 0m6 0a2 2 0 104 0m-10 0h6',
  cal: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  gantt: 'M4 6h8M8 12h10M6 18h9',
  wrench: 'M14.7 6.3a4 4 0 005 5L21 13l-8 8a2.8 2.8 0 01-4-4l8-8zM17 3l-3 3 4 4 3-3',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5m0 0l9-5m-9 5v9',
  lock: 'M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z',
  truck: 'M2 6h11v10H2zM13 9h5l3 3v4h-8M6 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z',
  warn: 'M12 3l10 18H2zM12 10v5m0 3v.01',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  arrow: 'M5 12h14m-6-6l6 6-6 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  users: 'M16 11a3 3 0 100-6 3 3 0 000 6zM8 12a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0M14 20a5 5 0 018 0',
  insight: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
};

export const Icon = ({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name] ?? ''} />
  </svg>
);

export const carName = (p: Project) => `${p.year} ${p.make} ${p.model}`;
export const statusLabel = (s: string) => s.replace('_', ' ');

export const Bar = ({ value, tone, thin }: { value: number; tone?: string; thin?: boolean }) => (
  <div className={`bar ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={`bar-fill ${tone ?? ''}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

export const Pill = ({ tone = 'gray', children, dot = true }: { tone?: string; children: ReactNode; dot?: boolean }) => (
  <span className={`pill ${tone}`}>{dot && <i />}{children}</span>
);

const HEALTH: Record<Health, [string, string]> = {
  on_track: ['green', 'On track'], at_risk: ['amber', 'At risk'], blocked: ['orange', 'Blocked'],
  late: ['red', 'Late'], hold: ['gray', 'On hold'], quote: ['violet', 'Quote'], done: ['blue', 'Complete'],
};
export const healthTone = (h: Health) => HEALTH[h][0];
export const ServicePill = ({ s }: { s: ServiceType }) => <Pill tone={SERVICES[s].tone} dot={false}>{SERVICES[s].short}</Pill>;
export const HealthPill = ({ h }: { h: Health }) => <Pill tone={HEALTH[h][0]}>{HEALTH[h][1]}</Pill>;

const RISK: Record<PartRisk, [string, string]> = {
  late: ['red', 'Overdue'], order_now: ['orange', 'Order now'], at_risk: ['amber', 'At risk'], ok: ['green', 'On time'], done: ['gray', 'In shop'],
};
export const RiskPill = ({ r }: { r: PartRisk }) => <Pill tone={RISK[r][0]}>{RISK[r][1]}</Pill>;

export const PartStatusPill = ({ part }: { part: Part }) => (
  <Pill tone={part.status === 'backordered' ? 'red' : part.status === 'shipped' ? 'blue' : part.status === 'ordered' ? 'amber' : part.status === 'needed' ? 'orange' : 'green'}>
    {partStatusLabel(part.kind, part.status)}
  </Pill>
);

export function Spark({ data, tone = 'accent' }: { data: number[]; tone?: string }) {
  const max = Math.max(1, ...data);
  const w = 90;
  const h = 28;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - 2 - (v / max) * (h - 6)}`);
  return (
    <svg className={`spark ${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} className="area" />
      <polyline points={pts.join(' ')} className="line" fill="none" />
    </svg>
  );
}

export const Kpi = ({ label, value, sub, tone, spark, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; spark?: number[]; icon?: string }) => (
  <div className={`card kpi ${tone ?? ''}`}>
    <div className="kpi-top"><span className="eyebrow">{label}</span>{icon && <span className="kpi-ico"><Icon name={icon} /></span>}</div>
    <div className="kpi-mid"><span className="kpi-val">{value}</span>{spark && <Spark data={spark} tone={tone} />}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
);

export const Card = ({ title, action, children, flush, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) => (
  <section className={`card ${className}`}>
    {(title || action) && <header className="card-h"><h2>{title}</h2><div>{action}</div></header>}
    <div className={flush ? 'flush' : ''}>{children}</div>
  </section>
);

export const Avatar = ({ m, size = 24 }: { m?: Mechanic; size?: number }) =>
  m ? (
    <span className="avatar" style={{ background: m.color, width: size, height: size, fontSize: size * 0.4 }} title={m.name}>
      {m.name.split(' ').map((w) => w[0]).join('')}
    </span>
  ) : (
    <span className="avatar none" style={{ width: size, height: size, fontSize: size * 0.45 }} title="Unassigned">?</span>
  );

export const ProjectLink = ({ p }: { p: Project }) => (
  <Link to={`/projects/${p.id}`} className="plink">
    <strong>{p.code}</strong><span>{carName(p)}</span>
  </Link>
);

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export { partRisk };

export type CarStyle = 'mustang' | 'porsche' | 'camaro' | 'mercedes' | 'corvette' | 'jaguar' | 'classic';

/** Picks the silhouette for a car from its make and model. */
export function carStyle(make: string, model: string): CarStyle {
  const s = `${make} ${model}`.toLowerCase();
  if (/mustang/.test(s)) return 'mustang';
  if (/porsche|911/.test(s)) return 'porsche';
  if (/camaro/.test(s)) return 'camaro';
  if (/mercedes|190\s?sl|benz/.test(s)) return 'mercedes';
  if (/corvette|sting ?ray/.test(s)) return 'corvette';
  if (/jaguar|e-type|xk/.test(s)) return 'jaguar';
  return 'classic';
}

interface Shape { body: string; glass: string[]; wheels: [number, number]; r: number; extra?: ReactNode }

const SHAPES: Record<CarStyle, Shape> = {
  // 1967 Mustang Fastback: long hood, roofline sweeping down to a short tail
  mustang: {
    body: 'M18 100C18 92 24 88 42 86L82 82C112 56 148 42 184 40C216 39 244 48 266 66L340 74C366 78 382 86 382 100V108H18Z',
    glass: ['M124 72C142 55 166 46 190 45C220 45 244 53 262 66Z'], wheels: [96, 304], r: 27,
    extra: <><path d="M268 69L338 77" stroke="#fff" strokeOpacity=".28" strokeWidth="1.4" /><rect x="352" y="86" width="22" height="9" rx="3" fill="#cfd3da" opacity=".85" /></>,
  },
  // 1972 Porsche 911T: compact teardrop, short nose, long sloping roof
  porsche: {
    body: 'M26 98C26 88 34 80 58 72C86 52 126 40 168 40C206 40 234 48 256 62L318 74C350 80 370 88 374 100V108H26Z',
    glass: ['M102 69C122 53 148 44 176 44C206 44 230 52 248 64Z'], wheels: [100, 298], r: 26,
    extra: <><ellipse cx="352" cy="82" rx="11" ry="9" fill="#f4e7c6" opacity=".95" /><rect x="18" y="98" width="12" height="8" rx="3" fill="#d3d6dd" /><rect x="372" y="99" width="10" height="8" rx="3" fill="#d3d6dd" /></>,
  },
  // 1969 Camaro SS: boxier greenhouse set back, long hood, short deck
  camaro: {
    body: 'M18 98C18 90 22 86 38 84L96 80L114 62C132 50 162 44 198 44C232 44 254 52 270 66L346 76C372 80 384 88 384 100V108H18Z',
    glass: ['M132 64C148 53 172 48 198 48C226 48 246 54 260 64Z'], wheels: [98, 304], r: 27,
    extra: <><path d="M276 69L344 78M282 66L346 74" stroke="#fff" strokeOpacity=".55" strokeWidth="2.6" /><rect x="378" y="92" width="8" height="12" rx="2" fill="#cfd3da" /></>,
  },
  // 1958 Mercedes-Benz 190SL: low roadster with a small windscreen and an open cockpit
  mercedes: {
    body: 'M18 100C18 92 26 86 46 84L236 76C262 74 280 70 292 68L346 78C370 82 384 90 384 100V108H18Z',
    glass: ['M232 74L252 54C258 52 266 54 268 58L282 70Z'], wheels: [100, 302], r: 26,
    extra: <><path d="M118 79L226 77L224 66C190 62 150 64 126 68Z" fill="#14100e" opacity=".85" /><rect x="126" y="62" width="22" height="14" rx="6" fill="#2b221c" /><rect x="168" y="62" width="22" height="14" rx="6" fill="#2b221c" /><ellipse cx="364" cy="88" rx="7" ry="6" fill="#f4e7c6" /><rect x="340" y="92" width="28" height="8" rx="3" fill="#d3d6dd" opacity=".8" /></>,
  },
  // 1963 Corvette Sting Ray: low and wide, pointed nose, split rear window
  corvette: {
    body: 'M16 102C16 94 22 90 40 88C70 84 96 72 120 62C150 48 188 44 214 46C238 48 254 58 270 70L342 82C370 86 388 94 388 102V108H16Z',
    glass: ['M136 62C152 52 176 49 194 49L194 62Z', 'M200 49C220 50 240 58 254 68L200 66Z'], wheels: [96, 306], r: 27,
    extra: <><path d="M196 49L198 66" stroke="#c9ccd3" strokeWidth="3" /><path d="M222 82L262 82M226 87L260 87" stroke="#fff" strokeOpacity=".4" strokeWidth="1.6" /><ellipse cx="376" cy="94" rx="6" ry="4" fill="#f4e7c6" /></>,
  },
  // 1963 Jaguar E-Type: very long bonnet, low swept roof
  jaguar: {
    body: 'M18 100C18 92 24 88 40 86C66 82 92 70 118 58C146 44 178 42 204 46C226 50 242 60 254 70L348 84C372 88 388 94 388 102V108H18Z',
    glass: ['M142 58C158 48 180 46 200 49C216 52 228 60 236 68L146 70Z'], wheels: [100, 308], r: 27,
    extra: <><ellipse cx="372" cy="95" rx="9" ry="6" fill="#1a1a1c" /><ellipse cx="372" cy="95" rx="6" ry="4" fill="#f4e7c6" opacity=".9" /><path d="M262 76L348 88" stroke="#fff" strokeOpacity=".3" strokeWidth="1.4" /></>,
  },
  classic: {
    body: 'M20 100C20 90 26 84 48 82L98 76C116 54 150 38 198 36C240 35 270 48 290 68L342 76C368 80 382 88 382 100V108H20Z',
    glass: ['M124 72C142 56 168 47 198 46C230 46 254 55 270 70Z'], wheels: [96, 304], r: 27,
    extra: <><ellipse cx="373" cy="91" rx="7" ry="5" fill="#f4e7c6" /><rect x="19" y="90" width="7" height="8" rx="2" fill="#c0392b" /></>,
  },
};

/** Stylised side profile of the actual model, painted in the job's own colour. */
export function CarArt({ color, car, className = '' }: { color: string; car?: { make: string; model: string }; className?: string }) {
  const id = useId().replace(/:/g, '');
  const sh = SHAPES[car ? carStyle(car.make, car.model) : 'classic'];
  const mix = (pct: number, other: string) => ({ stopColor: `color-mix(in srgb, ${color} ${pct}%, ${other})` }) as CSSProperties;
  const wheel = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy={108} r={sh.r + 4} fill="var(--arch)" />
      <circle cx={cx} cy={108} r={sh.r - 1} fill="#0a0a0c" />
      <circle cx={cx} cy={108} r={sh.r - 10} fill={`url(#w${id})`} />
      <circle cx={cx} cy={108} r={6} fill="#2b2d33" />
      {[0, 72, 144, 216, 288].map((a) => <line key={a} x1={cx} y1={108} x2={cx + (sh.r - 12) * Math.cos((a * Math.PI) / 180)} y2={108 + (sh.r - 12) * Math.sin((a * Math.PI) / 180)} stroke="#2b2d33" strokeWidth="2.4" />)}
    </g>
  );
  return (
    <svg className={`car ${className}`} viewBox="0 0 400 150" aria-hidden>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={mix(70, 'white')} /><stop offset=".42" stopColor={color} /><stop offset="1" style={mix(52, 'black')} />
        </linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1b2330" /><stop offset="1" stopColor="#56657d" /></linearGradient>
        <radialGradient id={`w${id}`}><stop offset="0" stopColor="#e9ebf0" /><stop offset="1" stopColor="#7c808a" /></radialGradient>
        <radialGradient id={`s${id}`}><stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="200" cy="138" rx="190" ry="9" fill={`url(#s${id})`} />
      <path d={sh.body} fill={`url(#b${id})`} />
      {sh.glass.map((g) => <path key={g} d={g} fill={`url(#g${id})`} />)}
      <path d="M30 91H372" stroke="#fff" strokeOpacity=".22" strokeWidth="1.3" />
      <path d="M196 78V106" stroke="#000" strokeOpacity=".25" strokeWidth="1.5" />
      {sh.extra}
      {sh.wheels.map(wheel)}
    </svg>
  );
}

export function Ring({ value, size = 52, stroke = 4, tone, label }: { value: number; size?: number; stroke?: number; tone?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ${tone ?? ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}% complete`}>
      <circle className="bg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle className="fg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">{label ?? value}</text>
    </svg>
  );
}

export const StripStat = ({ label, value, sub, tone, spark }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; spark?: number[] }) => (
  <div>
    <div className="eyebrow">{label}</div>
    <div className={`sv ${tone ?? ''}`}><span>{value}</span>{spark && <Spark data={spark} />}</div>
    <div className="small">{sub}</div>
  </div>
);
