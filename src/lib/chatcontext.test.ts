import { describe, expect, it } from 'vitest';
import { analyzeDelivered, applyDelivered, classifyIntent, contextBlock, emptyContext, extractFacts, foldMessages, isAcknowledgment, isYes, nextBookingQuestion, nextQuestionHint, questionTopic, readContext } from '../../supabase/functions/_shared/chatcontext';

describe('what a customer message tells us', () => {
  it('finds a location (a known city, a Manila district, a place after "in")', () => {
    expect(extractFacts('Binondo').location).toBe('Binondo');   // an area that is not on the approved rate list is kept as the customer wrote it (the price tool will say the team verifies) expect(extractFacts('Makati po').location).toBe('Makati'); expect(extractFacts('I am in Antipolo City').location).toBe('Antipolo');
    expect(extractFacts('We are in Naga City').location).toBe('Naga City'); expect(extractFacts('Hello')).toEqual({}); expect(extractFacts('Wall Cleaning').location).toBeUndefined();
  });
  it('finds service, surface, property, level and schedule', () => {
    expect(extractFacts('Wall Cleaning').service).toBe('wall'); expect(extractFacts('solar panels and roof').service).toBe('solar'); expect(extractFacts('Exterior').surface).toBe('exterior'); expect(extractFacts('inside po').surface).toBe('interior');
    expect(extractFacts('Ground floor').access).toBe('ground floor'); expect(extractFacts('2-storey house')).toMatchObject({ access: '2-storey', property: 'residential' }); expect(extractFacts('it is an office building').property).toBe('commercial');
    expect(extractFacts('Can I schedule tomorrow?').schedule).toBe('tomorrow'); expect(extractFacts('Friday cream paint').schedule).toBeUndefined();
  });
});
describe('intent', () => {
  const c = emptyContext();
  it('recognises the seven intents', () => {
    expect(classifyIntent('How much?', c).intent).toBe('price_inquiry'); expect(classifyIntent('magkano po window cleaning', c).intent).toBe('price_inquiry');
    expect(classifyIntent('I want to book', c).intent).toBe('booking_request'); expect(classifyIntent('Can I schedule tomorrow?', c).intent).toBe('booking_request');
    expect(classifyIntent('Your team damaged my glass', c).intent).toBe('complaint'); expect(classifyIntent('I want to talk to a person', c).intent).toBe('human_assistance');
    expect(classifyIntent('Is it safe for tinted glass?', c).intent).toBe('technical_question'); expect(classifyIntent('Wall Cleaning', c, extractFacts('Wall Cleaning')).intent).toBe('service_qualification'); expect(classifyIntent('Hello', c).intent).toBe('general_inquiry');
  });
  it('"okay", "thanks" and "noted" are acknowledgments and never a yes to booking', () => {
    for (const t of ['Okay, thank you.', 'ok po', 'Thanks!', 'Salamat po', 'noted']) { expect(isAcknowledgment(t)).toBe(true); expect(classifyIntent(t, { ...c, last_question: 'booking' }).intent).not.toBe('booking_request'); }
    expect(isYes('yes please')).toBe(true); expect(isYes('okay')).toBe(false); expect(isYes('thanks')).toBe(false);
    expect(classifyIntent('yes please', { ...c, last_question: 'booking' }).intent).toBe('booking_request'); expect(classifyIntent('yes please', { ...c, last_question: 'location' }).intent).not.toBe('booking_request');
  });
});
describe('memory across messages (Scenarios A, B, F, G)', () => {
  it('A: Binondo then Wall Cleaning keeps both and suggests the wall type, not booking', () => {
    const k = foldMessages(emptyContext(), ['Binondo', 'Wall Cleaning']);
    expect(k).toMatchObject({ location: 'Binondo', service: 'wall', stage: 'assist', intent: 'service_qualification' }); expect(nextQuestionHint(k)).toMatch(/exterior or the interior/); expect(contextBlock(k)).not.toMatch(/would you like to book|CURRENT INTENT: booking/i);
  });
  it('B: a burst keeps every fact and the price question', () => {
    const k = foldMessages(emptyContext(), ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']);
    expect(k).toMatchObject({ location: 'Binondo', service: 'wall', surface: 'exterior', access: 'ground floor', intent: 'price_inquiry' }); expect(nextQuestionHint(k)).toBeUndefined();
  });
  it('a correction replaces the old value; a message that mentions nothing keeps everything', () => {
    let k = foldMessages(emptyContext(), ['Makati', 'Exterior wall']); k = foldMessages(k, ['sorry, Quezon City']); expect(k.location).toBe('Quezon City'); expect(k.surface).toBe('exterior');
    k = foldMessages(k, ['thanks']); expect(k).toMatchObject({ location: 'Quezon City', service: 'wall', surface: 'exterior' });
    k = foldMessages(k, ['roof pala']); expect(k.service).toBe('roof'); expect(k.surface).toBeUndefined();
  });
  it('G: a long chat keeps the early facts (they live in the context, not in the last 14 messages)', () => {
    const k = foldMessages(emptyContext(), ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'cream paint', 'gated', 'weekdays only', 'two coats', 'its old', 'how long?', 'ok', 'and the stains?', 'rust', 'hello?', 'any idea?']);
    expect(k).toMatchObject({ location: 'Binondo', service: 'wall', surface: 'exterior' });
  });
  it('a bare place after "May we know your location?" is the location', () => { expect(extractFacts('Naga', 'location').location).toBe('Naga'); });
  it('reads a stored context safely', () => { expect(readContext(null).explained).toEqual([]); const r = readContext({ location: 'Makati', service: 'nonsense', surface: 'x' }); expect(r.location).toBe('Makati'); expect(r.service).toBeUndefined(); expect(r.surface).toBeUndefined(); });
});
describe('only delivered replies count as said', () => {
  it('reads the last question and what was explained', () => {
    const d = analyzeDelivered(['Hello po, good day! TopMop offers professional exterior cleaning.\n\n---\n\nOur Makati package is ₱4,799. Our team will conduct on-site glass and solar panel counting and wall and floor area measurement before they begin.', 'Is it for the exterior or the interior walls po?']);
    expect(d).toMatchObject({ lastQuestion: 'surface', priceQuoted: true, bookingOffered: false }); expect(d.explained).toEqual(expect.arrayContaining(['welcome', 'counting']));
    expect(analyzeDelivered(['Would you like to book a date po?']).bookingOffered).toBe(true); expect(applyDelivered(emptyContext(), d).last_question).toBe('surface');
  });
  it('classifies question topics', () => { expect(questionTopic('May I know your location (city) po?')).toBe('location'); expect(questionTopic('Which cleaning service do you need po?')).toBe('service'); expect(questionTopic('What date would you prefer po?')).toBe('date'); expect(questionTopic('Would you like to book po?')).toBe('booking'); });
  it('builds the prompt block from what is known', () => {
    const k = foldMessages(emptyContext(), ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']); const b = contextBlock(applyDelivered(k, analyzeDelivered(['Is it exterior or interior po?'])));
    expect(b).toMatch(/location: Binondo/); expect(b).toMatch(/never ask for these again/); expect(b).toMatch(/LAST QUESTION WE ASKED[^.]*surface/); expect(b).toMatch(/CURRENT INTENT: price_inquiry/);
  });
});

describe('booking is a conversation, not a form', () => {
  it('asks for one thing at a time, in order: location, service, date, name, mobile, address', () => {
    let c = foldMessages(emptyContext(), ['I want to book']); expect(nextBookingQuestion(c)?.topic).toBe('location');
    c = foldMessages(c, ['Makati']); expect(nextBookingQuestion(c)?.topic).toBe('service');
    c = foldMessages(c, ['window cleaning']); expect(nextBookingQuestion(c)?.topic).toBe('date');
    c = foldMessages(c, ['Saturday']); expect(c.schedule).toBe('saturday'); expect(nextBookingQuestion(c)?.topic).toBe('name');
    c = foldMessages({ ...c, last_question: 'name' }, ['Maria Santos']); expect(c.contact?.name).toBe('Maria Santos'); expect(nextBookingQuestion(c)?.topic).toBe('mobile');
    c = foldMessages({ ...c, last_question: 'mobile' }, ['0917 123 4567']); expect(c.contact?.mobile).toBe('09171234567'); expect(nextBookingQuestion(c)?.topic).toBe('address');
    c = foldMessages({ ...c, last_question: 'address' }, ['12 Maple St, Brgy. San Antonio, Makati']); expect(c.contact?.address).toContain('Maple St'); expect(nextBookingQuestion(c)).toBeNull();
    expect(contextBlock(c)).toMatch(/ALL BOOKING DETAILS ARE KNOWN/); expect(contextBlock(foldMessages(emptyContext(), ['I want to book']))).toMatch(/NEXT BOOKING QUESTION[^:]*: May I know your location/);
  });
  it('takes details the customer volunteers in any order, and a pasted labelled block', () => {
    const c = foldMessages(emptyContext(), ['Hi, my name is Jig Narciso, text me at 0917-555-1212, Quezon City window cleaning, can I book Friday?']);
    expect(c).toMatchObject({ location: 'Quezon City', service: 'window', schedule: 'friday', intent: 'booking_request' }); expect(c.contact).toMatchObject({ name: 'Jig Narciso', mobile: '09175551212' }); expect(nextBookingQuestion(c)?.topic).toBe('address');
    const b = foldMessages(emptyContext(), ['Name: Ana Reyes\nAddress: 5 Rizal Ave, Pasig\nContact Number: 09981112222\nEmail: ana@mail.com']); expect(b.contact).toEqual({ name: 'Ana Reyes', address: '5 Rizal Ave, Pasig', mobile: '09981112222', email: 'ana@mail.com' });
  });
  it('a bare answer is only a name or address when we just asked for it; "okay" is never booking consent', () => {
    expect(foldMessages(emptyContext(), ['Wall cleaning']).contact).toBeUndefined(); expect(foldMessages({ ...emptyContext(), last_question: 'name' }, ['okay']).contact?.name).toBeUndefined();
    expect(foldMessages({ ...emptyContext(), last_question: 'booking' }, ['okay']).booking_requested).toBeFalsy(); expect(foldMessages({ ...emptyContext(), last_question: 'booking' }, ['yes please']).booking_requested).toBe(true);
    expect(questionTopic('May I have your full name po?')).toBe('name'); expect(questionTopic('What is the best mobile number to reach you po?')).toBe('mobile'); expect(questionTopic('What is the complete address of the property po?')).toBe('address'); expect(questionTopic('What date would you prefer po?')).toBe('date');
  });
});
