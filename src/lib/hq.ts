// TOPMOP AI Headquarters: the roster of agents (the automated desks of the business), and how an agent's visible state is worked out from REAL events.
// An event is a fact written by the database (a new inquiry, a quotation sent, a booking created...). Nothing here invents work: an agent only shows as working, coordinating,
// waiting for approval, done or in error because a real event says so (or, in DEMO MODE, because a clearly labelled demo script says so). Agents with no real feed yet are "planned"
// and can only idle or relax in the café.

export type DeptKey = 'hub' | 'email' | 'creative' | 'ads' | 'desk' | 'booking' | 'hr' | 'board' | 'cafe';
export interface Dept { key: DeptKey; name: string; icon: string; x: number; y: number; w: number; h: number; blurb: string }
export interface AgentDef { key: string; name: string; role: string; dept: Exclude<DeptKey, 'cafe'>; hair: string; skin: string; shirt: string; live: boolean; skills: string[] }
export type EventKind = 'start' | 'done' | 'fail' | 'approval' | 'message' | 'info';
export interface HqEvent { id: number | string; at: string; agent: string; dept: string; kind: EventKind; title: string; ref?: string | null; to_agent?: string | null }
export type AgentState = 'idle' | 'received' | 'working' | 'coordinating' | 'awaiting' | 'done' | 'blocked' | 'error' | 'social';

/** The floor plan: seven departments around the Chief of Staff, and the café. x, y, w, h are percentages of the scene. */
export const DEPTS: Dept[] = [
  { key: 'email', name: 'Email Operations', icon: '✉️', x: 1, y: 1, w: 32, h: 31, blurb: 'Outlook inbox, replies and follow-ups' },
  { key: 'creative', name: 'Creative Studio', icon: '🎬', x: 34, y: 1, w: 32, h: 31, blurb: 'Photos, video and social posts' },
  { key: 'ads', name: 'Ads Manager Team', icon: '📈', x: 67, y: 1, w: 32, h: 31, blurb: 'Meta advertising results' },
  { key: 'desk', name: 'Inquiry Desk', icon: '💬', x: 1, y: 34, w: 32, h: 31, blurb: 'Facebook and other inquiries' },
  { key: 'hub', name: 'JARVIS · Chief of Staff', icon: '🧠', x: 34, y: 34, w: 32, h: 31, blurb: 'Watches every department' },
  { key: 'booking', name: 'Booking & Scheduling', icon: '📅', x: 67, y: 34, w: 32, h: 31, blurb: 'Quotations, bookings, crew and job orders' },
  { key: 'hr', name: 'Human Resources', icon: '🧑‍💼', x: 1, y: 67, w: 32, h: 32, blurb: 'Records, attendance and training' },
  { key: 'cafe', name: 'AI Café', icon: '☕', x: 34, y: 67, w: 32, h: 32, blurb: 'Where idle agents take a break' },
  { key: 'board', name: 'Board Room', icon: '🏛️', x: 67, y: 67, w: 32, h: 32, blurb: 'Strategic advisors' },
];

const A = (key: string, name: string, role: string, dept: AgentDef['dept'], hair: string, skin: string, shirt: string, live: boolean, skills: string[]): AgentDef => ({ key, name, role, dept, hair, skin, shirt, live, skills });
export const AGENTS: AgentDef[] = [
  A('jarvis', 'JARVIS', 'Chief of Staff', 'hub', '#9fd3ff', '#f2c9a0', '#2f6df6', true, ['Morning brief', 'Instant alerts', 'Answers questions', 'Learns from you', 'Weather warnings']),
  A('inbox', 'Ian', 'Inbox Monitor', 'email', '#3a2a1c', '#e8b98f', '#5a7bd8', false, ['Reads Outlook', 'Sorts messages']),
  A('mailer', 'Ella', 'Email Response Specialist', 'email', '#6b3a2a', '#f2c9a0', '#8b5cf6', false, ['Drafts replies']),
  A('followup', 'Faye', 'Follow-Up Coordinator', 'email', '#1f1f1f', '#d9a679', '#e0558a', false, ['Unanswered inquiries']),
  A('photo', 'Pia', 'Photo Editor', 'creative', '#2b1b12', '#f2c9a0', '#14a3b8', false, ['Enhance photos', 'Hide private details']),
  A('video', 'Vince', 'Video Editor', 'creative', '#4a3220', '#e8b98f', '#e07a2f', false, ['Short videos', 'Captions']),
  A('creative', 'Cleo', 'Creative Director', 'creative', '#c0392b', '#f2c9a0', '#d4a017', true, ['Writes post drafts', 'Publishes approved posts']),
  A('qc', 'Quinn', 'Quality Control', 'creative', '#2c3e50', '#d9a679', '#2f9e6e', false, ['Checks media']),
  A('campaign', 'Andre', 'Campaign Analyst', 'ads', '#1f1f1f', '#e8b98f', '#3f6fd8', false, ['Ad performance']),
  A('strategist', 'Sasha', 'Advertising Strategist', 'ads', '#7a4b2a', '#f2c9a0', '#c0392b', false, ['Improvement ideas']),
  A('attrib', 'Tala', 'Lead Attribution Analyst', 'ads', '#2b1b12', '#d9a679', '#14a3b8', false, ['Cost per lead']),
  A('messenger', 'Mara', 'Messenger Receptionist', 'desk', '#3a2a1c', '#f2c9a0', '#e0558a', true, ['Receives Facebook inquiries']),
  A('qualifier', 'Leo', 'Lead Qualification', 'desk', '#1f1f1f', '#e8b98f', '#2f6df6', true, ['Records leads', 'Hands over for quotation']),
  A('support', 'Sam', 'Customer Support', 'desk', '#8a5a2b', '#f2c9a0', '#2f9e6e', false, ['Service questions']),
  A('router', 'Rico', 'Inquiry Routing', 'desk', '#2c3e50', '#d9a679', '#8b5cf6', false, ['Routes complex cases']),
  A('quote', 'Quin', 'Quotation Specialist', 'booking', '#4a3220', '#f2c9a0', '#d4a017', true, ['Drafts and sends quotations', 'Discount requests']),
  A('booking', 'Bea', 'Booking Coordinator', 'booking', '#6b3a2a', '#e8b98f', '#e0558a', true, ['Creates bookings']),
  A('scheduler', 'Sol', 'Scheduling Agent', 'booking', '#1f1f1f', '#d9a679', '#14a3b8', true, ['Crew and vehicle status']),
  A('joborders', 'Jo', 'Job Order Coordinator', 'booking', '#c0392b', '#f2c9a0', '#2f6df6', true, ['Drafts and sends job orders']),
  A('records', 'Ron', 'Employee Records', 'hr', '#2b1b12', '#e8b98f', '#5a7bd8', false, ['Certificates', 'Documents']),
  A('attendance', 'Alex', 'Attendance Analyst', 'hr', '#7a4b2a', '#f2c9a0', '#2f9e6e', false, ['Attendance exceptions']),
  A('training', 'Tess', 'Training Coordinator', 'hr', '#1f1f1f', '#d9a679', '#e07a2f', false, ['Safety training']),
  A('growth', 'Gabi', 'Growth Advisor', 'board', '#3a2a1c', '#f2c9a0', '#8b5cf6', false, ['Expansion ideas']),
  A('industry', 'Ike', 'Cleaning Industry Advisor', 'board', '#2c3e50', '#e8b98f', '#14a3b8', false, ['Methods and equipment']),
  A('cfo', 'Fina', 'Financial Advisor', 'board', '#1f1f1f', '#d9a679', '#d4a017', false, ['Margins and cash flow']),
  A('ops', 'Oli', 'Operations Advisor', 'board', '#6b3a2a', '#f2c9a0', '#2f6df6', false, ['Crew and capacity']),
];
export const agentByKey = (k: string) => AGENTS.find((a) => a.key === k);
export const deptByKey = (k: string) => DEPTS.find((d) => d.key === k);

/** How long an event keeps an agent in a state (milliseconds). */
export const WINDOW = { received: 6_000, working: 90_000, info: 20_000, coordinating: 15_000, done: 20_000, error: 600_000, awaiting: 6 * 3_600_000 };

export interface AgentView { state: AgentState; event?: HqEvent; partner?: string }
const t = (e: HqEvent) => Date.parse(e.at);
/** The visible state of one agent at `now`, from the events (any order). */
export function agentState(key: string, events: HqEvent[], now: number): AgentView {
  const mine = events.filter((e) => e.agent === key).sort((a, b) => t(b) - t(a));
  const last = mine[0];
  // a hand-over between two agents: both are coordinating for a few seconds
  const hand = events.filter((e) => e.to_agent && (e.agent === key || e.to_agent === key) && now - t(e) >= 0 && now - t(e) < WINDOW.coordinating).sort((a, b) => t(b) - t(a))[0];
  if (hand) return { state: 'coordinating', event: hand, partner: hand.agent === key ? hand.to_agent! : hand.agent };
  if (!last) return { state: 'idle' };
  const age = now - t(last);
  if (last.kind === 'fail' && age < WINDOW.error) return { state: 'error', event: last };
  const open = mine.find((e) => e.kind === 'approval');                                       // an approval request stays open until a later event of that agent answers it
  if (open && now - t(open) < WINDOW.awaiting && !mine.some((e) => t(e) > t(open) && (e.kind === 'done' || e.kind === 'start'))) return { state: 'awaiting', event: open };
  if (last.kind === 'start') { if (age < WINDOW.received) return { state: 'received', event: last }; if (age < WINDOW.working) return { state: 'working', event: last }; }
  if (last.kind === 'done' && age < WINDOW.done) return { state: 'done', event: last };
  if ((last.kind === 'info' || last.kind === 'message') && age < WINDOW.info) return { state: 'working', event: last };
  return { state: 'idle', event: last };
}

export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Idle agents drift to the café from time to time (purely decorative, never an AI call). */
export const inCafe = (key: string, now: number) => { const period = 40_000 + (hash(key) % 25_000); const slot = Math.floor(now / period); return hash(`${key}:${slot}`) % 100 < 22; };

/** Where an agent stands, in percent of the scene. Desks are laid out in two columns inside each room. */
export function deskPos(key: string): { x: number; y: number } {
  const a = agentByKey(key); if (!a) return { x: 50, y: 50 };
  const d = deptByKey(a.dept)!; const mates = AGENTS.filter((x) => x.dept === a.dept); const i = mates.findIndex((x) => x.key === key);
  if (a.dept === 'hub') return { x: d.x + d.w / 2, y: d.y + d.h * 0.7 };
  const rows = Math.ceil(mates.length / 2), col = i % 2, row = Math.floor(i / 2);
  return { x: d.x + d.w * (mates.length === 1 ? 0.5 : 0.28 + 0.44 * col), y: d.y + d.h * (rows === 1 ? 0.76 : 0.57 + 0.37 * row) };
}
export function cafePos(key: string): { x: number; y: number } {
  // every agent has its own place around the café table, so nobody stands on anybody else
  const c = deptByKey('cafe')!; const list = AGENTS.filter((a) => a.key !== 'jarvis'); const i = Math.max(0, list.findIndex((a) => a.key === key));
  const inner = i < 9; const n = inner ? 9 : list.length - 9; const k = inner ? i : i - 9; const ang = (k / n) * Math.PI * 2 + (inner ? 0 : 0.3);
  return { x: c.x + c.w / 2 + Math.cos(ang) * c.w * (inner ? 0.17 : 0.37), y: c.y + c.h * 0.7 + Math.sin(ang) * c.h * (inner ? 0.12 : 0.2) };
}
export function agentPos(key: string, view: AgentView, now: number): { x: number; y: number } {
  const desk = deskPos(key);
  if (view.state === 'coordinating' && view.partner) { const p = deskPos(view.partner); return { x: desk.x + (p.x - desk.x) * 0.5, y: desk.y + (p.y - desk.y) * 0.5 }; }
  if (view.state === 'idle' && key !== 'jarvis' && inCafe(key, now)) return cafePos(key);
  return desk;
}
export const CAFE_LINES = ['Nice weather for windows ☀️', 'Another spotless day!', 'Anyone seen the quotation queue?', 'Coffee first, then the inbox ☕', 'Safety first, shine second.', 'Great crew today!', 'Solar panels love clean water 💧', 'Water-fed pole season!'];
export const cafeLine = (key: string, now: number) => CAFE_LINES[hash(`${key}:${Math.floor(now / 15_000)}`) % CAFE_LINES.length];

/** How an agent's state reads, in plain words. */
export const STATE_LABEL: Record<AgentState, string> = { idle: 'Idle', received: 'New task received', working: 'Working', coordinating: 'Handing over', awaiting: 'Waiting for your approval', done: 'Just finished', blocked: 'Blocked', error: 'Problem', social: 'Taking a break' };

/** DEMO MODE: a scripted story that looks like real activity. Everything it produces is labelled as a demo on screen. */
const DEMO: { agent: string; kind: EventKind; title: string; to?: string; ref?: string }[][] = [
  [{ agent: 'messenger', kind: 'start', title: 'New inquiry from Facebook' }, { agent: 'qualifier', kind: 'message', title: 'Lead recorded and passed on for a quotation', to: 'quote' }, { agent: 'quote', kind: 'start', title: 'Quotation QT-DEMO-1 drafted', ref: 'QT-DEMO-1' }, { agent: 'quote', kind: 'done', title: 'Quotation QT-DEMO-1 sent to the client', ref: 'QT-DEMO-1' }],
  [{ agent: 'quote', kind: 'done', title: 'Quotation QT-DEMO-1 approved by the client', to: 'booking', ref: 'QT-DEMO-1' }, { agent: 'booking', kind: 'done', title: 'Booking JOB-DEMO-1 created', to: 'scheduler', ref: 'JOB-DEMO-1' }, { agent: 'joborders', kind: 'done', title: 'Job order JO-DEMO-1 drafted' }],
  [{ agent: 'creative', kind: 'approval', title: 'A completed job post draft waits for approval' }],
  [{ agent: 'inbox', kind: 'start', title: 'New email received' }, { agent: 'mailer', kind: 'message', title: 'Reply draft requested', to: 'inbox' }, { agent: 'mailer', kind: 'done', title: 'Reply draft ready' }],
  [{ agent: 'campaign', kind: 'start', title: 'Syncing advertising results' }, { agent: 'attrib', kind: 'info', title: 'Matched 3 inquiries to campaigns' }],
  [{ agent: 'jarvis', kind: 'done', title: 'Morning brief delivered' }, { agent: 'jarvis', kind: 'info', title: 'Weather warning prepared' }],
  [{ agent: 'photo', kind: 'start', title: 'Enhancing 6 job photos' }, { agent: 'qc', kind: 'message', title: 'Photos sent for review', to: 'photo' }, { agent: 'photo', kind: 'done', title: 'Photos ready for review' }],
  [{ agent: 'attendance', kind: 'info', title: 'Attendance exceptions reviewed' }, { agent: 'records', kind: 'info', title: 'A certificate expires next month' }],
];
/** The next demo events for step `n` (each gets the time `now` and a fresh id). */
export function demoStep(n: number, now: number): HqEvent[] {
  const script = DEMO[n % DEMO.length];
  return script.map((e, i) => ({ id: `demo-${n}-${i}`, at: new Date(now + i * 2500).toISOString(), agent: e.agent, dept: agentByKey(e.agent)?.dept ?? 'hub', kind: e.kind, title: e.title, ref: e.ref ?? null, to_agent: e.to ?? null }));
}
