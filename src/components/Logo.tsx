import { LOGO_SMALL_URL } from '@/lib/logo';

export function Logo({ size = 34 }: { size?: number }) {
  return <img src={LOGO_SMALL_URL} width={size} height={size} alt="TopMop" style={{ display: 'block', objectFit: 'contain' }} />;
}
