import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { qrDataUrl, parseQr } from '@/lib/qr';
import { Icon, Modal } from './ui';

/** Renders the scannable QR label for an asset. */
export function QrImage({ code, size = 160 }: { code: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let on = true; qrDataUrl(code, size * 2).then((s) => on && setSrc(s)); return () => { on = false; }; }, [code, size]);
  return src ? <img src={src} alt={`QR code for ${code}`} width={size} height={size} /> : <div style={{ width: size, height: size }} />;
}

/**
 * Camera QR scanner with a manual / keyboard-scanner fallback.
 * Calls onScan(code) for each decode; stays open so a leader can scan several items in a row.
 */
export function QrScanner({ title = 'Scan QR code', onScan, onClose, hint }: { title?: string; onScan: (code: string) => void; onClose: () => void; hint?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  const [last, setLast] = useState('');
  const lastAt = useRef(0);

  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    // Chrome / Android tablets can decode QR + common barcodes natively; everything else falls back to jsQR (QR only)
    const BD = (window as unknown as { BarcodeDetector?: new (o?: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    let detector: InstanceType<NonNullable<typeof BD>> | null = null;
    try { detector = BD ? new BD({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'data_matrix'] }) : null; } catch { detector = null; }
    let busy = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera not available in this browser (needs HTTPS or localhost).');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!; v.srcObject = stream; await v.play();
        const tick = () => {
          if (stopped) return;
          if (detector && v.readyState >= 2 && !busy) {
            busy = true;
            detector.detect(v).then((r) => { const raw = r[0]?.rawValue; if (raw && Date.now() - lastAt.current > 1500) { lastAt.current = Date.now(); const c = parseQr(raw); setLast(c); onScan(c); } }).catch(() => { detector = null; }).finally(() => { busy = false; });
          } else if (!detector && v.readyState >= 2 && v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (r?.data && Date.now() - lastAt.current > 1500) { lastAt.current = Date.now(); const c = parseQr(r.data); setLast(c); onScan(c); }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { setErr((e as Error).message || 'Could not start the camera.'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => { const c = parseQr(manual); if (c) { setLast(c); onScan(c); setManual(''); } };
  return (
    <Modal title={title} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      {!err ? <video ref={video} playsInline muted className="scanvideo" style={{ width: '100%', background: '#0B2545', borderRadius: 8, objectFit: 'cover' }} /> : <div className="alert warn">{err}</div>}
      <p className="small muted">{hint ?? 'Point the camera at the QR label on the machine or tool. Each successful scan is applied immediately.'}</p>
      {last && <div className="alert info">Last scan: <b>{last}</b></div>}
      <div className="row" style={{ marginTop: 10 }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Type or scan a code (e.g. WFP-001)" aria-label="Asset code" style={{ flex: 1 }} autoFocus={!!err} />
        <button className="btn" onClick={submit}><Icon name="check" />Apply</button>
      </div>
    </Modal>
  );
}
