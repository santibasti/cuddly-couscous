// V2.2 company knowledge: acid rain, crew size, commercial assessment, glass methods, site needs, roof method, bundled services.
// The approved replies are examples of meaning and tone; these tests check the meaning is in the prompt, that natural variants pass the reply checks, and that the wrong answers are caught.
import { describe, expect, it } from 'vitest';
import { ACID_RAIN_REPLY, BUNDLE_REPLY, COMMERCIAL_OCULAR, CREW_REPLY, GLASS_METHOD_REPLY, NO_OCULAR, PAYMENT_POLICY, ROOF_METHOD_REPLY, SITE_REPLY, buildSystem, guardReply } from '../../supabase/functions/_shared/brain';
import { emptyContext, foldMessages } from '../../supabase/functions/_shared/chatcontext';
import { estimate } from '../../supabase/functions/_shared/estimate';
import { fallbackReply, validateReply } from '../../supabase/functions/_shared/validate';

const sys = buildSystem({ sections: [{ key: 'a', title: 'Identity', body: 'You are TopMop.' }], version: 4, lang: 'en' } as never);
const ctx = emptyContext();
const check = (reply: string, customerText: string, c = ctx, intent = c.intent) => validateReply(reply, { ctx: c, intent, customerText, previousAi: [] });
const clean = (reply: string, customerText: string) => expect(check(reply, customerText), reply).toEqual([]);

describe('V2.2 knowledge is in the prompt', () => {
  it('1 acid rain: no removal or restoration, no promise, regular cleaning only maintains', () => {
    expect(sys).toMatch(/TopMop does not offer acid rain mark removal or glass restoration/); expect(sys).toMatch(/some marks are permanent etching; aggressive treatment can make the glass worse/);
    expect(sys).toMatch(/Never promise to remove existing marks or etching and never say cleaning prevents future acid rain damage/); expect(sys).toMatch(/regular glass cleaning, which removes dirt and surface buildup and helps maintain the glass/);
  });
  it('2 crew: 3–5 per service depending on the job', () => { expect(sys).toMatch(/normally 3–5 professional cleaning crew per service, depending on the job/); });
  it('3 commercial: the three assessment options, photos optional, not a guarantee or a quotation, ₱2,500 deductible', () => {
    for (const r of [/initial assessment from the property address on Google Maps/, /photographs only if the customer voluntarily provides them \(optional: never ask for them, never require them\)/, /onsite ocular inspection for ₱2,500, deductible from the service cost when the customer proceeds/, /not a guarantee of safe access and not a final quotation/]) expect(sys).toMatch(r);
    expect(sys).toMatch(/never ask for or require photos or videos \(for a commercial property you may say photos are optional, nothing more\)/);
  });
  it('4 glass: exterior deionized water with water-fed poles, interior traditional methods', () => { expect(sys).toMatch(/exterior glass is cleaned with purified deionized water and our professional water-fed pole equipment/); expect(sys).toMatch(/interior glass is cleaned with traditional professional glass-cleaning methods/); });
  it('5 site: own equipment, only a water source and electricity if needed', () => { expect(sys).toMatch(/we bring our own equipment and tools; the customer only needs to give access to a water source and, when the equipment needs it, electricity/); });
  it('6 roof: hybrid soft washing and regulated low pressure, depends on the roof, no promise about discoloration or paint', () => {
    expect(sys).toMatch(/hybrid approach of suitable soft washing and regulated low-pressure cleaning/); expect(sys).toMatch(/roof type, material, paint condition, structural condition, slope and safe access/); expect(sys).toMatch(/Never guarantee removal of permanent discoloration or restoration of faded paint/);
  });
  it('7 bundle: every service after the first has its minimum waived, never free, never a lower rate, never equipment charges; the estimate tool decides', () => {
    for (const r of [/the FIRST service \(the window package if there is one\) keeps its full minimum charge; EVERY OTHER service has its minimum waived and is billed on the actual quantity at its approved per-sqm or per-panel rate/, /NOT a free service, NOT a lower unit rate and NOT a waiver of special-equipment charges/, /for two or more services call it with items/, /Do not use the words "discount" or "free"/]) expect(sys).toMatch(r);
  });
  it('the communication rules: one topic at a time, own words, nothing volunteered; the V2.1 rules and approved texts are still there', () => {
    expect(sys).toMatch(/answer ONLY the topic the customer asked about, in your own short natural words/); expect(sys).toMatch(/not scripts; never bring up the other topics; never guarantee a result/);
    expect(sys).toContain(NO_OCULAR.split('\n')[0]); expect(sys).toContain(PAYMENT_POLICY); expect(sys).toMatch(/NO BOOKING PUSH/); expect(sys).toMatch(/at most TWO short sentences/); expect(sys).toMatch(/ask at most one question/);
  });
});

describe('the approved examples and natural variants pass the reply checks', () => {
  it('every approved example is a valid reply to its question', () => {
    clean(ACID_RAIN_REPLY, 'Can you remove acid rain marks on my windows?'); clean(CREW_REPLY, 'How many people will come to clean?'); clean(COMMERCIAL_OCULAR, 'We have an office building, can you give a quote?');
    clean(GLASS_METHOD_REPLY, 'What do you use to clean the glass?'); clean(SITE_REPLY, 'What do you need from us at the house?'); clean(ROOF_METHOD_REPLY, 'How do you clean roofs?'); clean(BUNDLE_REPLY, 'If I add roof cleaning to my windows is there a minimum?');
    for (const r of [ACID_RAIN_REPLY, CREW_REPLY, COMMERCIAL_OCULAR, GLASS_METHOD_REPLY, SITE_REPLY, ROOF_METHOD_REPLY, BUNDLE_REPLY]) expect(guardReply(r, { amounts: [], booked: false }).violations, r).toEqual([]);
  });
  it('the same meaning in other words also passes (they are examples, not scripts)', () => {
    clean("Sorry po, we don't remove acid rain marks because treating etched glass can damage it further. Regular cleaning keeps your glass maintained, but it can't undo existing damage.", 'Can you remove acid rain marks?');
    clean('We usually send 3 to 5 crew per service po, depending on the job.', 'How many staff come?');
    clean('For commercial projects po, we can first assess from your address on Google Maps, and photos are optional. A site ocular inspection is ₱2,500, deductible once you proceed.', 'I need a quote for our warehouse');
    clean('Exterior glass is cleaned with purified deionized water and water-fed poles po, while interior glass is cleaned with traditional professional methods.', 'How do you clean exterior and interior glass?');
    clean('You only need to give us access to water, and electricity if our equipment needs it po. We bring all our own tools.', 'What do we need to prepare?');
    clean("We combine soft washing with carefully regulated low pressure when it suits your roof po. It depends on the material and condition.", 'What method do you use on roofs?');
    clean("If you book two eligible services together po, the second one has no minimum. It's still billed at the regular per-sqm or per-panel rate.", 'Is there a minimum if I book roof and wall together?');
  });
  it('an acid rain mention while asking a price needs no policy sentence (only an actual removal question does)', () => { clean('Our Makati window package is ₱4,799 for up to 31 glass panels, with extra panels at ₱140 each.', 'How much for windows? They have some acid rain marks'); });
});

describe('a commercial quote question always gets the three assessment options (found in a real-model run: the ₱2,500 option was left out)', () => {
  const ask = 'We have an office building. Can you give us a quote?';
  it('a reply with only Google Maps and "our team will follow up" is rejected', () => {
    const short = "For commercial projects po, we can start with an initial assessment using your building's address on Google Maps, and photos are optional. Our team will follow up on your quote from there po.";
    expect(check(short, ask).join()).toMatch(/commercial: give the three assessment options/);
    expect(check('Our team will prepare a quote for your office po.', ask).join()).toMatch(/commercial: give the three assessment options/);
    expect(check('How much is the quote for our warehouse?', 'How much is the quote for our warehouse?')).toBeTruthy();
  });
  it('the approved text, and natural paraphrases with all three options, pass', () => {
    clean(COMMERCIAL_OCULAR, ask);
    clean("For commercial projects po, we can first assess from your address on Google Maps, and photos are optional. An onsite ocular inspection is ₱2,500, deductible once you proceed.", ask);
    clean('We can start from your property address on Google Maps (photos only if you like), or do an onsite ocular for ₱2,500, deductible if you proceed po.', 'Can you quote our school building?');
  });
  it('the safe fallback is the approved commercial answer, and it is valid', () => {
    const f = fallbackReply({ ctx, intent: ctx.intent, customerText: ask, previousAi: [] }); expect(f.text).toBe(COMMERCIAL_OCULAR); expect(f.handover).toBe(false); expect(check(f.text, ask)).toEqual([]);
  });
  it('a house or a plain question is not treated as commercial', () => {
    clean('Our Makati window package is ₱4,799 for up to 31 glass panels, with extra panels at ₱140 each.', 'How much for windows in my house in Makati?');
    clean(CREW_REPLY, 'How many people will come to the office?');
  });
});

describe('found in a real-model run: invitations to send photos and a third sentence on commercial answers', () => {
  const ask = 'We have an office building. Can you give us a quote?';
  it('"you may send photos (optional)" is an invitation and is rejected; "photos are optional" is a statement and passes', () => {
    expect(check('For commercial projects po, we can assess from your address on Google Maps, or you may send photos (optional). An onsite ocular inspection is ₱2,500, deductible when you proceed.', ask).join()).toMatch(/photos/);
    expect(check('You may also send photos po.', 'what do you need before the visit?').join()).toMatch(/photos/);
    clean(COMMERCIAL_OCULAR, ask); expect(COMMERCIAL_OCULAR).toMatch(/photos are optional/);
  });
  it('a commercial answer is limited to two short sentences like every other answer (only the verbatim residential text is exempt)', () => {
    expect(check(`${COMMERCIAL_OCULAR} What is the property address po?`, ask).join()).toMatch(/length/);
    expect(check(NO_OCULAR, 'Do you do an ocular visit for my house?')).toEqual([]);
  });
});

describe('the wrong answers are caught', () => {
  it('acid rain: no promise, no "we will assess it", no prevention claim; the policy answer is the safe fallback', () => {
    const ask = 'Can you remove acid rain marks on my glass?';
    expect(check("We'll try our best to remove the acid rain marks po.", ask).join()).toMatch(/overpromise/);
    expect(check('Our team will assess the acid rain marks on site po.', ask).join()).toMatch(/policy: TopMop does not offer acid rain mark removal/);
    expect(check('Yes po, we can remove the acid rain marks.', ask).join()).toMatch(/overpromise/);
    expect(check('Regular cleaning will prevent future acid rain damage po.', 'Will cleaning prevent acid rain damage?').join()).toMatch(/overpromise/);
    const f = fallbackReply({ ctx, intent: ctx.intent, customerText: ask, previousAi: [] }); expect(f.text).toBe(ACID_RAIN_REPLY); expect(f.handover).toBe(false); expect(check(f.text, ask)).toEqual([]);
  });
  it('roof: never promise to remove permanent discoloration or restore faded paint', () => {
    expect(check('Yes po, we can restore the faded paint on your roof.', 'Can you restore my faded roof paint?').join()).toMatch(/overpromise/);
    expect(check("We can't restore faded paint po, but we can clean the roof surface.", 'Can you restore my faded roof paint?')).toEqual([]);
  });
  it('commercial photos are optional: never requested, never required', () => {
    expect(check('Please send photos of the building po so we can quote.', 'what do you need before the visit?').join()).toMatch(/photos/);
    expect(check('Photos are required for commercial quotes po.', 'what do you need before the visit?').join()).toMatch(/photos/);
    expect(check('We need photos of the roof first po.', 'how much for roof cleaning?').join()).toMatch(/photos/);
    expect(check('Could you send photos of your windows po?', 'how much for windows?').join()).toMatch(/photos/);
    expect(check('Photos are optional po, and not required for the initial assessment.', 'what do you need before the visit?')).toEqual([]);
    expect(check('You can share photos if you like po.', 'what do you need before the visit?')).toEqual([]);
    expect(check('A photo is not required po.', 'what do you need before the visit?')).toEqual([]);
    expect(check('Sure po, you may send them. Our technical team will review them.', 'can I send pictures?')).toEqual([]);
  });
  it('a reply with the ocular text still cannot ask for photos', () => { expect(check(`${COMMERCIAL_OCULAR} Please send photos po.`, 'what do you need before the visit?').join()).toMatch(/photos/); });
  it('bundle: never a free second service, a lower rate or "no other charges"', () => {
    for (const bad of ['The second service is free po.', 'You get 50% off the second service po.', 'The second service gets a discount po.', 'The second service has a lower rate po.', 'There are no other charges po.']) {
      const g = guardReply(bad, { amounts: [], booked: false }).violations; const v = check(bad, 'what if I book two services together?'); expect([...g, ...v].length, bad).toBeGreaterThan(0);
    }
    expect(guardReply('This is not a discount po: the regular rate still applies.', { amounts: [], booked: false }).violations).toEqual([]);
  });
});

describe('bundled services: only the minimum is waived (the estimate tool applies it, never the AI)', () => {
  it('roof: the minimum 100 sqm is waived, the rate is not', () => {
    expect(estimate('Makati', 'roof cleaning', 60).estimate).toBe(14500); const b = estimate('Makati', 'roof cleaning', 60, 'residential', true); expect(b.estimate).toBe(8700);
    expect(b.rates_en).toMatch(/₱145 per sqm/); expect(estimate('Makati', 'roof cleaning', 60).rates_en).toMatch(/₱145 per sqm/);
  });
  it('wall and floor: 50 sqm minimum waived, same ₱125 rate', () => {
    expect(estimate('Makati', 'wall cleaning', 30).estimate).toBe(6250); expect(estimate('Makati', 'wall cleaning', 30, 'residential', true).estimate).toBe(3750);
    expect(estimate('Makati', 'floor cleaning', 30).estimate).toBe(6250); expect(estimate('Makati', 'floor cleaning', 30, 'residential', true).estimate).toBe(3750);
  });
  it('solar: 20 panel minimum waived, same ₱245 rate', () => { expect(estimate('Makati', 'solar panels', 12).estimate).toBe(4900); expect(estimate('Makati', 'solar panels', 12, 'residential', true).estimate).toBe(2940); });
  it('the glass package is not changed by bundling, the wording never says free or discount', () => {
    expect(estimate('Makati', 'window cleaning', 40, 'residential', true).estimate).toBe(estimate('Makati', 'window cleaning', 40).estimate);
    for (const q of [estimate('Makati', 'roof cleaning', 60, 'residential', true), estimate('Makati', 'wall cleaning', 30, 'residential', true), estimate('Makati', 'solar panels', 12, 'residential', true)]) { expect(q.rates_en + q.estimate_en).not.toMatch(/free|discount|% off|libre/i); expect(q.estimate_en).toMatch(/confirm/i); }
  });
  it('a bundle question keeps the conversation memory (location and service are not asked again)', () => {
    const c = foldMessages(emptyContext(), ['Makati', 'window cleaning', 'If I add roof cleaning is there a minimum?']); expect(c.location).toBe('Makati'); expect(c.service).toBeTruthy();
  });
});

describe('the commercial text has one source of truth', () => {
  it('the pricing tool says the same as the approved example (so the AI never relays the old wording)', () => {
    for (const p of ['Commercial', 'office building', 'warehouse']) { const e = estimate('Makati', 'window cleaning', 80, p); expect(e.estimate_en).toBe(COMMERCIAL_OCULAR); expect(e.rates_en).toBe(COMMERCIAL_OCULAR); }
    expect(COMMERCIAL_OCULAR).toMatch(/Google Maps/); expect(COMMERCIAL_OCULAR).toMatch(/photos are optional/); expect(COMMERCIAL_OCULAR).toMatch(/₱2,500/); expect(COMMERCIAL_OCULAR).toMatch(/deductible/);
  });
});
