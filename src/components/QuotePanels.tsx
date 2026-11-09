// The glass panel count on a quotation: floor / area, side, external and internal panels, with totals. The same rows the crew count on a job.
import { Stepper } from '@/components/touch';
import { panelTotals } from '@/lib/business';
import { PANEL_AREAS, PANEL_SIDES } from '@/lib/workflow';
import { uid } from '@/lib/util';
import type { PanelRow } from '@/lib/types';

export const newPanelRow = (): PanelRow => ({ id: uid(), area: PANEL_AREAS[0], side: PANEL_SIDES[0], external: 0, internal: 0 });

/** "3 floors / areas · 4 sides" from the rows that actually have panels. */
export function panelSummary(rows: PanelRow[]) {
  const used = rows.filter((r) => (r.external || 0) + (r.internal || 0) > 0);
  const floors = new Set(used.map((r) => r.area)); const sides = new Set(used.map((r) => r.side));
  return { floors: floors.size, sides: sides.size, ...panelTotals(rows) };
}

export function QuotePanels({ rows, onChange, readOnly, fromVisit, onUseTotal }: { rows: PanelRow[]; onChange: (r: PanelRow[]) => void; readOnly?: boolean; fromVisit?: { label: string; rows: PanelRow[] }; onUseTotal?: (n: number) => void }) {
  const set = (id: string, p: Partial<PanelRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const s = panelSummary(rows);
  return (
    <div className="stack">
      <div className="small muted">Count the glass panels by floor and side, the same way the crew do on the job. It is printed on the quotation so the client sees exactly what is covered. Up to 2 m × 1 m = 1 panel; larger = 2 panels.</div>
      {rows.length > 0 && (
        <div className="tbl-wrap"><table className="tbl compact">
          <thead><tr><th>Floor / area</th><th>Side</th><th>External</th><th>Internal</th><th>Note</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td><select disabled={readOnly} value={p.area} aria-label="Floor or area" onChange={(e) => set(p.id, { area: e.target.value })}>{[...new Set([...PANEL_AREAS, p.area])].map((a) => <option key={a}>{a}</option>)}</select></td>
              <td><select disabled={readOnly} value={p.side} aria-label="Side" onChange={(e) => set(p.id, { side: e.target.value })}>{[...new Set([...PANEL_SIDES, p.side])].map((a) => <option key={a}>{a}</option>)}</select></td>
              <td><Stepper label={`External panels ${p.area} ${p.side}`} min={0} disabled={readOnly} value={p.external} onChange={(n) => set(p.id, { external: n ?? 0 })} /></td>
              <td><Stepper label={`Internal panels ${p.area} ${p.side}`} min={0} disabled={readOnly} value={p.internal} onChange={(n) => set(p.id, { internal: n ?? 0 })} /></td>
              <td><input disabled={readOnly} maxLength={80} value={p.notes ?? ''} placeholder="optional" aria-label="Note" onChange={(e) => set(p.id, { notes: e.target.value })} /></td>
              <td>{!readOnly && <button type="button" className="btn sm danger" aria-label="Remove row" onClick={() => onChange(rows.filter((x) => x.id !== p.id))}>✕</button>}</td>
            </tr>))}
          </tbody>
          <tfoot><tr><th colSpan={2}>Total</th><th>{s.external}</th><th>{s.internal}</th><th colSpan={2}><b>{s.total} panels</b> · {s.floors} floor{s.floors === 1 ? '' : 's'} / area{s.floors === 1 ? '' : 's'} · {s.sides} side{s.sides === 1 ? '' : 's'}</th></tr></tfoot>
        </table></div>
      )}
      {!readOnly && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => onChange([...rows, { ...newPanelRow(), area: rows.length ? rows[rows.length - 1].area : PANEL_AREAS[0] }])}>+ Add floor / side</button>
          {fromVisit && fromVisit.rows.length > 0 && <button type="button" className="btn sm" onClick={() => onChange(fromVisit.rows.map((r) => ({ ...r, id: uid() })))}>Copy from {fromVisit.label} ({panelTotals(fromVisit.rows).total} panels)</button>}
          {onUseTotal && s.total > 0 && <button type="button" className="btn sm" onClick={() => onUseTotal(s.total)}>Use {s.total} panels as the quantity above</button>}
        </div>
      )}
    </div>
  );
}
