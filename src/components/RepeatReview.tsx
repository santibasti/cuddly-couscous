// "Use previous billing": review and change what is copied before it goes into the new quotation — the wording of every line, the glass package,
// the panel count and the excess rate, today's rates if wanted — plus the scope and the thank-you line.
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/store';
import { Field, Modal } from '@/components/ui';
import { docTotals } from '@/lib/business';
import { money } from '@/lib/util';
import type { QuoteItem, ServiceDef } from '@/lib/types';
import type { RepeatSource } from '@/components/RepeatClientCard';

interface Pk { code: string; price: number; covers: number; panels: number; excess_rate: number; descPkg: string; descEx: string; editedPkg: boolean; editedEx: boolean; discount: number }
const pkgText = (name: string, covers: number) => `${name} – Starter Package (up to ${covers} panels)`;
const exText = (covers: number) => `Excess panels beyond ${covers}`;

export interface RepeatResult { items: QuoteItem[]; scope?: string; payment_option?: string; thanks?: string }

export function RepeatReviewModal({ source, vat, onClose, onApply }: { source: RepeatSource & { thanks?: string }; vat: { mode: 'exclusive' | 'inclusive' | 'none'; rate: number; discount: number }; onClose: () => void; onApply: (r: RepeatResult) => void }) {
  const { db } = useAuth(); const svcOf = (code: string) => db.services.find((s) => s.code === code && !s.deleted_at);
  const pIdx = source.items.findIndex((i) => i.package_qty && i.unit === 'package');
  const eIdx = pIdx >= 0 ? source.items.findIndex((i, k) => k > pIdx && i.service_code === source.items[pIdx].service_code && i.unit === 'panel' && /^excess/i.test(i.description)) : -1;
  const [pk, setPk] = useState<Pk | null>(() => {
    if (pIdx < 0) return null; const p = source.items[pIdx]; const e = eIdx >= 0 ? source.items[eIdx] : undefined; const covers = p.package_qty ?? 0;
    return { code: p.service_code, price: p.rate, covers, panels: covers + (e?.qty ?? 0), excess_rate: e?.rate ?? svcOf(p.service_code)?.excess_rate ?? svcOf(p.service_code)?.rate ?? 0, descPkg: p.description, descEx: e?.description ?? exText(covers), editedPkg: true, editedEx: true, discount: p.discount || 0 };
  });
  const [lines, setLines] = useState<{ idx: number; item: QuoteItem; drop: boolean }[]>(() => source.items.map((item, idx) => ({ idx, item: { ...item }, drop: false })).filter((l) => l.idx !== pIdx && l.idx !== eIdx));
  const [scope, setScope] = useState(source.scope ?? ''); const [useScope, setUseScope] = useState(!!source.scope);
  const [thanks, setThanks] = useState(source.thanks ?? ''); const [useThanks, setUseThanks] = useState(false);
  const setLine = (idx: number, p: Partial<QuoteItem>) => setLines(lines.map((l) => (l.idx === idx ? { ...l, item: { ...l.item, ...p } } : l)));
  const svc: ServiceDef | undefined = pk ? svcOf(pk.code) : undefined;
  const pkgOptions = useMemo(() => {
    if (!svc) return [] as { id: string; price: number; qty: number; excess_rate: number }[];
    const o = (svc.packages ?? []).map((p) => ({ id: p.id, price: p.price, qty: p.qty, excess_rate: p.excess_rate }));
    if (svc.package_price && svc.package_qty) o.unshift({ id: 'default', price: svc.package_price, qty: svc.package_qty, excess_rate: svc.excess_rate ?? svc.rate });
    return o;
  }, [svc]);
  const patchPk = (p: Partial<Pk>) => setPk((cur) => { if (!cur) return cur; const n = { ...cur, ...p }; if (p.covers !== undefined) { if (!cur.editedPkg) n.descPkg = pkgText(svcOf(cur.code)?.name ?? 'Glass cleaning', n.covers); if (!cur.editedEx) n.descEx = exText(n.covers); } return n; });
  const excess = pk ? Math.max(0, pk.panels - pk.covers) : 0;

  const todays = () => {
    setLines((ls) => ls.map((l) => { const s = svcOf(l.item.service_code); return s && !s.custom_quote && !l.item.negotiated && !l.item.package_qty ? { ...l, item: { ...l.item, rate: s.rate } } : l; }));
    if (pk && pkgOptions[0]) { const o = pkgOptions[0]; patchPk({ price: o.price, covers: o.qty, excess_rate: o.excess_rate, panels: Math.max(pk.panels, o.qty) }); }
  };
  const build = (): QuoteItem[] => {
    const out: QuoteItem[] = [];
    source.items.forEach((orig, i) => {
      if (i === pIdx && pk) {
        out.push({ ...orig, description: pk.descPkg, qty: 1, unit: 'package', rate: pk.price, discount: pk.discount, package_qty: pk.covers });
        if (excess > 0) out.push({ ...(eIdx >= 0 ? source.items[eIdx] : { service_code: pk.code, discount: 0 }), service_code: pk.code, description: pk.descEx, qty: excess, unit: 'panel', rate: pk.excess_rate, discount: eIdx >= 0 ? source.items[eIdx].discount : 0 } as QuoteItem);
      } else if (i === eIdx) { /* rebuilt with the package */ } else { const l = lines.find((x) => x.idx === i); if (l && !l.drop) out.push(l.item); }
    });
    return out;
  };
  const items = build(); const total = docTotals(items, vat.discount, vat.mode, vat.rate).total;
  return (
    <Modal title={`Use previous billing — ${source.label}`} size="xl" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!items.length} onClick={() => onApply({ items, scope: useScope ? scope : undefined, payment_option: source.payment_option, thanks: useThanks ? thanks.trim() : undefined })}>Use these lines · {money(total)}</button></>}>
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="small muted">Change anything before it goes into the quotation.</span>
          <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={todays}>Use today's price list rates</button>
        </div>

        {pk && (
          <div className="card" style={{ padding: 12 }}>
            <b>Glass package</b>
            <div className="form-grid" style={{ marginTop: 8 }}>
              {pkgOptions.length > 0 && <Field label="Package" className="full"><select value={pkgOptions.find((o) => o.price === pk.price && o.qty === pk.covers)?.id ?? ''} onChange={(e) => { const o = pkgOptions.find((x) => x.id === e.target.value); if (o) patchPk({ price: o.price, covers: o.qty, excess_rate: o.excess_rate, panels: Math.max(pk.panels, o.qty) }); }}><option value="">Custom (as typed below)</option>{pkgOptions.map((o) => <option key={o.id} value={o.id}>{money(o.price)} for {o.qty} panels · {money(o.excess_rate)}/panel beyond</option>)}</select></Field>}
              <Field label="Package price (₱)"><input type="number" min="0" value={pk.price} onChange={(e) => patchPk({ price: Number(e.target.value) })} /></Field>
              <Field label="Panels covered by the package"><input type="number" min="1" value={pk.covers} onChange={(e) => { const c = Math.max(1, Number(e.target.value)); patchPk({ covers: c, panels: Math.max(pk.panels, c) }); }} /></Field>
              <Field label="Total panel count" hint={excess ? `${excess} panel${excess === 1 ? '' : 's'} in excess` : 'No excess'}><input type="number" min="1" value={pk.panels} onChange={(e) => patchPk({ panels: Math.max(1, Number(e.target.value)) })} /></Field>
              <Field label="Excess rate (₱ per panel)"><input type="number" min="0" value={pk.excess_rate} onChange={(e) => patchPk({ excess_rate: Number(e.target.value) })} /></Field>
              <Field label="Wording — package line" className="full"><input value={pk.descPkg} onChange={(e) => setPk({ ...pk, descPkg: e.target.value, editedPkg: true })} /></Field>
              {excess > 0 && <Field label="Wording — excess line" className="full"><input value={pk.descEx} onChange={(e) => setPk({ ...pk, descEx: e.target.value, editedEx: true })} /></Field>}
            </div>
          </div>
        )}

        {lines.length > 0 && <div className="small muted" style={{ fontWeight: 600 }}>Other lines</div>}
        {lines.map((l) => (
          <div key={l.idx} className="row" style={{ gap: 6, flexWrap: 'wrap', opacity: l.drop ? 0.45 : 1 }}>
            <input style={{ flex: 1, minWidth: 220 }} aria-label="Wording" value={l.item.description} onChange={(e) => setLine(l.idx, { description: e.target.value })} />
            <input style={{ width: 80 }} type="number" min="0" aria-label="Quantity" value={l.item.qty} onChange={(e) => setLine(l.idx, { qty: Number(e.target.value) })} />
            <input style={{ width: 80 }} aria-label="Unit" value={l.item.unit} onChange={(e) => setLine(l.idx, { unit: e.target.value })} />
            <input style={{ width: 110 }} type="number" min="0" aria-label="Rate" value={l.item.rate} onChange={(e) => setLine(l.idx, { rate: Number(e.target.value) })} />
            <span className="small" style={{ minWidth: 92, textAlign: 'right' }}>{money(l.item.qty * l.item.rate - (l.item.discount || 0))}</span>
            <button type="button" className="btn sm" onClick={() => setLines(lines.map((x) => (x.idx === l.idx ? { ...x, drop: !x.drop } : x)))}>{l.drop ? 'Keep' : 'Leave out'}</button>
          </div>
        ))}

        <div className="form-grid">
          <div className="full"><label className="check"><input type="checkbox" checked={useScope} onChange={(e) => setUseScope(e.target.checked)} /> Also copy the scope of work (only fills it if the new quotation has none)</label>{useScope && <textarea rows={3} style={{ width: '100%', marginTop: 6 }} value={scope} onChange={(e) => setScope(e.target.value)} />}</div>
          {source.thanks && <div className="full"><label className="check"><input type="checkbox" checked={useThanks} onChange={(e) => setUseThanks(e.target.checked)} /> Add a thank-you with the last bill to the introduction</label>{useThanks && <textarea rows={2} style={{ width: '100%', marginTop: 6 }} value={thanks} onChange={(e) => setThanks(e.target.value)} />}</div>}
        </div>
        <div className="row between"><span className="small muted">{items.length} line{items.length === 1 ? '' : 's'}</span><b>New total {money(total)}</b></div>
      </div>
    </Modal>
  );
}
