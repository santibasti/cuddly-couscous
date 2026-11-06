import { describe, expect, it } from 'vitest';
import { clientMessage, first, teamText, window } from '../../supabase/functions/send-client-reminders/message';

const base = { date: '2026-11-07', time: '08:00', etaTo: '08:30', site: 'Ms. Pamela Astudillo Residence', leader: 'Nikko Ballado', crew: ['Leo R. Mercado', 'Adrian Padilla', 'Karl Lim'], vehicle: 'Service Van 2 (Hiace)', phone: '+63 917 000 0000' };

describe('client reminder text', () => {
  it('formats the arrival window and first names', () => {
    expect(window('08:00', '08:30')).toBe('8:00-8:30 AM'); expect(window('11:45', '12:15')).toBe('11:45 AM-12:15 PM'); expect(window('08:00')).toBe('8:00 AM');
    expect(first('Mr. Regulus Casareo')).toBe('Regulus'); expect(first('Kevin L. Dizon')).toBe('Kevin');
    expect(teamText('Nikko Ballado', ['A B', 'C D', 'E F', 'G H', 'I J'], 3)).toBe('Nikko (leader), A, C +3');
  });
  it('day before: day, ETA, team, vehicle and a clear do-not-reply line, within two SMS', () => {
    const m = clientMessage({ ...base, kind: 'day_before' });
    expect(m).toContain('tomorrow, Sat, Nov 7'); expect(m).toContain('ETA 8:00-8:30 AM'); expect(m).toContain('Team: Nikko (leader), Leo, Adrian, Karl'); expect(m).toContain('Vehicle: Service Van 2 (Hiace)');
    expect(m).toMatch(/do not reply here/i); expect(m).toContain('Call +63 917 000 0000'); expect(m.length).toBeLessThanOrEqual(306); expect(m).not.toMatch(/https?:/);
  });
  it('morning of the service', () => {
    const m = clientMessage({ ...base, kind: 'morning' });
    expect(m).toContain('good morning'); expect(m).toContain('coming today'); expect(m).toContain('ETA 8:00-8:30 AM'); expect(m).toMatch(/do not reply here/i);
  });
  it('shortens a long team and site instead of running past two SMS, and works with no team or vehicle', () => {
    const big = clientMessage({ ...base, kind: 'day_before', site: 'A very long site name that goes on and on at Sunrise Village Subdivision Phase 2', crew: Array.from({ length: 12 }, (_, i) => `Crewmember${i} Surname`) });
    expect(big.length).toBeLessThanOrEqual(306); expect(big).toMatch(/do not reply here/i); expect(big).toContain('ETA');
    const bare = clientMessage({ kind: 'morning', date: '2026-11-07', time: '07:30' });
    expect(bare).toContain('ETA 7:30 AM'); expect(bare).not.toContain('Team:'); expect(bare).not.toContain('Vehicle:'); expect(bare.length).toBeLessThanOrEqual(306);
  });
  it('uses plain SMS characters only', () => { expect(clientMessage({ ...base, kind: 'morning', site: 'Café “Señor” — ₱' })).toMatch(/^[\x20-\x7E\n]+$/); });
});
