// The TopMop logo, shared by every screen and document. The PNG lives in /public (cached by the service worker, so documents still get it offline).
const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
export const LOGO_URL = `${base}logo.png`;
export const LOGO_SMALL_URL = `${base}logo-256.png`;

let cached: Promise<string | null> | undefined;
/** The logo as a data URL for PDF / Excel (null if it cannot be loaded: the document is then made without it). */
export function logoDataUrl(): Promise<string | null> {
  return (cached ??= (async () => {
    try {
      const res = await fetch(LOGO_URL); if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      return await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
    } catch { cached = undefined; return null; }
  })());
}
