import { describe, expect, it } from 'vitest';
import { panelSummary } from '../components/QuotePanels';
import type { PanelRow } from './types';

const r = (area: string, side: string, external: number, internal: number): PanelRow => ({ id: area + side, area, side, external, internal });
describe('quotation panel count summary', () => {
  it('counts panels, floors and sides, ignoring empty rows', () => {
    const s = panelSummary([r('1st Floor', 'Front', 10, 2), r('1st Floor', 'Rear', 8, 0), r('2nd Floor', 'Front', 12, 4), r('3rd Floor', 'Left Side', 0, 0)]);
    expect(s).toMatchObject({ external: 30, internal: 6, total: 36, floors: 2, sides: 2 });
  });
  it('is zero for no rows', () => { expect(panelSummary([])).toMatchObject({ total: 0, floors: 0, sides: 0 }); });
});
