/**
 * Alex Restoration wordmark, redrawn as a transparent vector from the supplied
 * logo. Replace with the official vector (SVG) from the brand files when available.
 * Uses currentColor so it adapts to any background; the frame is masked behind
 * the lettering so no background colour is needed.
 */
export default function Logo({ className = "h-9 w-auto", id = "logo" }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 340 96" role="img" aria-label="Alex Restoration" className={className} fill="currentColor">
      <defs>
        <mask id={`${id}-cut`} maskUnits="userSpaceOnUse" x="0" y="0" width="340" height="96">
          <rect width="340" height="96" fill="#fff" />
          <text x="6" y="64" fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight={700} fontSize={50} letterSpacing={-2} fill="#000" stroke="#000" strokeWidth={10} strokeLinejoin="round">Alex</text>
        </mask>
      </defs>
      <rect x="5" y="5" width="86" height="86" fill="none" stroke="currentColor" strokeWidth="6" mask={`url(#${id}-cut)`} />
      <text x="6" y="64" fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight={700} fontSize={50} letterSpacing={-2}>Alex</text>
      <text x="114" y="64" fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight={500} fontSize={24} letterSpacing={5.5}>Restoration</text>
    </svg>
  );
}
