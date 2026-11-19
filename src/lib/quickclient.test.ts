import { describe, expect, it } from 'vitest';
import { normMobile, parseQuickClient, quickNotes } from './quickclient';

describe('quick add client', () => {
  it('reads the filled-in booking form', () => {
    const q = parseQuickClient(`Please copy this and fill in your details po:
Name: Maria Santos
Address: 12 Maple St, Quezon City
Contact Number: 0917 123 4567
Email: maria@example.com
No. of House Storey: 2
Reservation Date: Saturday, Nov 21
Service Window, Wall, Roof, Solar, Floor?: Window`);
    expect(q).toEqual({ name: 'Maria Santos', address: '12 Maple St, Quezon City', mobile: '09171234567', email: 'maria@example.com', storeys: '2', date: 'Saturday, Nov 21', service: 'Window' });
  });
  it('leaves an unfilled service line empty and accepts the old form labels', () => {
    const q = parseQuickClient('Full name: Jig Narciso\nMobile number: +63 917 000 1111\nComplete service address (with city): Alabang, Muntinlupa\nReservation Date:\nType of Service (Window, Solar, Wall/floor or Roof): Solar');
    expect(q).toMatchObject({ name: 'Jig Narciso', mobile: '09170001111', address: 'Alabang, Muntinlupa', date: '', service: 'Solar' });
    expect(parseQuickClient('Service Window, Wall, Roof, Solar, Floor?').service).toBe('');
  });
  it('takes a value from the next line and an address over two lines', () => {
    const q = parseQuickClient('Name:\nAnna Reyes\nAddress: Blk 4 Lot 5\nBF Homes, Parañaque\nContact Number: 09981112222');
    expect(q).toMatchObject({ name: 'Anna Reyes', address: 'Blk 4 Lot 5, BF Homes, Parañaque', mobile: '09981112222' });
  });
  it('picks a mobile number and an email out of free text', () => {
    const q = parseQuickClient('hi po, ako si Ben. text nyo ako 0917-555-1212 or ben@mail.com');
    expect(q).toMatchObject({ mobile: '09175551212', email: 'ben@mail.com', name: '' });
  });
  it('normalises mobiles and writes notes', () => {
    expect(normMobile('639171234567')).toBe('09171234567'); expect(normMobile('9171234567')).toBe('09171234567'); expect(normMobile('(02) 8123 4567')).toBe('(02) 8123 4567');
    expect(quickNotes(parseQuickClient('Name: A\nNo. of House Storey: 3\nService: Roof'))).toBe('Service wanted: Roof\nStoreys: 3\nAdded from a chat with Quick add.');
    expect(parseQuickClient('').name).toBe('');
  });
});
