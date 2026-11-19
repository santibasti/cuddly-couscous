// Checks a reply before it goes to ManyChat, repairs it when it can, and falls back to a safe sentence when it cannot. Pure logic, no network.
import { type ChatContext, type Intent, type ServiceKey, lastQuestionOf, questionTopic, servicesIn, nextQuestionHint } from './chatcontext.ts';
import { tooTagalog } from './brain.ts';

export interface Check { ctx: ChatContext; intent: Intent; customerText: string; previousAi: string[]; first?: boolean }
const FIXED = /ocular|Please copy this and fill in your details|^\s*Sure po, happy to help you book|^\s*Thank you po! Our technical team|^\s*Sure po, you may send them|^\s*Your booking is set for|TopMop provides professional exterior cleaning/i;
const sentences = (t: string) => String(t ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const wordsIn = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const BOOKING_OFFER = /(would you like|want|ready|interested|shall we|can i|may i|let me|i can) .{0,25}(to )?(book|schedule|reserve|set (?:up )?an? (?:appointment|booking|date))|book(?:ing)? a date|set an? appointment|available dates?|reservation/i;
const COUNT_TALK = /(on-?site|onsite).{0,70}(count|measure)|counting and .{0,40}measurement|final count|panel count|exact panel|count(?:s|ed)? the panels|square met(?:er|re)s/i;
const ASKS_QTY = /how many (glass |solar )?(panels?|windows?)|how big|square met(?:er|re)s?\b.*\?|\bsqm\b.*\?|what(?:'s| is) the (?:size|area)|measurements? of/i;
const ASKS_PHOTO = /\b(send|share|upload|provide|attach|take)\b.{0,25}\b(photos?|pictures?|pics?|videos?|images?)\b/i;
const SERVICE_WORDS: [ServiceKey, RegExp][] = [['window', /\b(window|glass)\b/i], ['wall', /\bwalls?\b/i], ['roof', /\broof(?:ing)?\b/i], ['solar', /\bsolar\b/i], ['floor', /\b(floor|driveway)\s*(?:cleaning|washing)\b|\bfloor and\b/i], ['gutter', /\bgutters?\b/i]];

/** Machine-readable violations; an empty list means the reply may go out. */
export function validateReply(reply: string, v: Check): string[] {
  const t = String(reply ?? '').trim(); if (!t) return ['empty'];
  if (FIXED.test(t) || t.includes('\n\n---\n\n')) return [];                       // approved fixed texts and the welcome are exempt
  const out: string[] = []; const s = sentences(t);
  if (tooTagalog(t)) out.push('language: write in English or English-dominant Taglish, never Tagalog sentences');
  if (s.length > 2 || wordsIn(t) > 45) out.push('length: at most two short sentences, preferably under 35 words');
  const qs = (t.match(/\?/g) ?? []).length; if (qs > 1) out.push('one_question: ask only one question');
  const q = lastQuestionOf(t);
  if (q) {
    const topic = questionTopic(q); const c = v.ctx;
    const known = (topic === 'location' && c.location) || (topic === 'service' && c.service) || (topic === 'surface' && c.surface) || (topic === 'property' && c.property) || (topic === 'access' && c.access) || (topic === 'date' && c.schedule);
    if (known) out.push(`repeated_question: the customer already told us the ${topic}; do not ask it again`);
    const prev = v.previousAi.length ? lastQuestionOf(v.previousAi[v.previousAi.length - 1]) : undefined;
    if (prev && prev.toLowerCase().replace(/\W+/g, ' ') === q.toLowerCase().replace(/\W+/g, ' ')) out.push('repeated_question: this is the same question we just asked');
  }
  const asked = new Set<ServiceKey>([...servicesIn(v.customerText), ...(v.ctx.services_seen ?? []), ...(v.ctx.service ? [v.ctx.service] : [])]);
  const stray = SERVICE_WORDS.filter(([k, re]) => re.test(t) && !asked.has(k)).map(([k]) => k);
  if (stray.length) out.push(`unrelated_services: do not mention ${stray.join(', ')} (the customer did not ask about them)`);
  if (COUNT_TALK.test(t) && !COUNT_TALK.test(v.customerText) && !/\b(count|measure|how many|panels?|sqm|square|how .{0,20}(compute|bill|final|charged)|final (amount|price|bill))\b/i.test(v.customerText)) out.push('measurement: do not explain counting or measuring unless the customer asked');
  const bookingOk = v.intent === 'booking_request' || v.ctx.booking_requested;
  if (BOOKING_OFFER.test(t) && !bookingOk) out.push('premature_booking: do not offer or suggest booking; the customer has not asked to book');
  if (ASKS_PHOTO.test(t)) out.push('photos: never ask for photos or videos');
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
  if (has('photos')) s = dropAll(s, ASKS_PHOTO);
  if (has('quantities')) s = dropAll(s, ASKS_QTY);
  if (has('repeated_question')) s = s.filter((x) => !x.includes('?'));
  if (has('unrelated_services')) { const asked = new Set<ServiceKey>([...servicesIn(v.customerText), ...(v.ctx.services_seen ?? []), ...(v.ctx.service ? [v.ctx.service] : [])]); s = s.filter((x) => SERVICE_WORDS.every(([k, re]) => !re.test(x) || asked.has(k))); }
  if (has('one_question')) { let seen = false; s = s.filter((x) => { if (!x.includes('?')) return true; if (seen) return false; seen = true; return true; }); }
  if (has('length')) s = s.slice(0, 2);
  return s.slice(0, 2).join(' ').trim();
}

/** A safe sentence for each situation (the AI wrote nothing, an integration failed, the reply could not be repaired). */
export function fallbackReply(v: Check, why: 'empty' | 'integration' | 'invalid' = 'invalid'): { text: string; handover: boolean } {
  const c = v.ctx;
  if (v.intent === 'complaint' || v.intent === 'human_assistance') return { text: "I'm sorry for the inconvenience po. I'll refer this to our team right away.", handover: true };
  if (why === 'integration') return { text: 'Let me have our team verify that for you po.', handover: true };
  if (v.intent === 'booking_request') { if (!c.location) return { text: 'Sure po, happy to help you book! May I know your location (city) po?', handover: false }; if (!c.service) return { text: 'Sure po! Which cleaning service would you like to book?', handover: false }; }
  if (v.intent === 'price_inquiry') { if (!c.location) return { text: 'May I know your location (city) po so I can check the rate?', handover: false }; if (!c.service) return { text: 'Which cleaning service do you need po?', handover: false }; return { text: 'Our team will verify the exact rate for you po.', handover: true }; }
  if (c.acknowledgment) return { text: "You're welcome po!", handover: false };
  const hint = nextQuestionHint(c); if (hint) return { text: hint, handover: false };
  return { text: 'Let me have our team check that for you po.', handover: true };
}
export const ackReply = (): string => "You're welcome po! Just message us anytime.";
