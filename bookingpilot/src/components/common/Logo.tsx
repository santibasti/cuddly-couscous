export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#2563eb" />
      <path d="M8 21 24 9l-4 14-4-5-4 3z" fill="#fff" />
      <circle cx="23.5" cy="22.5" r="3" fill="#0f9a89" stroke="#2563eb" strokeWidth="1.5" />
    </svg>
  );
}
export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className={`font-display text-lg font-extrabold tracking-tight ${dark ? 'text-navy-900' : 'text-white'}`}>BookingPilot</span>
    </div>
  );
}
