import Image from "next/image";

type Props = {
  src?: string;
  alt: string;
  label?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Shade variant so placeholder grids don't look identical */
  tone?: number;
  /** CSS object-position for cropping, e.g. "50% 60%" */
  position?: string;
};

/**
 * Renders an optimised image when `src` is supplied, otherwise a clearly
 * marked placeholder (never passed off as real work).
 */
export default function Media({ src, alt, label, className = "", priority, sizes = "100vw", tone = 0, position }: Props) {
  if (src) {
    return (
      <div className={`relative overflow-hidden bg-graphite ${className}`}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" style={position ? { objectPosition: position } : undefined} />
      </div>
    );
  }
  const bg = ["#1A1D21", "#15181B", "#1E2226", "#121417"][tone % 4];
  return (
    <div
      role="img"
      aria-label={`Placeholder image: ${alt}`}
      className={`relative overflow-hidden ${className}`}
      style={{ background: bg }}
    >
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <line x1="0" y1="170" x2="400" y2="170" stroke="#B8BDC3" strokeOpacity=".15" />
        <path
          d="M60 170c0-14 8-22 22-24l34-6 30-26c6-5 12-8 22-8h64c12 0 20 3 28 10l24 24 40 6c10 2 16 8 16 18v6h-16a22 22 0 0 0-44 0H140a22 22 0 0 0-44 0H60z"
          fill="none" stroke="#B8BDC3" strokeOpacity=".28" strokeWidth="1.2"
        />
        <circle cx="118" cy="172" r="16" fill="none" stroke="#B8BDC3" strokeOpacity=".28" strokeWidth="1.2" />
        <circle cx="288" cy="172" r="16" fill="none" stroke="#B8BDC3" strokeOpacity=".28" strokeWidth="1.2" />
      </svg>
      <span className="absolute bottom-3 left-3 border border-silver/30 bg-obsidian/70 px-2 py-1 text-[9px] uppercase tracking-[0.22em] text-silver">
        Placeholder{label ? ` · ${label}` : ""}
      </span>
    </div>
  );
}
