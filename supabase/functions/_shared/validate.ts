// Checks a reply before it goes to ManyChat, repairs it when it can, and falls back to a safe sentence when it cannot. Pure logic, no network.
import { type ChatContext, type Intent, type ServiceKey, lastQuestionOf, questionTopic, servicesIn, nextQuestionHint, nextBookingQuestion } from './chatcontext.ts';
import { tooTagalog, ACID_RAIN_REPLY } from './brain.ts';

export interface Check { ctx: ChatContext; intent: Intent; customerText: string; previousAi: string[]; first?: boolean }
const FIXED = /Reservation Date:|ocular|^\s*Thank you po! Our technical team|^\s*Sure po, you may send them|^\s*Your booking is set for|TopMop offers professional exterior cleaning/i;
// Abbreviations in addresses and titles ("Brgy. Bahay Toro", "Maple St. Extension") do not end a sentence; splitting there cut a booking confirmation in the middle of the address.
const ABBR = /\b(brgy|st|ave|blvd|rd|bldg|apt|hwy|dist|mt|mr|mrs|dr|sr|jr)\./gi;
export const sentences = (t: string): string[] => String(t ?? '').replace(/\s+/g, ' ').trim().replace(ABBR, '$1\u0001').split(/(?<=[.!?])\s+/).map((x) => x.replace(/\u0001/g, '.')).filter(Boolean);
const wordsIn = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const BOOKING_OFFER = /(would you like|want|ready|interested|shall we|can i|may i|let me|i can) .{0,25}(to )?(book|schedule|reserve|set (?:up )?an? (?:appointment|booking|date))|book(?:ing)? a date|set an? appointment|available dates?|reservation/i;
const COUNT_TALK = /(on-?site|onsite).{0,70}(count|measure)|counting and .{0,40}measurement|final count|panel count|exact panel|count(?:s|ed)? the panels|square met(?:er|re)s/i;
const ASKS_QTY = /how many (glass |solar )?(panels?|windows?)|how big|square met(?:er|re)s?\b.*\?|\bsqm\b.*\?|what(?:'s| is) the (?:size|area)|measurements? of/i;
const ASKS_PHOTO = /\b(send|share|upload|provide|attach|take)\b.{0,25}\b(photos?|pictures?|pics?|videos?|images?)\b/i;
/** "photos are optional" / "if you like" is a statement, not a request. */
const PHOTO_OPTIONAL = /\b(optional|voluntar\w*|if you (like|want|wish|prefer)|no need|(not|isn'?t|aren'?t|never) (required|needed|necessary|mandatory))\b/i;
const REQUIRES_PHOTO = /\b(photos?|pictures?|videos?)\b.{0,25}\b(required|mandatory|needed|necessary|must)\b|\b(need|require[sd]?|must (send|have|provide)|have to (send|provide))\b.{0,25}\b(photos?|pictures?|videos?)\b/i;
const NOT_REQUIRED = /\b(not|no|never|n't)\b.{0,12}\b(required|mandatory|needed|necessary)\b/i;
const photoViolation = (t: string): string | null => (sentences(t).some((x) => (ASKS_PHOTO.test(x) && !PHOTO_OPTIONAL.test(x)) || (REQUIRES_PHOTO.test(x) && !NOT_REQUIRED.test(x))) ? 'photos: never ask for or require photos or videos (they are optional and only welcomed when the customer offers)' : null);
const PHOTO_BAD = new RegExp(`${ASKS_PHOTO.source}|${REQUIRES_PHOTO.source}`, 'i');
// Policy (V2.2): no acid rain mark removal, and no promise about marks, etching, stains or discolouration.
const ACID_ASK = /\b(acid[- ]?rain|etch(ed|ing)?|water ?marks?|hard water)\b/i;
const REMOVAL_ASK = /\b(remov\w*|restor\w*|fix\w*|get rid|clean(ing|ed)?|polish\w*|treat\w*|tanggal\w*|alis\w*|matanggal|kaya)\b/i;
const SAYS_NO_REMOVAL = /\b(don'?t|do not|doesn'?t|not|cannot|can'?t|unable)\b.{0,40}\b(offer|provide|remov\w*|restor\w*|revers\w*)/i;
const MARK_WORDS = /\b(acid[- ]?rain|etch\w*|water ?marks?|stains?|discolo\w*|faded|fading|oxidi[sz]\w*|marks|spots|damage)\b/i;
const PROMISES = /\b(we (can|will|'ll|do) (remove|restore|fix|polish|bring back|get rid of|treat|clear)|we('ll| will) (try|do our best)|(can|will|should) be (removed|restored|fixed|cleaned off)|will (come|wash) off|guarantee[sd]?|100\s?%|prevent(s|ed|ing)?)\b/i;
// Bundled services: only the minimum of the second service is waived (never free, never a lower rate, never "no other charges": special equipment can add a charge).
const BUNDLE_BAD = /\b(second|2nd|extra|additional|other) (service|one)\b.{0,30}\b(free|libre|half|50\s?%|\d+\s?% off|discount\w*)\b|\bfree (second|2nd|extra|add-?on)\b|\b(discount|lower|cheaper|reduced) (unit )?(rate|price)\b|\bno (other|additional|extra|hidden) (charges?|fees?)\b|\b\d+\s?% off\b|\bhalf[- ](price|off)\b/i;
// Minimum charge: every package has one. Never prorated, never "pay only for what is cleaned". ("no minimum" is only right for the SECOND service of a bundle.)
const PRORATE = /\b(pro-?rat\w*|(only )?pay(ing)? (only )?for (the )?(actual|exact|what)|charged? (only )?for (the )?(actual|exact) (count|panels?|area|quantity|sqm)|(no|without (a|any)) minimum)\b/i;
const BUNDLE_CONTEXT = /\b(second|bundl\w*|together|eligible|add(ed|itional)?)\b/i;
const minimumViolation = (x: string) => PRORATE.test(x) && !BUNDLE_CONTEXT.test(x);
const NEGATES = /\b(not|n't|cannot|can't|don't|do not|never|unable|no)\b/i;
const ASKS_SERVICES = /\b(what|which|ano(ng)?|anu)\b.{0,30}\b(services?|serbisyo|offer(s|ed)?)\b|\bwhat (do|does) (you|topmop|top mop)\b.{0,20}\b(do|offer|clean)\b|\bservices? (do )?(you|po|ninyo|nyo)\b|\bwhat can you (clean|do)\b|\blist of services\b/i;
const SERVICE_WORDS: [ServiceKey, RegExp][] = [['window', /\b(window|glass)\b/i], ['wall', /\bwalls?\b/i], ['roof', /\broof(?:s|ing)?\b/i], ['solar', /\bsolar\b/i], ['floor', /\b(floor|driveway)\s*(?:cleaning|washing)\b|\bfloor and\b/i], ['gutter', /\bgutters?\b/i]];

/** Machine-readable violations; an empty list means the reply may go out. */
export function validateReply(reply: string, v: Check): string[] {
  const t = String(reply ?? '').trim(); if (!t) return ['empty'];
  const pv = photoViolation(t);
  if (FIXED.test(t) || t.includes('\n\n---\n\n')) return pv ? [pv] : [];          // approved fixed texts and the welcome are exempt (but never a photo request)
  const out: string[] = []; const s = sentences(t);
  if (tooTagalog(t)) out.push('language: write in English or English-dominant Taglish, never Tagalog sentences');
  if (s.length > 2 || wordsIn(t) > 45) out.push('length: at most two short sentences, preferably under 35 words');
  const qs = (t.match(/\?/g) ?? []).length; if (qs > 1) out.push('one_question: ask only one question');
  const q = lastQuestionOf(t);
  if (q) {
    const topic = questionTopic(q); const c = v.ctx;
    const known = (topic === 'location' && c.location) || (topic === 'service' && c.service) || (topic === 'surface' && c.surface) || (topic === 'property' && c.property) || (topic === 'access' && c.access) || (topic === 'date' && c.schedule) || (topic === 'name' && c.contact?.name) || (topic === 'mobile' && c.contact?.mobile) || (topic === 'address' && c.contact?.address);
    if (known) out.push(`repeated_question: the customer already told us the ${topic}; do not ask it again`);
    const prev = v.previousAi.length ? lastQuestionOf(v.previousAi[v.previousAi.length - 1]) : undefined;
    if (prev && prev.toLowerCase().replace(/\W+/g, ' ') === q.toLowerCase().replace(/\W+/g, ' ')) out.push('repeated_question: this is the same question we just asked');
  }
  const asked = new Set<ServiceKey>([...servicesIn(v.customerText), ...(v.ctx.services_seen ?? []), ...(v.ctx.service ? [v.ctx.service] : [])]); if (ACID_ASK.test(v.customerText)) asked.add('window');   // acid rain is about glass
  const stray = ASKS_SERVICES.test(v.customerText) ? [] : SERVICE_WORDS.filter(([k, re]) => re.test(t) && !asked.has(k)).map(([k]) => k);   // "what services do you offer?": naming the services IS the answer
  if (stray.length) out.push(`unrelated_services: do not mention ${stray.join(', ')} (the customer did not ask about them)`);
  if (COUNT_TALK.test(t) && !COUNT_TALK.test(v.customerText) && !/\b(count|measure|how many|panels?|sqm|square|how .{0,20}(compute|bill|final|charged)|final (amount|price|bill))\b/i.test(v.customerText)) out.push('measurement: do not explain counting or measuring unless the customer asked');
  const bookingOk = v.intent === 'booking_request' || v.ctx.booking_requested;
  if (BOOKING_OFFER.test(t) && !bookingOk) out.push('premature_booking: do not offer or suggest booking; the customer has not asked to book');
  if (q) {                                                                                                   // contact details belong to a booking, and come after the basics
    const topic = questionTopic(q); const need = nextBookingQuestion(v.ctx);
    if (['name', 'mobile', 'address'].includes(topic) && !bookingOk) out.push('premature_contact: do not ask for name, number or address unless the customer is booking');
    else if (['name', 'mobile', 'address'].includes(topic) && need && need.topic === 'location') out.push('wrong_order: ask for the location first');
  }
  if (pv) out.push(pv);
  if (sentences(t).some(minimumViolation)) out.push('minimum: every package has a minimum charge that is never prorated; a lower quantity still pays the full minimum (only the second service of a bundle has its minimum waived)');
  if (BUNDLE_BAD.test(t)) out.push('bundle: only the minimum of the second service is waived; never say it is free, discounted or at a lower rate, and never say there are no other charges');
  if (sentences(t).some((x) => PROMISES.test(x) && !NEGATES.test(x) && MARK_WORDS.test(x))) out.push('overpromise: never promise to remove marks, etching, stains or discolouration, or to prevent damage; say what we can and cannot do');
  if (ACID_ASK.test(v.customerText) && REMOVAL_ASK.test(v.customerText) && !SAYS_NO_REMOVAL.test(t)) out.push('policy: TopMop does not offer acid rain mark removal; say so kindly (damage varies, treatment can make it worse; regular cleaning only maintains the glass)');
  if (ASKS_QTY.test(t)) out.push('quantities: never ask for panel counts or measurements');
  return out;
}

const dropAll = (list: string[], re: RegExp) => list.filter((x) => !re.test(x));
/** Removes the offending sentences, keeps at most two and one question. Returns '' when nothing sensible is left. */
export function repairReply(reply: string, violations: string[], v: Check): string {
  let s = sentences(reply);
  const has = (k: string) => violations.some((x) => x.startsWith(k));
  if (has('premature_booking')) s = dropAll(s, BOOKING_OFFER);
  if (has('measurement')) s = dropAll(s, COUNT_TALK);
  if (has('photos')) s = dropAll(s, PHOTO_BAD);
  if (has('bundle')) s = dropAll(s, BUNDLE_BAD);
  if (has('minimum')) s = s.filter((x) => !minimumViolation(x));
  if (has('overpromise')) s = s.filter((x) => !(PROMISES.test(x) && !NEGATES.test(x) && MARK_WORDS.test(x)));
  if (has('quantities')) s = dropAll(s, ASKS_QTY);
  if (has('repeated_question')) s = s.filter((x) => !x.includes('?'));
  if (has('unrelated_services')) { const asked = new Set<ServiceKey>([...servicesIn(v.customerText), ...(v.ctx.services_seen ?? []), ...(v.ctx.service ? [v.ctx.service] : [])]); if (ACID_ASK.test(v.customerText)) asked.add('window'); s = s.filter((x) => SERVICE_WORDS.every(([k, re]) => !re.test(x) || asked.has(k))); }
  if (has('one_question')) { let seen = false; s = s.filter((x) => { if (!x.includes('?')) return true; if (seen) return false; seen = true; return true; }); }
  if (has('length')) s = s.slice(0, 2);
  return s.slice(0, 2).join(' ').trim();
}

/** A safe sentence for each situation (the AI wrote nothing, an integration failed, the reply could not be repaired). */
export function fallbackReply(v: Check, why: 'empty' | 'integration' | 'invalid' = 'invalid'): { text: string; handover: boolean } {
  const c = v.ctx;
  if (v.intent === 'complaint' || v.intent === 'human_assistance') return { text: "I'm sorry for the inconvenience po. I'll refer this to our team right away.", handover: true };
  if (why === 'integration') return { text: 'Let me have our team verify that for you po.', handover: true };
  if (ACID_ASK.test(v.customerText) && REMOVAL_ASK.test(v.customerText)) return { text: ACID_RAIN_REPLY, handover: false };   // the approved policy answer, always safe
  if (v.intent === 'booking_request' || c.booking_requested) { const q = nextBookingQuestion(c); if (q) return { text: q.topic === 'location' || q.topic === 'service' ? `Sure po, happy to help you book! ${q.text}` : q.text, handover: false }; return { text: 'Thank you po! Our team will confirm your booking details shortly.', handover: true }; }
  if (v.intent === 'price_inquiry') { if (!c.location) return { text: 'May I know your location (city) po so I can check the rate?', handover: false }; if (!c.service) return { text: 'Which cleaning service do you need po?', handover: false }; return { text: 'Our team will verify the exact rate for you po.', handover: true }; }
  if (c.acknowledgment) return { text: "You're welcome po!", handover: false };
  const hint = nextQuestionHint(c); if (hint) return { text: hint, handover: false };
  return { text: 'Let me have our team check that for you po.', handover: true };
}
export const ackReply = (): string => "You're welcome po! Just message us anytime.";
