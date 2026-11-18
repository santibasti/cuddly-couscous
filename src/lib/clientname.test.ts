import { describe, expect, it } from 'vitest';
import { clientLabel, sortedClients } from './clientname';

describe('client lists by surname', () => {
  const names = ['Grace Wakamatsu ( Ro Mary Gara )', 'Carol De Leon', 'Joy Cuadrante', 'Ms. Angelica Lim', 'Ms. Krishna Wooster', 'Mr. Gaylord Garcia', 'The Henry Glass House Clark', 'Orocher Store', 'Shirley Uy', 'Carlo Yabyabin (Benny Cheng)', 'Test Client'];
  const list = names.map((name) => ({ name, type: 'Residential' }));
  it('shows a person as "Surname, Given" and leaves businesses as typed', () => {
    expect(clientLabel({ name: 'Ms. Krishna Wooster', type: 'Residential' })).toBe('Wooster, Krishna');
    expect(clientLabel({ name: 'Grace Wakamatsu ( Ro Mary Gara )', type: 'Residential' })).toBe('Wakamatsu, Grace (Ro Mary Gara)');
    expect(clientLabel({ name: 'Orocher Store', type: 'Residential' })).toBe('Orocher Store');
    expect(clientLabel({ name: 'Acme Towers Corp', type: 'Commercial' })).toBe('Acme Towers Corp');
  });
  it('keeps a surname particle with the surname', () => {
    expect(clientLabel({ name: 'Carol De Leon', type: 'Residential' })).toBe('De Leon, Carol');
    expect(clientLabel({ name: 'Juan Dela Cruz', type: 'Residential' })).toBe('Dela Cruz, Juan');
    expect(clientLabel({ name: 'Maria de la Cruz', type: 'Residential' })).toBe('de la Cruz, Maria');
  });
  it('sorts A to Z by surname', () => {
    expect(sortedClients(list).map((c) => clientLabel(c))).toEqual(['Cuadrante, Joy', 'De Leon, Carol', 'Garcia, Gaylord', 'The Henry Glass House Clark', 'Lim, Angelica', 'Orocher Store', 'Test Client', 'Uy, Shirley', 'Wakamatsu, Grace (Ro Mary Gara)', 'Wooster, Krishna', 'Yabyabin, Carlo (Benny Cheng)']);
  });
});
