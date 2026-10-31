import { SERVICES } from './logic';
import type { Data, Estimate, EstimateLine, ServiceType } from './types';

export const VAT_RATE = 0.12;

export const lineTotal = (l: EstimateLine) => (Number.isFinite(l.qty * l.unit) ? l.qty * l.unit : 0);
const sum = (ls: EstimateLine[]) => ls.reduce((s, l) => s + lineTotal(l), 0);

export interface EstimateTotals {
  labor: number;
  parts: number;
  materials: number;
  outside: number;
  /** What the job is expected to cost the shop. */
  cost: number;
  markup: number;
  discount: number;
  /** Price before VAT. */
  net: number;
  vat: number;
  total: number;
  /** Profit as a share of the price before VAT. */
  marginPct: number;
}

/** Cost, markup, discount and VAT, in that order. The discount cannot take the price below zero. */
export function estimateTotals(e: Estimate): EstimateTotals {
  const labor = sum(e.labor), parts = sum(e.parts), materials = sum(e.materials), outside = sum(e.outside);
  const cost = labor + parts + materials + outside;
  const markup = (cost * Math.max(0, e.markupPct)) / 100;
  const net = Math.max(0, cost + markup - Math.max(0, e.discount));
  const vat = e.vat ? net * VAT_RATE : 0;
  return { labor, parts, materials, outside, cost, markup, discount: Math.max(0, e.discount), net, vat, total: net + vat, marginPct: net > 0 ? Math.round(((net - cost) / net) * 100) : 0 };
}

/** Share of the price to ask for up front. */
export const depositShare = (service: ServiceType, newClient: boolean) => Math.max(SERVICES[service].pricing === 'package' ? 0.5 : 0.3, newClient ? 0.5 : 0);

/** A starting point for a service: one labour line at the team's average rate for the usual hours, and a markup. */
export function defaultEstimate(service: ServiceType, d: Data, today: string): Estimate {
  const team = d.mechanics.filter((m) => m.active);
  const rate = team.length ? Math.round(team.reduce((s, m) => s + m.hourlyRate, 0) / team.length) : 500;
  const hours = Math.max(2, SERVICES[service].typicalDays * (service === 'restoration' ? 3 : 4));
  return { labor: [{ label: 'Labour', qty: hours, unit: rate }], parts: [], materials: [], outside: [], markupPct: 30, discount: 0, vat: false, createdOn: today };
}
