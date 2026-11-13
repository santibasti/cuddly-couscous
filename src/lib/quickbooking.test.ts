import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let Q: typeof import('./quickbooking');
beforeAll(async () => { store = (await import('./store')).store; Q = await import('./quickbooking'); });

const MSG = `Name: Maria Santos
Address: 12 Sampaguita St, BF Homes, Parañaque City, Metro Manila
Contact Number: 0917 123 4567
Email: maria@example.com
No. of House Storey: 2
Reservation Date: December 5, 2099 9AM
Service Type: Glass & Window Cleaning
Home or Residential: Home`;

describe('quick booking: reading the pasted message', () => {
  it('reads every field', () => {
    const b = Q.parseBooking(MSG);
    expect(b).toMatchObject({ name: 'Maria Santos', mobile: '0917 123 4567', email: 'maria@example.com', storeys: '2', date: '2099-12-05', time: '09:00', home: 'Home' });
    expect(b.address).toContain('Parañaque');
  });
  it('understands other date styles and a missing time', () => {
    expect(Q.parseWhen('20 Nov 2099')).toEqual({ date: '2099-11-20', time: '08:00' });
    expect(Q.parseWhen('11/20/2099 3:30 pm')).toEqual({ date: '2099-11-20', time: '15:30' });
    expect(Q.parseWhen('2099-01-02')).toMatchObject({ date: '2099-01-02' }); expect(Q.parseWhen('soon')).toBeNull();
  });
  it('finds the city rate, never mistaking Metro Manila for Manila', () => {
    expect(Q.findRate('Brgy 1, Parañaque City, Metro Manila')).toMatchObject({ place: 'Parañaque', price: 5799, panels: 41 });
    expect(Q.findRate('Quezon City, Metro Manila')).toMatchObject({ place: 'Quezon City', price: 4799, panels: 31 });
    expect(Q.findRate('Sampaloc, Manila')).toMatchObject({ place: 'Manila' });
    expect(Q.findRate('Imus, Cavite')).toMatchObject({ place: 'Imus', price: 5799 });
    expect(Q.findRate('Cavite City')).toMatchObject({ place: 'Cavite City' });
    expect(Q.findRate('General Trias, Cavite')).toMatchObject({ price: 6799 });
    expect(Q.findRate('Santa Rosa, Laguna')).toMatchObject({ place: 'Laguna', price: 12799, panels: 51 });
    expect(Q.findRate('Montalban, Rizal')).toMatchObject({ place: 'Rodriguez (Montalban)' });
    expect(Q.findRate('Somewhere in Cebu')).toBeUndefined();
  });
});

describe('quick booking: client, approved quotation and booked job', () => {
  it('creates all three, with the package price and no team yet, and reuses the client next time', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const r = Q.quickBook(Q.parseBooking(MSG));
    expect(r.newClient).toBe(true); expect(r.client).toMatchObject({ name: 'Maria Santos', type: 'Residential' });
    expect(r.quote.status).toBe('Approved'); expect(r.quote.items[0]).toMatchObject({ rate: 5799, package_qty: 41, qty: 1 });
    expect(r.job).toMatchObject({ status: 'Confirmed', quotation_id: r.quote.id, client_id: r.client.id, start_at: '2099-12-05T09:00', contract_amount: 5799 });
    expect(r.job.crew_ids).toEqual([]); expect(r.job.vehicle_id).toBeUndefined();
    const again = Q.quickBook({ ...Q.parseBooking(MSG), date: '2099-12-06' });
    expect(again.newClient).toBe(false); expect(again.client.id).toBe(r.client.id);
  });
  it('prices another service at its minimum and refuses an unknown city', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const b = { ...Q.parseBooking(MSG), service: 'Roof Cleaning', name: 'Jose Roof', mobile: '0999 000 1111' };
    expect(Q.quickBook(b).quote.items[0]).toMatchObject({ qty: 100, rate: 145 });
    expect(() => Q.quickBook({ ...Q.parseBooking(MSG), address: 'Somewhere in Cebu', name: 'Nope', mobile: '0999 000 2222' })).toThrow(/city/i);
  });
});
