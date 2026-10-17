// Tap-to-choose service boxes for the quotation (replaces the "Add from price list" dropdown): one box per service with an icon, its name and its rate.
import type { ServiceDef } from '@/lib/types';
import { money } from '@/lib/util';

/** Line icons on a 24 × 24 grid, one per standard service; anything else gets the sparkle. */
const ICON: Record<string, string[]> = {
  GLASS_EXT: ['M4 4h16v16H4z', 'M12 4v16M4 12h16', 'M17 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z'],
  GLASS_INT: ['M5 3h14v18H5z', 'M5 12h14', 'M9 7v2M9 15v2'],
  ROOF: ['M2.5 12L12 4l9.5 8', 'M5 10.5V20h14v-9.5', 'M9 20v-5h6v5'],
  WALL: ['M3 5h18v14H3z', 'M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4'],
  SOLAR: ['M3 15l3.5-8h12L22 15z', 'M5 11h15M10 7l-1.5 8M15 7l1.5 8', 'M12 15v5M8 20h8'],
  ACP: ['M4 3h16v18H4z', 'M4 9h16M4 15h16', 'M8 3v18M16 3v18'],
  FLOOR: ['M3 20L8 8h8l5 12z', 'M5.5 14h13M9.5 8L8 20M14.5 8L16 20'],
  CEILING: ['M3 4h18v5H3z', 'M7 9v4M12 9v6M17 9v4', 'M5 18h14'],
  GUTTER: ['M3 8h18v4H3z', 'M6 12v3M12 12v3M18 12v3', 'M12 15c-1.5 2-2 3-2 4a2 2 0 004 0c0-1-.5-2-2-4z'],
  OTHER: ['M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z'],
};
const SPARK = ICON.OTHER;

export function ServiceIcon({ code, size = 26 }: { code: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(ICON[code] ?? SPARK).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function ServiceTiles({ services, value, onPick }: { services: ServiceDef[]; value: string; onPick: (code: string) => void }) {
  return (
    <div className="stiles" role="radiogroup" aria-label="Service to add">
      {services.map((s) => (
        <button key={s.code} type="button" role="radio" aria-checked={value === s.code} className={`stile${value === s.code ? ' on' : ''}`} onClick={() => onPick(s.code)}>
          <span className="stile-ic"><ServiceIcon code={s.code} /></span>
          <span className="stile-name">{s.name}</span>
          <span className="stile-rate">{s.custom_quote ? 'Custom quote' : `${money(s.rate)} / ${s.unit}`}</span>
          {value === s.code && <span className="stile-tick" aria-hidden>✓</span>}
        </button>
      ))}
    </div>
  );
}

/** Same idea for the glass packages: one box per package. */
export function PackageTiles({ options, value, onPick }: { options: { id: string; price: number; qty: number; excess_rate: number }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="stiles pk" role="radiogroup" aria-label="Glass package">
      {options.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={`stile pk${value === p.id ? ' on' : ''}`} onClick={() => onPick(p.id)}>
          <span className="stile-name">{money(p.price)}</span>
          <span className="stile-rate">for {p.qty} panels</span>
          <span className="stile-sub">{money(p.excess_rate)}/panel beyond {p.qty}</span>
          {value === p.id && <span className="stile-tick" aria-hidden>✓</span>}
        </button>
      ))}
    </div>
  );
}
