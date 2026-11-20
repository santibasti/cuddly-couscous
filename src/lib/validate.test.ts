import { describe, expect, it } from 'vitest';
import { emptyContext, foldMessages } from '../../supabase/functions/_shared/chatcontext';
import { ackReply, fallbackReply, repairReply, validateReply } from '../../supabase/functions/_shared/validate';

const ctx = foldMessages(emptyContext(), ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']);
const v = (customerText: string, c = ctx, intent = c.intent, previousAi: string[] = []) => ({ ctx: c, intent, customerText, previousAi });
describe('reply validation', () => {
  it('lets a short, relevant answer through', () => { expect(validateReply('Exterior wall cleaning in Manila is ₱125 per sqm with a 50 sqm minimum po.', v('How much?'))).toEqual([]); });
  it('flags Tagalog, length, two questions', () => {
    expect(validateReply('Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo at saan po ang location?', v('hi'))[0]).toMatch(/language/);
    expect(validateReply('It is ₱4,799. It covers 31 panels. Extra panels are ₱140 each. Many customers also like it.', v('How much?')).join()).toMatch(/length/);
    expect(validateReply('Is it exterior? And is it ground floor?', v('hi')).join()).toMatch(/one_question/);
  });
  it('flags asking again for a known fact (Scenario B) and repeating the last question', () => {
    expect(validateReply('May I know your location po?', v('How much?')).join()).toMatch(/repeated_question: .*location/); expect(validateReply('Is it exterior or interior po?', v('How much?')).join()).toMatch(/surface/);
    expect(validateReply('Which one do you prefer po?', v('ok', emptyContext(), 'general_inquiry', ['Which one do you prefer po?'])).join()).toMatch(/same question/);
  });
  it('flags other services, measurement talk nobody asked for, premature booking, photos, quantities', () => {
    expect(validateReply('We also do roof and solar panel cleaning po.', v('How much?')).join()).toMatch(/unrelated_services: .*roof, solar/);
    expect(validateReply('It is ₱6,250. Our team will conduct on-site glass and solar panel counting and wall and floor area measurement.', v('How much?')).join()).toMatch(/measurement/);
    expect(validateReply('Price is ₱6,250. Would you like to book a date po?', v('How much?')).join()).toMatch(/premature_booking/);
    expect(validateReply('Could you send photos of the wall po?', v('hi')).join()).toMatch(/photos/); expect(validateReply('How many square metres is the wall po?', v('hi')).join()).toMatch(/quantities/);
  });
  it('allows what is asked for: booking after a booking request, counting when the customer asks, fixed texts', () => {
    const b = foldMessages(ctx, ['Can I schedule tomorrow?']); expect(validateReply('Tomorrow is open po. What time suits you?', v('Can I schedule tomorrow?', b)).join()).not.toMatch(/premature/);
    expect(validateReply('The team counts the panels on site and confirms the final count before work starts po.', v('How do you count the panels?')).join()).not.toMatch(/measurement/);
    expect(validateReply("For residential services, we don't do a preliminary ocular visit to keep costs down for you.\nInstead, our team will do an exact panel count when they arrive on-site. They will inform you of the final count and the total bill before they begin any work.", v('Do you do ocular?'))).toEqual([]);
  });
  it('repairs by removing the bad sentences', () => {
    const bad = 'Exterior wall cleaning in Manila is ₱125 per sqm. Our team will conduct on-site glass and solar panel counting and wall and floor area measurement. Would you like to book a date po?';
    const viol = validateReply(bad, v('How much?')); expect(viol.length).toBeGreaterThan(1);
    const fixed = repairReply(bad, viol, v('How much?')); expect(fixed).toBe('Exterior wall cleaning in Manila is ₱125 per sqm.'); expect(validateReply(fixed, v('How much?'))).toEqual([]);
    expect(repairReply('Is it exterior? Is it ground floor?', ['one_question'], v('hi'))).toBe('Is it exterior?');
  });
  it('does not cut an address at "Brgy." or "St." when keeping two sentences', () => {
    const t = 'Your booking request has been forwarded for Saturday, Nov 21, window cleaning at 12 Maple St. Extension, Brgy. Bahay Toro. Our team will confirm the schedule. Thank you po.';
    const fixed = repairReply(t, ['length: too long'], v('ok'));
    expect(fixed).toContain('Brgy. Bahay Toro'); expect(fixed).toContain('12 Maple St. Extension'); expect(fixed).not.toContain('Thank you po');
  });
  it('naming the services is the answer to "what services do you offer?" (production draft 11-20 02:51), but a window price may not mention roofs', () => {
    const list = 'We clean windows and glass, walls, roofs and solar panels po. Which one are you interested in?';
    expect(validateReply(list, v('What services do you offer?', emptyContext(), 'general_inquiry')).join()).not.toMatch(/unrelated_services/);
    expect(validateReply(list, v('Ano po ang services ninyo?', emptyContext(), 'general_inquiry')).join()).not.toMatch(/unrelated_services/);
    const wc = foldMessages(emptyContext(), ['Makati', 'window cleaning']); expect(validateReply('Our Makati window package is ₱4,799. We also clean roofs po.', v('How much for window cleaning?', wc, 'price_inquiry')).join()).toMatch(/unrelated_services/);
    expect(validateReply('Our Makati window package is ₱4,799. We also clean roofs po.', v('What window cleaning price is it?', wc, 'price_inquiry')).join()).toMatch(/unrelated_services/);
  });
  it('has a safe fallback for each situation', () => {
    expect(fallbackReply(v('hi', emptyContext(), 'booking_request')).text).toMatch(/location \(city\)/); expect(fallbackReply(v('book', foldMessages(emptyContext(), ['Makati', 'I want to book']), 'booking_request')).text).toMatch(/Reservation Date:/);
    expect(fallbackReply(v('How much?', ctx), 'integration')).toEqual({ text: 'Let me have our team verify that for you po.', handover: true }); expect(fallbackReply(v('You damaged it', ctx, 'complaint')).handover).toBe(true);
    expect(fallbackReply(v('How much?', emptyContext(), 'price_inquiry')).text).toMatch(/location/); expect(ackReply()).toMatch(/You're welcome/);
  });
});

describe('booking questions are validated', () => {
  const b = foldMessages(emptyContext(), ['Makati', 'window cleaning', 'I want to book']); const vb = (t: string, c = b) => ({ ctx: c, intent: c.intent, customerText: t, previousAi: [] as string[] });
  it('allows the next booking question, blocks contact questions outside a booking and out of order', () => {
    expect(validateReply('Sure po, happy to help you book!\n\n---\n\nPlease copy this and fill in your details po:\nName:\nAddress:\nContact Number:\nEmail:\nNo. of House Storey:\nReservation Date:\nService Window, Wall, Roof, Solar, Floor?', vb('I want to book'))).toEqual([]);
    const nocity = foldMessages(emptyContext(), ['I want to book']); expect(validateReply('May I have your full name po?', vb('I want to book', nocity)).join()).toMatch(/wrong_order: ask for the location first/);
    const p = foldMessages(emptyContext(), ['Makati', 'window cleaning', 'How much?']); expect(validateReply('May I have your full name po?', vb('How much?', p)).join()).toMatch(/premature_contact/);
    const ready = foldMessages(b, ['Saturday']); expect(validateReply('May I have your full name po?', vb('Saturday', ready))).toEqual([]); expect(validateReply('What date would you prefer po?', vb('Saturday', ready)).join()).toMatch(/repeated_question/);
  });
});
