import { useMemo, useState, type ReactNode } from 'react';
import { cls } from '@/lib/util';
import { exportCsv, exportPdf, exportXlsx, type ColType, type ExportTable } from '@/lib/export';
import { Empty, Icon, attempt } from './ui';

export interface Col<T> {
  key: string;
  header: string;
  /** Plain value used for search, sort and export. */
  value?: (r: T) => string | number;
  render?: (r: T) => ReactNode;
  type?: ColType;
  num?: boolean;
  noExport?: boolean;
  sortable?: boolean;
}

interface Props<T> {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  filters?: ReactNode;
  actions?: ReactNode;
  exportTitle?: string;
  pageSize?: number;
  empty?: ReactNode;
  totals?: (string | number)[];
  search?: boolean;
  searchText?: (r: T) => string;
  initialSort?: { key: string; dir: 1 | -1 };
}

export function DataTable<T>({ rows, cols, rowKey, onRow, filters, actions, exportTitle, pageSize = 12, empty, totals, search = true, searchText, initialSort }: Props<T>) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null);

  const val = (c: Col<T>, r: T): string | number => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number) ?? '');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = s ? rows.filter((r) => (searchText ? searchText(r) : cols.map((c) => String(val(c, r))).join(' ')).toLowerCase().includes(s)) : rows;
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      if (c) out = [...out].sort((a, b) => { const x = val(c, a), y = val(c, b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * size, cur * size + size);

  const table = (): ExportTable => {
    const ec = cols.filter((c) => !c.noExport);
    return { title: exportTitle ?? 'Export', subtitle: q ? `Filter: “${q}”` : undefined, headers: ec.map((c) => c.header), types: ec.map((c) => c.type ?? (c.num ? 'num' : 'text')), rows: filtered.map((r) => ec.map((c) => val(c, r))), totals };
  };

  return (
    <div>
      <div className="toolbar no-print">
        {search && (
          <div className="rel grow" style={{ maxWidth: 300, minWidth: 160 }}>
            <input className="search" type="search" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search" />
          </div>
        )}
        {filters}
        <span className="grow" />
        {actions}
        {exportTitle && (
          <>
            <button className="btn sm" onClick={() => attempt(() => exportXlsx(table()))} title="Download Excel"><Icon name="download" />Excel</button>
            <button className="btn sm" onClick={() => attempt(() => exportPdf(table()))} title="Download PDF"><Icon name="download" />PDF</button>
            <button className="btn sm" onClick={() => attempt(() => exportCsv(table()))} title="Download CSV">CSV</button>
          </>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl stack-m">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={cls(c.num && 'num', c.sortable !== false && 'sortable')} onClick={() => c.sortable !== false && setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                  {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={rowKey(r)} className={onRow ? 'click' : ''} onClick={() => onRow?.(r)}>
                {cols.map((c, i) => (
                  <td key={c.key} data-label={c.header} className={cls(c.num && 'num', i === 0 && 'first', c.key === 'actions' && 'actions')}>{c.render ? c.render(r) : String(val(c, r))}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && filtered.length > 0 && (
            <tfoot><tr>{totals.map((t, i) => <td key={i} className={cols[i]?.num ? 'num' : ''}>{t}</td>)}</tr></tfoot>
          )}
        </table>
        {!filtered.length && <Empty>{empty ?? 'No records match.'}</Empty>}
      </div>
      <div className="pager no-print">
        <span>{filtered.length ? `${cur * size + 1}–${Math.min(filtered.length, cur * size + size)} of ${filtered.length}` : '0 records'}</span>
        <span className="row">
          <select value={size} onChange={(e) => { setSize(+e.target.value); setPage(0); }} style={{ width: 'auto' }} aria-label="Rows per page">{[10, 12, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
          <button className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><Icon name="chevL" /></button>
          <span>{cur + 1} / {pages}</span>
          <button className="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><Icon name="chevR" /></button>
        </span>
      </div>
    </div>
  );
}
