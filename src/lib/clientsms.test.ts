import { describe, expect, it } from 'vitest';
import { callName, clientMessage, first, honorific, teamText, window } from '../../supabase/functions/send-client-reminders/message';

const base = { date: '2026-11-07', time: '08:00', etaTo: '08:30', to: 'Mr. Regulus Casareo', leader: 'Nikko Ballado', crew: ['Leo R. Mercado', 'Adrian Padilla', 'Karl Lim'], vehicle: 'Service Van 2' };

describe('addressing the client', () => {
  it('uses Sir or Mam from a title or the saved choice, never from a guessed first name', () => {
    expect(honorific('Mr. Regulus Casareo')).toBe('Sir'); expect(honorific('Ms. Pamela Astudillo')).toBe('Mam'); expect(honorific('Mrs. Maria Cruz')).toBe('Mam'); expect(honorific('Sir Juan')).toBe('Sir');
    expect(honorific('Tantan Reyes')).toBeNull(); expect(honorific('Angel Labrador')).toBeNull(); expect(honorific('Engr. Luis Tolentino')).toBeNull();
    expect(honorific('Tantan Reyes', 'Mam')).toBe('Mam'); expect(honorific('Mr. Regulus Casareo', 'Mam')).toBe('Mam');
    expect(callName('Mr. Regulus Casareo')).toBe('Sir Regulus'); expect(callName('Tantan Reyes')).toBe('Tantan'); expect(callName('Tantan Reyes', 'Sir')).toBe('Sir Tantan');
    expect(callName('Casa Natalia Project')).toBe(''); expect(callName('PFL Dining Corporation')).toBe(''); expect(callName('')).toBe(''); expect(callName(undefined)).toBe('');
    expect(first('Engr. Luis Tolentino')).toBe('Luis');
  });
});

describe('client reminder text', () => {
  it('formats the arrival window and the team', () => {
    expect(window('08:00', '08:30')).toBe('8:00-8:30 AM'); expect(window('11:45', '12:15')).toBe('11:45 AM-12:15 PM'); expect(window('08:00')).toBe('8:00 AM');
    expect(teamText('Nikko Ballado', ['A B', 'C D', 'E F', 'G H', 'I J'], 3)).toBe('Nikko (leader), A, C +3');
  });
  it('day before: greets by name, gives the day, ETA, team and vehicle, says not to reply, and points to Messenger', () => {
    const m = clientMessage({ ...base, kind: 'day_before' });
    expect(m).toMatch(/^Good day, Sir Regulus!/); expect(m).toContain('tomorrow, Sat, Nov 7'); expect(m).toContain('ETA 8:00-8:30 AM'); expect(m).toContain('Team: Nikko (leader), Leo, Adrian, Karl'); expect(m).toContain('Vehicle: Service Van 2');
    expect(m).toMatch(/do not reply here/i); expect(m).toContain('Facebook Messenger'); expect(m).toContain('Thank you!'); expect(m.length).toBeLessThanOrEqual(306); expect(m).not.toMatch(/https?:|\.com|www/);
  });
  it('morning of the service', () => {
    const m = clientMessage({ ...base, kind: 'morning', to: 'Ms. Pamela Astudillo' });
    expect(m).toMatch(/^Good morning, Mam Pamela!/); expect(m).toContain('will arrive today'); expect(m).toContain('ETA 8:00-8:30 AM'); expect(m).toMatch(/do not reply here/i); expect(m).toContain('Facebook Messenger');
  });
  it('greets a company or an unknown name without a made-up title', () => {
    expect(clientMessage({ ...base, kind: 'day_before', to: 'Casa Natalia Project' })).toMatch(/^Good day! TopMop/); expect(clientMessage({ ...base, kind: 'morning', to: undefined })).toMatch(/^Good morning! TopMop/);
    expect(clientMessage({ ...base, kind: 'day_before', to: 'Tantan Reyes' })).toMatch(/^Good day, Tantan!/);
  });
  it('shortens a long team instead of running past two SMS, and works with no team or vehicle', () => {
    const big = clientMessage({ ...base, kind: 'day_before', crew: Array.from({ length: 12 }, (_, i) => `Crewmember${i} Surname`) });
    expect(big.length).toBeLessThanOrEqual(306); expect(big).toMatch(/do not reply here/i); expect(big).toContain('ETA'); expect(big).toContain('Facebook Messenger');
    const bare = clientMessage({ kind: 'morning', date: '2026-11-07', time: '07:30' });
    expect(bare).toContain('ETA 7:30 AM'); expect(bare).not.toContain('Team:'); expect(bare).not.toContain('Vehicle:'); expect(bare.length).toBeLessThanOrEqual(306);
  });
  it('uses plain SMS characters only', () => { expect(clientMessage({ ...base, kind: 'morning', to: 'Ms. Señorita Café', vehicle: 'Van “Ñ” — ₱' })).toMatch(/^[\x20-\x7E\n]+$/); });
});
