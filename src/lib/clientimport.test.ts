import { describe, expect, it } from 'vitest';
import { parseDate, parsePhone, planImport } from './clientimport';

const ROWS = [
  '24 Sept 2024\tTantan Reyes\t2 Milano St. Vista Real Classica Subd. Batasan Hills QC\tQuezon\t9175608409\t7,599.00',
  '1 Oct 2024\tEsther DY\tMarikina City\tMarikina\t\t1,500.00',
  '12 Oct 2024\tTantan Reyes\t2 Milano St. Vista Real Classica Subd. Batasan Hills QC\tQuezon\t9175608409\t4,799.00',
  '14 Oct 2024\tPedro Mausoleum Project\tLots 186 & 187 Almaciaga Plaza Manila Memorial Park Dasmarinas Cavite\tCavite\t\t23,940.00',
  '11 Oct 2024\tRamon Rubio\t27 Cauliflower St. Valle Verde 5 Pasig City\tPasig\t91781741710\t8,500.00',
  '30 Oct 2024\tTeresita Lim \t14 Arthur St. North Greenhills San Juan\tSan Juan \t9567418000\t10,454.00',
].join('\n');

describe('client import', () => {
  it('reads dates, amounts and mobile numbers the way they are written', () => {
    expect(parseDate('24 Sept 2024')).toBe('2024-09-24'); expect(parseDate('1 Oct 2024')).toBe('2024-10-01'); expect(parseDate('31 Nov 2024')).toBeNull(); expect(parseDate('soon')).toBeNull();
    expect(parsePhone('9175608409').phone).toBe('09175608409'); expect(parsePhone('09175608409').phone).toBe('09175608409'); expect(parsePhone('').phone).toBe('');
    expect(parsePhone('91781741710').warn).toMatch(/check it/);
  });
  it('makes one client per person with a bill per line, and merges a repeat customer', () => {
    const p = planImport({ clients: [] }, ROWS);
    expect(p.bad).toHaveLength(0); expect(p.clients).toHaveLength(5); expect(p.newBills).toBe(6);
    const tan = p.clients.find((c) => c.name === 'Tantan Reyes')!;
    expect(tan.bills.map((b) => b.amount)).toEqual([7599, 4799]); expect(tan.phone).toBe('09175608409');
    expect(p.clients.find((c) => c.name === 'Pedro Mausoleum Project')!.type).toBe('Commercial');
    expect(p.clients.find((c) => c.name === 'Esther DY')!.phone).toBe('');
    expect(p.clients.find((c) => c.name === 'Teresita Lim')!.bills[0].amount).toBe(10454);
    expect(p.clients.find((c) => c.name === 'Ramon Rubio')!.warnings).toHaveLength(1);
  });
  it('matches clients already in the system and never adds the same bill twice', () => {
    const existing = { id: 'c1', name: 'tantan reyes', mobile: '0917 560 8409', past_bills: [{ id: 'b', date: '2024-09-24', ref: '', total: 7599, items: [], notes: '' }] } as never;
    const p = planImport({ clients: [existing] }, ROWS);
    const tan = p.clients.find((c) => c.key === 'tantan reyes')!;
    expect(tan.existing).toBeTruthy(); expect(tan.skipped).toBe(1); expect(tan.bills).toHaveLength(1); expect(p.newClients).toBe(4);
  });
  it('reports lines it cannot read instead of guessing', () => {
    const p = planImport({ clients: [] }, 'not a row\n24 Foo 2024\tA\tB\tC\t9\t5\n24 Sept 2024\tA\tB\tC\t9\tabc');
    expect(p.bad).toHaveLength(3); expect(p.clients).toHaveLength(0);
  });
});
