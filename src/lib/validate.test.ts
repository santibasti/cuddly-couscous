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
    expect(validateReply('Please copy this and fill in your details po:\nName:\nAddress:', v('book'))).toEqual([]);
  });
  it('repairs by removing the bad sentences', () => {
    const bad = 'Exterior wall cleaning in Manila is ₱125 per sqm. Our team will conduct on-site glass and solar panel counting and wall and floor area measurement. Would you like to book a date po?';
    const viol = validateReply(bad, v('How much?')); expect(viol.length).toBeGreaterThan(1);
    const fixed = repairReply(bad, viol, v('How much?')); expect(fixed).toBe('Exterior wall cleaning in Manila is ₱125 per sqm.'); expect(validateReply(fixed, v('How much?'))).toEqual([]);
    expect(repairReply('Is it exterior? Is it ground floor?', ['one_question'], v('hi'))).toBe('Is it exterior?');
  });
  it('has a safe fallback for each situation', () => {
    expect(fallbackReply(v('hi', emptyContext(), 'booking_request')).text).toMatch(/location \(city\)/); expect(fallbackReply(v('book', foldMessages(emptyContext(), ['Makati', 'I want to book']), 'booking_request')).text).toMatch(/Which cleaning service/);
    expect(fallbackReply(v('How much?', ctx), 'integration')).toEqual({ text: 'Let me have our team verify that for you po.', handover: true }); expect(fallbackReply(v('You damaged it', ctx, 'complaint')).handover).toBe(true);
    expect(fallbackReply(v('How much?', emptyContext(), 'price_inquiry')).text).toMatch(/location/); expect(ackReply()).toMatch(/You're welcome/);
  });
});
