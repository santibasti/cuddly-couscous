import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/ctx';
import Icon from '@/components/Icon';
import ReceiptEditor from '@/components/ReceiptEditor';
import { blankReceipt, formatTin, num } from '@/lib/bir';
import { downscale, sha256 } from '@/lib/image';
import type { Receipt } from '@/lib/types';

interface Job { key: string; name: string; state: 'working' | 'done' | 'skipped' | 'failed'; msg?: string; receipt?: Receipt }

export default function Scan() {
  const { api, company, receipts, scansUsed, canWrite, reload } = useApp();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<Receipt | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const limit = company.scanLimit;
  const left = Math.max(0, limit - scansUsed);

  const patch = (key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)));

  async function run(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    const skippedNonImage = files.length - imgs.length;
    const seen = new Set(receipts.map((r) => r.imageHash).filter(Boolean));
    const work: Job[] = imgs.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, state: 'working' }));
    const list = [...work];
    if (skippedNonImage) list.unshift({ key: `x-${Date.now()}`, name: `${skippedNonImage} file(s)`, state: 'skipped', msg: 'Only photos (JPG/PNG/HEIC) are supported for now — PDFs coming soon.' });
    setJobs((j) => [...list, ...j]);

    let remaining = left;
    for (let i = 0; i < imgs.length; i++) {
      const key = work[i].key;
      try {
        if (remaining <= 0) { patch(key, { state: 'failed', msg: 'Monthly scan limit reached — contact support to raise it.' }); continue; }
        const blob = await downscale(imgs[i]);
        const hash = await sha256(blob);
        if (seen.has(hash)) { patch(key, { state: 'skipped', msg: 'Already uploaded.' }); continue; }
        seen.add(hash);
        const path = await api.uploadImage(blob, hash);
        let ex;
        try { ex = await api.extract(blob); remaining--; } catch (e) { ex = { fields: {}, confidence: {}, read: false, message: (e as Error).message }; }
        const r = blankReceipt(company.id);
        const f = ex.fields;
        Object.assign(r, f, {
          supplierTin: formatTin(f.supplierTin ?? ''), total: num(f.total), vatable: num(f.vatable), vatAmount: num(f.vatAmount),
          vatExempt: num(f.vatExempt), zeroRated: num(f.zeroRated), withholdingTax: num(f.withholdingTax),
          date: /^\d{4}-\d{2}-\d{2}$/.test(f.date ?? '') ? f.date! : r.date,
          imagePath: path, imageHash: hash, confidence: ex.confidence, status: 'needs_review',
        });
        await api.saveReceipt(r);
        patch(key, { state: 'done', receipt: r, msg: ex.read ? undefined : ex.message });
      } catch (e) { patch(key, { state: 'failed', msg: (e as Error).message }); }
    }
    await reload();
  }

  const pick = (fl: FileList | null) => { if (fl?.length) void run([...fl]); if (input.current) input.current.value = ''; };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Scan receipts</h1><div className="sub">Photograph each receipt or invoice — whole page in view, flat and well lit.</div></div></div>
      <div className="card row" style={{ flexWrap: 'nowrap' }}><div className="grow"><div className="bar"><i style={{ width: `${Math.min(100, (scansUsed / limit) * 100)}%` }} /></div></div><span className="small muted nowrap">{scansUsed} / {limit} scans used this month</span></div>

      {canWrite ? (
        <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}>
          <div className="drop-ic"><Icon name="camera" size={28} /></div>
          <p style={{ margin: '0 0 1rem' }}><b>Drop receipt photos here</b><br /><span className="muted small">JPG, PNG or HEIC · several at once is fine</span></p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={() => input.current?.click()}><Icon name="upload" size={17} />Take photo / choose files</button>
            <button onClick={() => setOpen(blankReceipt(company.id))}><Icon name="plus" size={17} />Enter manually</button>
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => pick(e.target.files)} />
        </div>
      ) : <div className="notice info"><Icon name="shield" />Your role is read-only.</div>}

      {jobs.length > 0 && (
        <div className="card">
          <h2>This session</h2>
          <ul className="issues list">
            {jobs.map((j) => (
              <li key={j.key} className="item">
                <span className="row" style={{ gap: '.55rem', flexWrap: 'nowrap' }}>
                  <span style={{ color: j.state === 'done' ? 'var(--ok)' : j.state === 'failed' ? 'var(--bad)' : 'var(--muted)', display: 'flex' }}>
                    <Icon name={j.state === 'working' ? 'spinner' : j.state === 'done' ? 'check' : j.state === 'skipped' ? 'undo' : 'error'} />
                  </span>
                  <span>{j.name}{j.msg && <span className="muted small"> — {j.msg}</span>}</span>
                </span>
                {j.receipt && <button className="sm" onClick={() => setOpen(j.receipt!)}>Review</button>}
              </li>
            ))}
          </ul>
          <div className="small muted" style={{ marginTop: '.5rem' }}>Scanned receipts are saved as “needs review”. Verify each one before exporting. <Link to="/receipts">See all receipts →</Link></div>
        </div>
      )}
      {open && <ReceiptEditor initial={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
