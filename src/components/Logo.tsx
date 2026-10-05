export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#0B2545" />
      <path d="M6 11h20M9 16h14M12 21h8" stroke="#22C1C3" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
