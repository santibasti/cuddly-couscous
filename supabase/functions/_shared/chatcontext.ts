// Structured conversation memory for the customer-service chat (stored in chat_conversations.context).
// Pure logic with no network: what the customer has told us (location, service, surface, property, access, schedule), what they want right now (intent, stage),
// and what we have already said to them (explained, last question) read ONLY from replies that were really delivered, never from unsent drafts.
import { findRate } from './rates.ts';

export type Intent = 'general_inquiry' | 'service_qualification' | 'price_inquiry' | 'technical_question' | 'booking_request' | 'complaint' | 'human_assistance';
export type Stage = 'understand' | 'assist' | 'confidence' | 'booking';
export type Topic = 'location' | 'service' | 'surface' | 'property' | 'access' | 'date' | 'booking' | 'contact' | 'other';
export type ServiceKey = 'window' | 'wall' | 'roof' | 'solar' | 'floor' | 'gutter' | 'ceiling' | 'acp' | 'facade';
export interface ChatContext {
  v: 1;
  location?: string; service?: ServiceKey; services_seen?: ServiceKey[]; surface?: 'interior' | 'exterior'; property?: 'residential' | 'commercial';
  access?: string; schedule?: string;
  intent: Intent; acknowledgment?: boolean; stage: Stage;
  /** from delivered replies only */
  last_question?: Topic; explained: string[]; price_quoted?: boolean; booking_offered?: boolean;
  booking_requested?: boolean;
}
export const emptyContext = (): ChatContext => ({ v: 1, intent: 'general_inquiry', stage: 'understand', explained: [] });
/** Reads a stored context (jsonb) safely: anything missing or malformed becomes an empty field. */
export function readContext(raw: unknown): ChatContext {
  const c = emptyContext(); if (!raw || typeof raw !== 'object') return c; const r = raw as Record<string, unknown>;
  const str = (v: unknown, n = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  c.location = str(r.location); c.access = str(r.access); c.schedule = str(r.schedule);
  const sv = (v: unknown) => (['window', 'wall', 'roof', 'solar', 'floor', 'gutter', 'ceiling', 'acp', 'facade'].includes(String(v)) ? (v as ServiceKey) : undefined);
  c.service = sv(r.service); c.services_seen = Array.isArray(r.services_seen) ? (r.services_seen as unknown[]).map(sv).filter(Boolean) as ServiceKey[] : undefined;
  if (r.surface === 'interior' || r.surface === 'exterior') c.surface = r.surface; if (r.property === 'residential' || r.property === 'commercial') c.property = r.property;
  if (typeof r.intent === 'string') c.intent = r.intent as Intent; if (typeof r.stage === 'string') c.stage = r.stage as Stage;
  c.acknowledgment = r.acknowledgment === true; c.price_quoted = r.price_quoted === true; c.booking_offered = r.booking_offered === true; c.booking_requested = r.booking_requested === true;
  if (typeof r.last_question === 'string') c.last_question = r.last_question as Topic; if (Array.isArray(r.explained)) c.explained = (r.explained as unknown[]).filter((x) => typeof x === 'string').slice(0, 20) as string[];
  return c;
}

/* ---------- what the customer said ---------- */
const SERVICES: [ServiceKey, RegExp][] = [
  ['solar', /\bsolar\b/i], ['window', /\b(windows?|glass|salamin|bintana|panes?|curtain\s*wall)\b/i], ['wall', /\b(walls?|pader|exterior wall)\b/i], ['roof', /\b(roof(?:ing)?|bubong)\b/i],
  ['floor', /\b(floors?|driveway|hardscape|sahig|pressure wash(?:ing)?)\b/i], ['gutter', /\bgutters?\b/i], ['ceiling', /\bceilings?\b/i], ['acp', /\b(acp|cladding)\b/i], ['facade', /\b(fa[cç]ade)\b/i],
];
const LEVELS = /\b(?:ground|first|second|third|fourth|top|upper|lower|\d{1,2}(?:st|nd|rd|th)?|one|two|three|four|five)[- ]?(?:floors?|storey|story|storeys|stories|levels?)\b|\bfloors?\s*(?:level|number|no\.?)?\s*\d{1,2}\b/gi;   // "ground floor" is a building level, not floor cleaning
export const servicesIn = (t0: string): ServiceKey[] => { const t = t0.replace(LEVELS, ' '); return SERVICES.map(([k, re]) => ({ k, i: t.search(re) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.k); };
const COMMERCIAL = /\b(commercial|office|company|corp(?:oration)?|store|shop|mall|hotel|restaurant|warehouse|factory|school|church|hospital|clinic|bank|building|establishment|business|dealership|condominium association)\b/i;
const RESIDENTIAL = /\b(house|home|bahay|residential|apartment|townhouse|townhome|villa|subdivision|bungalow)\b/i;
const NOT_PLACE = /^(hi|hello|hey|ok(?:ay)?|yes|no|thanks?|thank you|sige|salamat|po|opo|how much|magkano|price|hm|good (?:morning|afternoon|evening)|noted|exterior|interior|inside|outside|ground floor|window|wall|roof|solar|floor|gutter)\b/i;
export const wantsToBook = (t: string) => /\b(book|booking|reserve|reservation|schedule|appointment|magpa-?book|mag-?book|magpa-?schedule|pa-?book|pa-?schedule|paano.{0,20}(book|magpa))/i.test(t ?? '');
const ACK = /^\s*(?:ok(?:ay)?|okey|thanks?|thank you|thank u|salamat|noted|sige|alright|got it|will do|👍|🙏)(?:[\s.!,]*(?:po|opo|you|so much|ma'?am|sir|noted|thanks?|salamat|na|lang))*[\s.!,]*$/i;
const YES = /^\s*(?:yes|yes please|yeah|yep|oo|opo|sige|sure|please do|go ahead|let'?s (?:do it|proceed|book)|gusto ko|i want (?:to )?(?:book|proceed)|please book|proceed)[\s.!,]*(?:po)?[\s.!]*$/i;
export const isAcknowledgment = (t: string) => ACK.test(String(t ?? ''));
export const isYes = (t: string) => YES.test(String(t ?? '')) && !ACK.test(String(t ?? '').replace(/^\s*sige\b/i, 'sigex'));   // a bare "ok", "thanks" or "noted" is never a yes to a booking offer

export interface Facts { location?: string; service?: ServiceKey; surface?: 'interior' | 'exterior'; property?: 'residential' | 'commercial'; access?: string; schedule?: string }
/** What one customer message adds to what we know. `lastQuestion` = what we asked last (so a bare "Binondo" after "your location?" is read as a location). */
export function extractFacts(text: string, lastQuestion?: Topic, known: Facts = {}): Facts {
  const t = String(text ?? '').trim(); const f: Facts = {}; if (!t) return f;
  const place = findRate(t)?.place; if (place) f.location = place;
  else {
    const m = /\b(?:in|sa|at|from|taga)\s+([A-ZÑ][\p{L}.'-]+(?:\s+[A-ZÑ][\p{L}.'-]+){0,2})/u.exec(t);
    if (m && !NOT_PLACE.test(m[1])) f.location = m[1].trim();
    else if (!servicesIn(t).length && /^[\p{L}.'\- ]{3,30}$/u.test(t) && t.split(/\s+/).length <= 3 && !NOT_PLACE.test(t) && !wantsToBook(t) && !ACK.test(t) && (lastQuestion === 'location' || (!known.location && /^[A-ZÑ]/.test(t)))) f.location = t.replace(/\s+/g, ' ');   // a bare word is a place only when we just asked for it, or when no place is known yet and it is written like a name
  }
  const sv = servicesIn(t); if (sv.length) f.service = sv[0];
  if (/\b(exterior|outside|outdoor|labas|external)\b/i.test(t)) f.surface = 'exterior'; else if (/\b(interior|inside|indoor|loob|internal)\b/i.test(t)) f.surface = 'interior';
  if (COMMERCIAL.test(t)) f.property = 'commercial'; else if (RESIDENTIAL.test(t)) f.property = 'residential';
  const acc = /\b(ground floor|1st floor|first floor|2nd floor|second floor|3rd floor|third floor|bungalow|single[- ]storey|two[- ]storey|three[- ]storey|\d{1,2}[- ]?(?:storey|story|floors?|levels?)|\d{1,2}(?:st|nd|rd|th) floor|penthouse|rooftop)\b/i.exec(t); if (acc) f.access = acc[0].toLowerCase();
  const sch = /\b(today|tomorrow|bukas|ngayon|next week|this week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i.exec(t); if (sch && wantsToBook(t) || (sch && /\b(can|pwede|available|schedule|come|visit)\b/i.test(t))) f.schedule = sch[0];
  return f;
}
const HUMAN = /\b(speak|talk|connect|transfer|call)\b.{0,30}\b(person|human|agent|staff|admin|manager|someone|owner|representative)\b|\b(real person|human agent|your manager|owner)\b|kausapin|tao\b/i;
const COMPLAINT = /\b(complain|complaint|reklamo|refund|damaged?|sira|scratch(?:ed)?|missed|not satisfied|unsatisfied|disappointed|bad service|poor|nabasag|broken|insulto)\b/i;
const PRICE = /\b(how much|magkano|price|prices|pricing|rate|rates|cost|presyo|estimate|quote|quotation|hm|how much po|fee|charge)\b/i;
const TECH = /\b(how|why|what|is it safe|safe|method|process|does|do you|can you|can it|will it|stain|scratch|guarantee|water|chemical|equipment|ladder|height|storey|manlift|pressure|soft ?wash|algae|mold|rust|paint|how long|duration)\b/i;
export function classifyIntent(text: string, ctx: ChatContext, facts: Facts = {}): { intent: Intent; acknowledgment: boolean } {
  const t = String(text ?? '').trim();
  if (isAcknowledgment(t)) return { intent: ctx.intent === 'booking_request' ? 'booking_request' : 'general_inquiry', acknowledgment: true };
  if (HUMAN.test(t)) return { intent: 'human_assistance', acknowledgment: false };
  if (COMPLAINT.test(t)) return { intent: 'complaint', acknowledgment: false };
  if (wantsToBook(t) || (ctx.last_question === 'booking' && isYes(t))) return { intent: 'booking_request', acknowledgment: false };
  if (PRICE.test(t)) return { intent: 'price_inquiry', acknowledgment: false };
  if (/\?\s*$/.test(t) && TECH.test(t)) return { intent: 'technical_question', acknowledgment: false };
  if (Object.keys(facts).length) return { intent: 'service_qualification', acknowledgment: false };
  return { intent: TECH.test(t) && /\?/.test(t) ? 'technical_question' : 'general_inquiry', acknowledgment: false };
}

/** Adds what a message told us to what we knew. The newest value wins (a correction replaces the old one); a field the message does not mention is kept. */
export function mergeFacts(ctx: ChatContext, f: Facts): ChatContext {
  const n: ChatContext = { ...ctx, explained: [...ctx.explained] };
  if (f.location) n.location = f.location; if (f.surface) n.surface = f.surface; if (f.property) n.property = f.property; if (f.access) n.access = f.access; if (f.schedule) n.schedule = f.schedule;
  if (f.service) { if (n.service && n.service !== f.service) n.surface = f.surface; n.service = f.service; n.services_seen = [...new Set([...(n.services_seen ?? []), f.service])]; }   // a different service: the surface answered for the old one no longer applies
  return n;
}
export const deriveStage = (c: ChatContext): Stage => c.booking_requested || c.intent === 'booking_request' ? 'booking' : !c.location || !c.service ? 'understand' : c.price_quoted ? 'confidence' : 'assist';
/** Fold several unprocessed customer messages (oldest first) into the context. */
export function foldMessages(ctx: ChatContext, texts: string[]): ChatContext {
  let c = ctx;
  for (const t of texts) {
    const f = extractFacts(t, c.last_question, { location: c.location }); c = mergeFacts(c, f); const i = classifyIntent(t, c, f);
    const stay = c.booking_requested && !i.acknowledgment && (i.intent === 'service_qualification' || i.intent === 'general_inquiry');   // while a booking is being arranged, the customer's answers belong to it
    c = { ...c, intent: stay ? 'booking_request' : i.intent, acknowledgment: i.acknowledgment, booking_requested: c.booking_requested || i.intent === 'booking_request' };   // once the customer asked to book, scheduling talk stays allowed
  }
  return { ...c, stage: deriveStage(c) };
}

/* ---------- what we have already told the customer (delivered replies only) ---------- */
export function questionTopic(q: string): Topic {
  const s = q.toLowerCase();
  if (/\b(reservation date|what date|which date|preferred date|when would|what day)\b/.test(s)) return 'date';
  if (/\b(book|booking|reserve|reservation|appointment|schedule)\b/.test(s)) return 'booking';
  if (/\b(location|city|where|address)\b/.test(s)) return 'location';
  if (/\b(interior|exterior|inside|outside|indoor|outdoor)\b/.test(s)) return 'surface';
  if (/\b(residential|commercial|house|business|property type|home or)\b/.test(s)) return 'property';
  if (/\b(floor|storey|story|level|access|height|how tall|how high)\b/.test(s)) return 'access';
  if (/\b(which|what|type of)\b.{0,25}\b(service|cleaning)\b|\bservice (do you|would you|you need)/.test(s)) return 'service';
  if (/\b(name|mobile|number|email|contact)\b/.test(s)) return 'contact';
  return 'other';
}
export const lastQuestionOf = (text: string): string | undefined => { const qs = String(text ?? '').split(/(?<=[.!?])\s+/).filter((x) => x.includes('?')); return qs.length ? qs[qs.length - 1].trim() : undefined; };
/** From the replies the customer really received (oldest first). */
export function analyzeDelivered(replies: string[]): { explained: string[]; lastQuestion?: Topic; priceQuoted: boolean; bookingOffered: boolean } {
  const ex = new Set<string>(); let priceQuoted = false, bookingOffered = false;
  for (const r of replies) {
    if (/TopMop provides professional exterior cleaning/i.test(r)) ex.add('welcome');
    if (/(on-?site|exact panel count|final count|counting).{0,80}(count|measure|bill)|panels? (is|are)? ?counted|one side of a (glass )?panel/i.test(r)) ex.add('counting');
    if (/preliminary ocular visit/i.test(r)) ex.add('ocular_residential'); if (/ocular fee/i.test(r)) ex.add('ocular_commercial');
    if (/₱\s?\d/.test(r)) priceQuoted = true;
    if (/(would you like to|ready to|want to) (book|schedule|reserve)|book a date|set an? appointment|booking details|Reservation Date:/i.test(r)) bookingOffered = true;
  }
  const last = replies.length ? lastQuestionOf(replies[replies.length - 1]) : undefined;
  return { explained: [...ex], lastQuestion: last ? questionTopic(last) : undefined, priceQuoted, bookingOffered };
}
export function applyDelivered(ctx: ChatContext, d: ReturnType<typeof analyzeDelivered>): ChatContext {
  const c = { ...ctx, explained: d.explained, last_question: d.lastQuestion, price_quoted: d.priceQuoted || ctx.price_quoted, booking_offered: d.bookingOffered };
  return { ...c, stage: deriveStage(c) };
}

/* ---------- what the AI is told ---------- */
const SERVICE_NAME: Record<ServiceKey, string> = { window: 'window/glass cleaning', wall: 'wall cleaning', roof: 'roof cleaning', solar: 'solar panel cleaning', floor: 'floor/driveway washing', gutter: 'gutter cleaning', ceiling: 'ceiling cleaning', acp: 'ACP cleaning', facade: 'façade cleaning' };
export const serviceName = (k?: ServiceKey) => (k ? SERVICE_NAME[k] : undefined);
/** A natural next question for the service, only when something useful is still unknown. */
export function nextQuestionHint(c: ChatContext): string | undefined {
  if (!c.location) return 'May I know your location (city) po?';
  if (!c.service) return 'Which cleaning service do you need po?';
  if ((c.service === 'wall') && !c.surface) return 'Is it for the exterior or the interior walls po?';
  if (c.service === 'roof' && !c.property) return 'Is it a house or a commercial building po?';
  if ((c.service === 'window') && !c.access) return 'Is it a one-storey or a multi-storey house po?';
  if (c.service === 'solar' || c.service === 'floor') return undefined;
  if (!c.access && (c.service === 'wall' || c.service === 'roof')) return 'How many floors is the building po?';
  return undefined;
}
const NEXT: Record<Intent, string> = {
  general_inquiry: 'Answer directly in one or two short sentences. Ask a question only if it is needed to help.',
  service_qualification: 'Acknowledge what they told you and, only if still needed, ask the ONE most useful next question (see SUGGESTED NEXT QUESTION). Do not quote a price unless asked and do not mention booking.',
  price_inquiry: 'If the location and the service are known, call estimate and give the price plainly. If one is missing, ask only for the missing one. Do not mention booking.',
  technical_question: 'Answer the question directly and briefly from the rulebook. No sales, no booking.',
  booking_request: 'The customer wants to book. If the location or the service is missing ask only for the missing one. When both are known check the date with check_date (if they gave one) and then send the booking form.',
  complaint: 'Apologise in one short sentence and use needs_human. Do not argue, offer refunds or sell anything.',
  human_assistance: 'Use needs_human and tell the customer a team member will take over.',
};
export function contextBlock(c: ChatContext): string {
  const known = [c.location && `location: ${c.location}`, c.service && `service: ${serviceName(c.service)}`, c.surface && `surface: ${c.surface}`, c.property && `property: ${c.property}`, c.access && `building level/access: ${c.access}`, c.schedule && `preferred schedule: ${c.schedule}`].filter(Boolean);
  const hint = nextQuestionHint(c);
  return [
    `KNOWN FACTS (from the customer's own messages; never ask for these again): ${known.length ? known.join('; ') : 'nothing yet'}.`,
    c.last_question ? `LAST QUESTION WE ASKED (delivered to the customer): ${c.last_question}. Do not ask it again.` : '',
    c.explained.length ? `ALREADY EXPLAINED to the customer (do not repeat): ${c.explained.join(', ')}.` : '',
    c.price_quoted ? 'A price was already given to the customer.' : '',
    `CURRENT INTENT: ${c.intent}${c.acknowledgment ? ' (a simple acknowledgment)' : ''}. STAGE: ${c.stage}. ${NEXT[c.intent]}`,
    c.intent !== 'booking_request' && !c.booking_requested && hint ? `SUGGESTED NEXT QUESTION (only if it is really needed): ${hint}` : '',
  ].filter(Boolean).join('\n');
}
/** The booking form, without the lines the customer already answered. */
export function bookingForm(c: ChatContext): string {
  const lines = ['Name:', 'Address:', 'Contact Number:', 'Email:', ...(c.access ? [] : ['No. of House Storey:']), ...(c.schedule ? [] : ['Reservation Date:']), ...(c.service ? [] : ['Service Window, Wall, Roof, Solar, Floor?'])];
  return `Please copy this and fill in your details po:\n${lines.join('\n')}`;
}
