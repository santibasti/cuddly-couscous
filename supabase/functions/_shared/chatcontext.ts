// Structured conversation memory for the customer-service chat (stored in chat_conversations.context).
// Pure logic with no network: what the customer has told us (location, service, surface, property, access, schedule), what they want right now (intent, stage),
// and what we have already said to them (explained, last question) read ONLY from replies that were really delivered, never from unsent drafts.
import { findRate } from './rates.ts';

/** A Philippine mobile number in a message or field: 09171234567, +63 917 123 4567, 639171234567 -> 09171234567 (undefined when there is none). */
export function mobileFrom(...parts: unknown[]): string | undefined {
  for (const raw of parts) {
    const t = String(raw ?? ''); const m = /(?:\+?63|0)?\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/.exec(t); if (!m) continue;
    const d = m[0].replace(/\D/g, ''); if (/^09\d{9}$/.test(d)) return d; if (/^639\d{9}$/.test(d)) return `0${d.slice(2)}`; if (/^9\d{9}$/.test(d)) return `0${d}`;
  }
  return undefined;
}
/** The booking-details form (the customer copies it and fills it in). Sent as its own message after a short first line. */
export const BOOKING_FORM = 'Please copy this and fill in your details po:\nName:\nAddress:\nContact Number:\nEmail:\nNo. of House Storey:\nReservation Date:\nService Window, Wall, Roof, Solar, Floor?';
export const BOOKING_SEND_FORM = `Sure po, happy to help you book!\n\n---\n\n${BOOKING_FORM}`;
export const isBookingForm = (t: string): boolean => /Reservation Date:/i.test(t ?? '') && /Contact Number:/i.test(t ?? '');
export type Intent = 'general_inquiry' | 'service_qualification' | 'price_inquiry' | 'technical_question' | 'booking_request' | 'complaint' | 'human_assistance';
export type Stage = 'understand' | 'assist' | 'confidence' | 'booking';
export type Topic = 'location' | 'service' | 'surface' | 'property' | 'access' | 'date' | 'booking' | 'name' | 'mobile' | 'address' | 'contact' | 'form' | 'other';
export interface Contact { name?: string; mobile?: string; email?: string; address?: string }
export type ServiceKey = 'window' | 'wall' | 'roof' | 'solar' | 'floor' | 'gutter' | 'ceiling' | 'acp' | 'facade';
export interface ChatContext {
  v: 1;
  location?: string; service?: ServiceKey; services_seen?: ServiceKey[]; surface?: 'interior' | 'exterior'; property?: 'residential' | 'commercial';
  access?: string; schedule?: string; contact?: Contact;
  intent: Intent; acknowledgment?: boolean; stage: Stage;
  /** from delivered replies only */
  last_question?: Topic; explained: string[]; price_quoted?: boolean; booking_offered?: boolean;
  booking_requested?: boolean;
  /** the booking-details form was delivered to the customer */
  form_sent?: boolean;
}
export const emptyContext = (): ChatContext => ({ v: 1, intent: 'general_inquiry', stage: 'understand', explained: [] });
/** Reads a stored context (jsonb) safely: anything missing or malformed becomes an empty field. */
export function readContext(raw: unknown): ChatContext {
  const c = emptyContext(); if (!raw || typeof raw !== 'object') return c; const r = raw as Record<string, unknown>;
  const str = (v: unknown, n = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  c.location = str(r.location); c.access = str(r.access); c.schedule = str(r.schedule);
  if (r.contact && typeof r.contact === 'object') { const k = r.contact as Record<string, unknown>; const ct: Contact = { name: str(k.name, 80), mobile: str(k.mobile, 20), email: str(k.email, 80), address: str(k.address, 200) }; if (Object.values(ct).some(Boolean)) c.contact = ct; }
  const sv = (v: unknown) => (['window', 'wall', 'roof', 'solar', 'floor', 'gutter', 'ceiling', 'acp', 'facade'].includes(String(v)) ? (v as ServiceKey) : undefined);
  c.service = sv(r.service); c.services_seen = Array.isArray(r.services_seen) ? (r.services_seen as unknown[]).map(sv).filter(Boolean) as ServiceKey[] : undefined;
  if (r.surface === 'interior' || r.surface === 'exterior') c.surface = r.surface; if (r.property === 'residential' || r.property === 'commercial') c.property = r.property;
  if (typeof r.intent === 'string') c.intent = r.intent as Intent; if (typeof r.stage === 'string') c.stage = r.stage as Stage;
  c.acknowledgment = r.acknowledgment === true; c.price_quoted = r.price_quoted === true; c.booking_offered = r.booking_offered === true; c.booking_requested = r.booking_requested === true; c.form_sent = r.form_sent === true;
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

/** Reads the booking-details form the customer filled in ("Name: ...", "Reservation Date: ..."). Empty lines and the untouched template line give nothing. */
export function parseForm(t: string): { name?: string; address?: string; mobile?: string; email?: string; storeys?: string; date?: string; service?: string } | null {
  if (!/Reservation Date\s*:/i.test(t)) return null;
  const out: Record<string, string> = {};
  for (const raw of t.split(/\n/)) {
    const m = /^\s*(name|full name|address|complete address|contact number|mobile|mobile number|contact|email|e-mail|no\.? of house storey|no\.? of storeys?|storeys?|reservation date|date|service)\s*[:\-]?\s*(.*)$/i.exec(raw); if (!m) continue;
    const k = m[1].toLowerCase(); let v = m[2].trim().replace(/^[:\-]\s*/, ''); if (!v || /^(window, wall, roof, solar, floor\??)$/i.test(v) || /window,\s*wall,\s*roof,\s*solar,\s*floor/i.test(v)) continue;
    const key = /name/.test(k) ? 'name' : /address/.test(k) ? 'address' : /contact|mobile/.test(k) ? 'mobile' : /mail/.test(k) ? 'email' : /stor/.test(k) ? 'storeys' : /date/.test(k) ? 'date' : 'service';
    if (key === 'mobile') { const mob = mobileFrom(v); v = mob ?? v; }
    out[key] = v.slice(0, 200);
  }
  return out;
}
export interface Facts { location?: string; service?: ServiceKey; surface?: 'interior' | 'exterior'; property?: 'residential' | 'commercial'; access?: string; schedule?: string; contact?: Contact }
/** What one customer message adds to what we know. `lastQuestion` = what we asked last (so a bare "Binondo" after "your location?" is read as a location). */
export function extractFacts(text: string, lastQuestion?: Topic, known: Facts & { booking_requested?: boolean } = {}): Facts {
  const t = String(text ?? '').trim(); const f: Facts = {}; if (!t) return f;
  const form = parseForm(t);
  const place = findRate(t)?.place; if (place) f.location = place;
  else {
    const m = /\b(?:in|sa|at|from|taga)\s+([A-ZÑ][\p{L}.'-]+(?:\s+[A-ZÑ][\p{L}.'-]+){0,2})/u.exec(t);
    if (m && !NOT_PLACE.test(m[1])) f.location = m[1].trim();
    else if (!servicesIn(t).length && /^[\p{L}.'\- ]{3,30}$/u.test(t) && t.split(/\s+/).length <= 3 && !NOT_PLACE.test(t) && !wantsToBook(t) && !ACK.test(t) && (lastQuestion === 'location' || (!known.location && /^[A-ZÑ]/.test(t)))) f.location = t.replace(/\s+/g, ' ');   // a bare word is a place only when we just asked for it, or when no place is known yet and it is written like a name
  }
  const sv = form ? servicesIn(form.service ?? '') : servicesIn(t); if (sv.length) f.service = sv[0];
  if (/\b(exterior|outside|outdoor|labas|external)\b/i.test(t)) f.surface = 'exterior'; else if (/\b(interior|inside|indoor|loob|internal)\b/i.test(t)) f.surface = 'interior';
  if (COMMERCIAL.test(t)) f.property = 'commercial'; else if (RESIDENTIAL.test(t)) f.property = 'residential';
  const acc = /\b(ground floor|1st floor|first floor|2nd floor|second floor|3rd floor|third floor|bungalow|single[- ]storey|two[- ]storey|three[- ]storey|\d{1,2}[- ]?(?:storey|story|floors?|levels?)|\d{1,2}(?:st|nd|rd|th) floor|penthouse|rooftop)\b/i.exec(t); if (acc) f.access = acc[0].toLowerCase();
  const sch = /\b(today|tomorrow|bukas|ngayon|next week|this week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i.exec(t); if (sch && (wantsToBook(t) || lastQuestion === 'date' || known.booking_requested || /\b(can|pwede|available|schedule|come|visit)\b/i.test(t))) f.schedule = sch[0].toLowerCase();
  // contact details, for a booking: labelled ("Name: ..."), said outright ("my name is ..."), or the answer to the question we just asked
  const ct: Contact = {};
  const mob = mobileFrom(t); if (mob) ct.mobile = mob;
  const em = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(t); if (em) ct.email = em[0];
  const nm = /(?:^|\n)\s*(?:full\s+)?name[ \t]*[:\-][ \t]*([^\n]{2,60})|\b(?:my name is|i am|i'm|this is|ako si|ako po si)\s+([A-ZÑ][\p{L}.'-]+(?:\s+[A-ZÑ][\p{L}.'-]+){0,3})/iu.exec(t);
  if (nm) ct.name = (nm[1] ?? nm[2]).trim().replace(/[.,]+$/, '');
  else if (lastQuestion === 'name' && /^[\p{L}.'\- ]{2,50}$/u.test(t) && t.split(/\s+/).length <= 5 && !ACK.test(t) && !YES.test(t) && !NOT_PLACE.test(t)) ct.name = t.replace(/\s+/g, ' ');
  const ad = /(?:^|\n)\s*(?:complete\s+)?(?:service\s+|property\s+|home\s+)?address(?:\s*\(with city\))?[ \t]*[:\-][ \t]*([^\n]{4,200})/i.exec(t);
  if (ad) ct.address = ad[1].trim(); else if (lastQuestion === 'address' && t.length >= 6 && !ACK.test(t) && !YES.test(t)) ct.address = t.replace(/\s+/g, ' ').slice(0, 200);
  if (lastQuestion === 'mobile' && !ct.mobile && /^[\d+\s()-]{7,20}$/.test(t)) ct.mobile = t.trim();
  if (form) { if (form.name) ct.name = form.name; if (form.address) ct.address = form.address; if (form.mobile) ct.mobile = form.mobile; if (form.email) ct.email = form.email; if (form.storeys) f.access = form.storeys.toLowerCase(); if (form.date) f.schedule = form.date; }
  if (Object.keys(ct).length) f.contact = ct;
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
  if (f.contact) n.contact = { ...(n.contact ?? {}), ...f.contact };
  if (f.location) n.location = f.location; if (f.surface) n.surface = f.surface; if (f.property) n.property = f.property; if (f.access) n.access = f.access; if (f.schedule) n.schedule = f.schedule;
  if (f.service) { if (n.service && n.service !== f.service) n.surface = f.surface; n.service = f.service; n.services_seen = [...new Set([...(n.services_seen ?? []), f.service])]; }   // a different service: the surface answered for the old one no longer applies
  return n;
}
export const deriveStage = (c: ChatContext): Stage => c.booking_requested || c.intent === 'booking_request' ? 'booking' : !c.location || !c.service ? 'understand' : c.price_quoted ? 'confidence' : 'assist';
/** Fold several unprocessed customer messages (oldest first) into the context. */
export function foldMessages(ctx: ChatContext, texts: string[]): ChatContext {
  let c = ctx;
  for (const t of texts) {
    const f = extractFacts(t, c.last_question, { location: c.location, booking_requested: c.booking_requested }); c = mergeFacts(c, f); const i = classifyIntent(t, c, f);
    const stay = c.booking_requested && !i.acknowledgment && (i.intent === 'service_qualification' || i.intent === 'general_inquiry');   // while a booking is being arranged, the customer's answers belong to it
    c = { ...c, intent: stay ? 'booking_request' : i.intent, acknowledgment: i.acknowledgment, booking_requested: c.booking_requested || i.intent === 'booking_request' };   // once the customer asked to book, scheduling talk stays allowed
  }
  return { ...c, stage: deriveStage(c) };
}

/* ---------- what we have already told the customer (delivered replies only) ---------- */
export function questionTopic(q: string): Topic {
  const s = q.toLowerCase();
  if (/\b(reservation date|what date|which date|preferred date|what day|when would|when do you want|date would you)\b/.test(s)) return 'date';
  if (/\b(full name|your name|name po|may i have your name)\b/.test(s)) return 'name';
  if (/\b(mobile|contact number|phone|number to reach|best number)\b/.test(s)) return 'mobile';
  if (/\b(complete address|full address|street|house number|property address|address of)\b/.test(s)) return 'address';
  if (/\b(book|booking|reserve|reservation|appointment|schedule)\b/.test(s)) return 'booking';
  if (/\b(location|city|where)\b/.test(s)) return 'location';
  if (/\b(interior|exterior|inside|outside|indoor|outdoor)\b/.test(s)) return 'surface';
  if (/\b(residential|commercial|house|business|property type|home or)\b/.test(s)) return 'property';
  if (/\b(floor|storey|story|level|access|height|how tall|how high)\b/.test(s)) return 'access';
  if (/\b(which|what|type of)\b.{0,25}\b(service|cleaning)\b|\bservice (do you|would you|you need)/.test(s)) return 'service';
  if (/\b(name|email)\b/.test(s)) return 'contact';
  return 'other';
}
export const lastQuestionOf = (text: string): string | undefined => { const qs = String(text ?? '').split(/(?<=[.!?])\s+/).filter((x) => x.includes('?')); return qs.length ? qs[qs.length - 1].trim() : undefined; };
/** From the replies the customer really received (oldest first). */
export function analyzeDelivered(replies: string[]): { explained: string[]; lastQuestion?: Topic; priceQuoted: boolean; bookingOffered: boolean; formSent: boolean } {
  const ex = new Set<string>(); let priceQuoted = false, bookingOffered = false, formSent = false;
  for (const r of replies) {
    if (/TopMop offers professional exterior cleaning/i.test(r)) ex.add('welcome');
    if (/(on-?site|exact panel count|final count|counting).{0,80}(count|measure|bill)|panels? (is|are)? ?counted|one side of a (glass )?panel/i.test(r)) ex.add('counting');
    if (/preliminary ocular visit/i.test(r)) ex.add('ocular_residential'); if (/ocular fee/i.test(r)) ex.add('ocular_commercial');
    if (/₱\s?\d/.test(r)) priceQuoted = true;
    if (isBookingForm(r)) formSent = true;
    if (/(would you like to|ready to|want to) (book|schedule|reserve)|book a date|set an? appointment|booking details|Reservation Date:/i.test(r)) bookingOffered = true;
  }
  const lastReply = replies.length ? replies[replies.length - 1] : '';
  const last = lastReply ? lastQuestionOf(lastReply) : undefined;
  return { explained: [...ex], lastQuestion: isBookingForm(lastReply) ? 'form' : last ? questionTopic(last) : undefined, priceQuoted, bookingOffered, formSent };
}
export function applyDelivered(ctx: ChatContext, d: ReturnType<typeof analyzeDelivered>): ChatContext {
  const c = { ...ctx, explained: d.explained, last_question: d.lastQuestion, price_quoted: d.priceQuoted || ctx.price_quoted, booking_offered: d.bookingOffered, form_sent: d.formSent || ctx.form_sent };
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
  booking_request: 'The customer wants to book. Booking uses the booking-details form that the system sends once the city is known (see BOOKING FORM / NEXT BOOKING QUESTION). Do not write the form yourself.',
  complaint: 'Apologise in one short sentence and use needs_human. Do not argue, offer refunds or sell anything.',
  human_assistance: 'Use needs_human and tell the customer a team member will take over.',
};
/** Booking uses the booking-details form: once the city is known the form goes out as its own message; the customer fills it in and only what is still missing is asked for. `null` = everything needed is known. */
const FORM_LABEL = (c: ChatContext): string[] => [!c.service && 'the service (window, wall, roof, solar or floor)', !c.schedule && 'your reservation date', !c.contact?.name && 'your full name', !c.contact?.mobile && 'your contact number', !c.contact?.address && 'the complete address'].filter(Boolean) as string[];
const joinList = (a: string[]): string => a.length <= 1 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
export function nextBookingQuestion(c: ChatContext): { topic: Topic; text: string } | null {
  if (!c.location) return { topic: 'location', text: 'May I know your location (city) po?' };
  if (!c.form_sent) return { topic: 'form', text: BOOKING_SEND_FORM };
  const miss = FORM_LABEL(c); if (miss.length) return { topic: 'contact', text: `Thank you po! To complete the booking, may I also have ${joinList(miss)}?` };
  return null;
}
export function contextBlock(c: ChatContext): string {
  const known = [c.location && `location: ${c.location}`, c.service && `service: ${serviceName(c.service)}`, c.surface && `surface: ${c.surface}`, c.property && `property: ${c.property}`, c.access && `building level/access: ${c.access}`, c.schedule && `preferred schedule: ${c.schedule}`, c.contact?.name && `customer name: ${c.contact.name}`, c.contact?.mobile && `mobile: ${c.contact.mobile}`, c.contact?.address && `property address: ${c.contact.address}`, c.contact?.email && `email: ${c.contact.email}`].filter(Boolean);
  const hint = nextQuestionHint(c);
  return [
    `KNOWN FACTS (from the customer's own messages; never ask for these again): ${known.length ? known.join('; ') : 'nothing yet'}.`,
    c.last_question ? `LAST QUESTION WE ASKED (delivered to the customer): ${c.last_question}. Do not ask it again.` : '',
    c.explained.length ? `ALREADY EXPLAINED to the customer (do not repeat): ${c.explained.join(', ')}.` : '',
    c.price_quoted ? 'A price was already given to the customer.' : '',
    `CURRENT INTENT: ${c.intent}${c.acknowledgment ? ' (a simple acknowledgment)' : ''}. STAGE: ${c.stage}. ${NEXT[c.intent]}`,
    c.intent === 'booking_request' || c.booking_requested ? (() => { const q = nextBookingQuestion(c); return q ? (q.topic === 'form' ? 'BOOKING FORM: the system sends the booking-details form by itself; do not write the form and do not ask for the details one by one.' : `NEXT BOOKING QUESTION (ask exactly this one, nothing else): ${q.text}`) : 'ALL BOOKING DETAILS ARE KNOWN (the form is filled in): first check the reservation date with check_date. If it is open call book_date with the service, date, name, mobile, address, email and storeys (the system writes the confirmation); if it is not open, say so and offer the nearest open dates, and ask which one they prefer.'; })() : hint ? `SUGGESTED NEXT QUESTION (only if it is really needed): ${hint}` : '',
  ].filter(Boolean).join('\n');
}
