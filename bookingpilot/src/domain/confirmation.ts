import type { Booking, Guest, MessageTemplate, Organization, Resource } from '@/types';
import { fmtLong, nightsBetween } from './dates';
import { peso } from './money';

export interface ConfirmationDoc {
  subject: string;
  rows: [string, string][];
  paymentInstructions: string;
  checkInInstructions: string;
  cancellationPolicy: string;
  contact: string;
  text: string;
}

export function buildConfirmation(org: Organization, b: Booking, guest: Guest | undefined, resource: Resource | undefined, paid: number): ConfirmationDoc {
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const balance = Math.max(0, b.totalAmount - paid);
  const deposit = b.depositAmount || Math.round(b.totalAmount * (org.depositPercent / 100));
  const depositDue = Math.max(0, deposit - paid);
  const unit = resource && ['vehicle', 'equipment', 'service_crew'].includes(resource.type) ? 'day' : 'night';
  const rows: [string, string][] = [
    ['Booking reference', b.ref],
    ['Guest', guest?.fullName ?? '—'],
    ['Property / resource', resource?.name ?? '—'],
    [unit === 'day' ? 'Start' : 'Check-in', fmtLong(b.checkIn)],
    [unit === 'day' ? 'End' : 'Check-out', fmtLong(b.checkOut)],
    ['Duration', `${nights} ${unit}${nights === 1 ? '' : 's'}`],
    ['Guests', `${b.adults} adult${b.adults === 1 ? '' : 's'}${b.children ? `, ${b.children} child${b.children === 1 ? '' : 'ren'}` : ''}`],
    ['Total amount', peso(b.totalAmount)],
    ['Deposit required', `${peso(deposit)}${paid >= deposit ? ' (received)' : depositDue < deposit ? ` (${peso(depositDue)} still due)` : ''}`],
    ['Balance', `${peso(balance)}${balance ? ' — due on arrival' : ' — fully paid'}`],
  ];
  const contact = `${org.name} · ${org.contactPhone} · ${org.contactEmail}`;
  const text = [
    `${org.name} — Booking Confirmation`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'PAYMENT INSTRUCTIONS',
    org.paymentInstructions,
    '',
    unit === 'day' ? 'PICKUP / SERVICE INSTRUCTIONS' : 'CHECK-IN INSTRUCTIONS',
    org.checkInInstructions,
    '',
    'CANCELLATION POLICY',
    org.cancellationPolicy,
    '',
    'CONTACT',
    contact,
  ].join('\n');
  return { subject: `Booking confirmation ${b.ref} — ${org.name}`, rows, paymentInstructions: org.paymentInstructions, checkInInstructions: org.checkInInstructions, cancellationPolicy: org.cancellationPolicy, contact, text };
}

export function fillTemplate(t: MessageTemplate | string, vars: Record<string, string>) {
  const body = typeof t === 'string' ? t : t.body;
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export function templateVars(org: Organization, guest?: Guest, b?: Booking, resource?: Resource, paid = 0): Record<string, string> {
  const nights = b ? nightsBetween(b.checkIn, b.checkOut) : 0;
  return {
    guest: guest?.fullName.split(' ')[0] ?? 'there', business: org.name, phone: org.contactPhone,
    property: resource?.name ?? 'the property', ref: b?.ref ?? '—',
    checkIn: b ? fmtLong(b.checkIn) : '[check-in date]', checkOut: b ? fmtLong(b.checkOut) : '[check-out date]', nights: String(nights || '[nights]'),
    total: b ? peso(b.totalAmount) : '[total]', deposit: b ? peso(Math.max(0, (b.depositAmount || b.totalAmount * (org.depositPercent / 100)) - paid)) : '[deposit]',
    balance: b ? peso(Math.max(0, b.totalAmount - paid)) : '[balance]',
  };
}
