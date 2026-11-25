import { describe, expect, it } from 'vitest';
import { NOT_TEXTED, SMS_KINDS, shouldText } from '../../supabase/functions/send-alerts/policy';

describe('which owner alerts are texted (SMS)', () => {
  it('texts only an approved quotation, a discount request and an automatic booking (and the Admin test button)', () => {
    expect(shouldText('quotation')).toBe(true);    // "Quotation approved" (client signed or approved)
    expect(shouldText('discount')).toBe(true);     // "Discount requested" (waits for the owner's approval)
    expect(shouldText('booking')).toBe(true);      // "Booked automatically" (chat-book)
    expect(shouldText('test')).toBe(true);         // Admin "send a test SMS"
    expect([...SMS_KINDS].sort()).toEqual(['booking', 'discount', 'quotation', 'test']);
  });
  it('does not text any other alert kind that exists in the system', () => {
    // every kind the database triggers and the Edge Functions write today: chat (needs a person, reply waits, photo, errors, client match), lead (new lead, chat booking needs a person, job order not sent), conforme, variation, discount, message, info, start, done
    for (const k of ['chat', 'lead', 'conforme', 'variation', 'message', 'info', 'start', 'done', '', 'Quotation', 'booking ']) expect(shouldText(k), k).toBe(false);
    expect(shouldText(undefined)).toBe(false); expect(shouldText(null)).toBe(false);
  });
  it('the skip note says why', () => { expect(NOT_TEXTED).toMatch(/only approved quotations, discount requests and automatic bookings/); });
});
