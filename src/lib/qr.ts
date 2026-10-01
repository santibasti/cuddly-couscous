import QRCode from 'qrcode';

/** QR payload for an asset label. Plain asset codes (typed or from a keyboard-wedge scanner) are accepted too. */
export const qrPayload = (code: string) => `TOPMOP:ASSET:${code}`;
export const parseQr = (text: string): string => {
  const m = text.trim().match(/^TOPMOP:ASSET:(.+)$/i);
  return (m ? m[1] : text.trim()).trim().toUpperCase();
};
export const qrDataUrl = (code: string, width = 240): Promise<string> =>
  QRCode.toDataURL(qrPayload(code), { margin: 1, width, errorCorrectionLevel: 'M', color: { dark: '#0B2545', light: '#FFFFFF' } });
