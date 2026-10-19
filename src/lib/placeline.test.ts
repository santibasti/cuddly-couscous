import { describe, expect, it } from 'vitest';
import { placeLine } from './util';

describe('placeLine', () => {
  it('gives the subdivision before the city, plus the city', () => {
    expect(placeLine('12 Acacia St, Ayala Alabang, Muntinlupa City, Metro Manila', 'Muntinlupa', 'Metro Manila')).toBe('Ayala Alabang, Muntinlupa');
    expect(placeLine('Blk 5 Lot 3, Greenfields, Santa Rosa, Laguna', 'Santa Rosa', 'Laguna')).toBe('Greenfields, Santa Rosa');
  });
  it('works without a stored city and without a subdivision', () => {
    expect(placeLine('Forbes Park, Makati City, Philippines')).toBe('Forbes Park, Makati City');
    expect(placeLine('Quezon City, Metro Manila', 'Quezon City')).toBe('Quezon City');
    expect(placeLine('')).toBe('');
  });
});
