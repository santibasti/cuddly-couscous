import { describe, expect, it } from 'vitest';
import { visibleTo, type Announcement } from './announcements';

const base: Announcement = { id: 'a', created_at: '2026-10-20T01:00:00Z', kind: 'Award', title: 'Employee of the Month', body: '', awardee_ids: [], audience: 'all', audience_ids: [], pinned: false, status: 'Published' };
const NOW = '2026-10-20T05:00:00.000Z'; const DAY = '2026-10-20';
describe('who sees an announcement', () => {
  it('everyone sees an "all" announcement, only when published, on time and not expired', () => {
    expect(visibleTo(base, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(true);
    expect(visibleTo({ ...base, status: 'Draft' }, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(false);
    expect(visibleTo({ ...base, status: 'Archived' }, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(false);
    expect(visibleTo({ ...base, publish_at: '2026-10-21T00:00:00.000Z' }, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(false);   // scheduled for later
    expect(visibleTo({ ...base, expires_on: '2026-10-19' }, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(false);                   // expired
    expect(visibleTo({ ...base, expires_on: '2026-10-20' }, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(true);                    // still shows on its last day
    expect(visibleTo({ ...base, deleted_at: NOW }, { role: 'field', employeeId: 'e1' }, NOW, DAY)).toBe(false);
  });
  it('leaders-only and selected-people announcements reach only those people; awardees always see theirs', () => {
    const leaders = { ...base, audience: 'leaders' as const };
    expect(visibleTo(leaders, { role: 'leader', employeeId: 'e1' }, NOW, DAY)).toBe(true);
    expect(visibleTo(leaders, { role: 'field', employeeId: 'e2' }, NOW, DAY)).toBe(false);
    const some = { ...base, audience: 'people' as const, audience_ids: ['e3'] };
    expect(visibleTo(some, { role: 'field', employeeId: 'e3' }, NOW, DAY)).toBe(true);
    expect(visibleTo(some, { role: 'field', employeeId: 'e4' }, NOW, DAY)).toBe(false);
    expect(visibleTo({ ...some, awardee_ids: ['e4'] }, { role: 'field', employeeId: 'e4' }, NOW, DAY)).toBe(true);
    expect(visibleTo(some, { role: 'field', employeeId: null }, NOW, DAY)).toBe(false);
  });
});
