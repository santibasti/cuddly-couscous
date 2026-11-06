import { describe, expect, it } from 'vitest';
import { decide, jobsFor, parseCaption, type TgJob } from '../../supabase/functions/telegram-webhook/logic';

const NOW = Date.parse('2026-11-06T02:00:00Z');   // 10:00 Manila
const job = (id: string, start: string, o: Partial<TgJob> = {}): TgJob => ({ id, number: `JOB-${id}`, client_id: 'c' + id, start_at: start, end_at: start, status: 'Confirmed', leader_id: 'e1', crew_ids: ['e2'], ...o });

describe('telegram photo routing', () => {
  it('reads job number, kind and text from a caption', () => {
    expect(parseCaption('job-2026-0012 BEFORE glass level 3')).toEqual({ jobNumber: 'JOB-2026-0012', kind: 'Before', caption: 'BEFORE glass level 3' });
    expect(parseCaption(undefined)).toEqual({ jobNumber: undefined, kind: 'Other', caption: '' });
  });
  it("finds only the sender's jobs today", () => {
    const js = [job('1', '2026-11-06T08:00'), job('2', '2026-11-06T13:00', { leader_id: 'e9', crew_ids: [] }), job('3', '2026-11-07T08:00'), job('4', '2026-11-06T09:00', { status: 'Cancelled' })];
    expect(jobsFor(js, 'e2', NOW).map((j) => j.id)).toEqual(['1']);
    expect(jobsFor(js, 'e1', NOW).map((j) => j.id)).toEqual(['1']);
  });
  it('uses yesterday only for a job still in progress', () => {
    expect(jobsFor([job('5', '2026-11-05T08:00', { status: 'In Progress' })], 'e1', NOW)).toHaveLength(1);
    expect(jobsFor([job('5', '2026-11-05T08:00', { status: 'Completed' })], 'e1', NOW)).toHaveLength(0);
  });
  it('decides: caption > context > the one job today > ask > unsorted', () => {
    const a = job('1', '2026-11-06T08:00'), b = job('2', '2026-11-06T09:00');
    expect(decide({ captionJob: b, contextJob: a, today: [a] })).toMatchObject({ kind: 'job', via: 'caption' });
    expect(decide({ contextJob: a, today: [a, b] })).toMatchObject({ kind: 'job', via: 'context' });
    expect(decide({ today: [a] })).toMatchObject({ kind: 'job', via: 'today' });
    expect(decide({ today: [a, b] })).toMatchObject({ kind: 'ask' });
    expect(decide({ today: [] })).toMatchObject({ kind: 'unsorted' });
    expect(decide({ captionNumber: 'JOB-X', today: [a] })).toMatchObject({ kind: 'unsorted' });
  });
});
