import { describe, expect, it } from 'vitest';
import { DEMO_PANEL, ago, summarize, type JarvisPanel } from './jarvisview';

describe('jarvis screen figures', () => {
  it('summarises the panel and counts what needs the owner', () => {
    const s = summarize(DEMO_PANEL);
    expect(s.attention).toBe(3);                                   // 1 discount request + 1 handover + 1 job without a leader
    expect(s.decisions[0]).toMatchObject({ label: 'Discount request DR-0031', tone: 'warn' });
    expect(s.jobs.map((j) => j.note)).toEqual(['Confirmed', 'Confirmed', 'No leader']); expect(s.tomorrow).toBe(3);
    expect(s.cash).toMatchObject({ outstanding: 62000, overdue: 38000, overdueCount: 2, today: 18400 });
    expect(s.handovers).toEqual([{ job: 'JOB-0139', client: '', day: '' }]); expect(s.tomorrowJobs.map((j) => j.note)).toEqual(['Confirmed', 'Confirmed', 'No leader']);
    expect(s.pipeline.total).toBe(5); expect(s.pipeline.stages).toEqual([['Inquiry', 4], ['Quotation', 1]]); expect(s.crew.present).toBe(11);
  });
  it('shows empty parts instead of failing when a figure is unavailable', () => {
    const s = summarize({ ...DEMO_PANEL, jobsToday: { unavailable: 'x' }, pending: { unavailable: 'x' }, receivables: null, alerts: undefined } as unknown as JarvisPanel);
    expect(s.jobs).toEqual([]); expect(s.attention).toBe(1);        // only the unsigned handover remains
    expect(s.cash.outstanding).toBe(0); expect(s.alerts).toEqual([]);
  });
  it('says how long ago', () => {
    const now = Date.parse('2026-11-14T08:00:00Z');
    expect(ago('2026-11-14T07:59:40Z', now)).toBe('now'); expect(ago('2026-11-14T07:38:00Z', now)).toBe('22 min ago');
    expect(ago('2026-11-14T03:00:00Z', now)).toBe('5 h ago'); expect(ago('2026-11-12T08:00:00Z', now)).toBe('2 d ago');
  });
});
