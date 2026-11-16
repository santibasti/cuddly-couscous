// DEMO MODE scenario: "a Facebook lead about glass cleaning in Makati". It is a script with a virtual clock the person can start, pause and reset. It only produces SAMPLE events for the
// screen: nothing is sent, booked, quoted or saved anywhere.
import { agentByKey, type EventKind, type HqEvent } from './hq';

export interface ScenarioStep { at: number; agent: string; kind: EventKind; title: string; to?: string; caption: string }
export const SCENARIO: ScenarioStep[] = [
  { at: 0, agent: 'messenger', kind: 'start', title: 'Sample Messenger inquiry: glass cleaning in Makati', caption: '1 · A sample Facebook lead arrives. Mara, the Messenger receptionist, picks it up.' },
  { at: 2600, agent: 'messenger', kind: 'info', title: 'Qualified: glass cleaning · Makati · residential', caption: '2 · Mara qualifies the lead: service, place and type of property.' },
  { at: 3400, agent: 'messenger', kind: 'message', to: 'booking', title: 'Lead handed over to Booking', caption: '3 · Mara hands the lead to Bea at the Booking desk.' },
  { at: 16600, agent: 'booking', kind: 'start', title: 'Requesting approved pricing and a free day', caption: '4 · Bea asks for the approved price and a free day.' },
  { at: 17200, agent: 'booking', kind: 'message', to: 'quote', title: 'Price check requested', caption: '4 · Bea asks Quin for the price.' },
  { at: 17500, agent: 'quote', kind: 'start', title: 'Looking up the Makati glass package', caption: '5 · Quin looks up the approved price list (no price is invented).' },
  { at: 19600, agent: 'booking', kind: 'message', to: 'scheduler', title: 'Free crew and van requested', caption: '6 · Bea asks Sol for a free crew and van.' },
  { at: 19900, agent: 'scheduler', kind: 'start', title: 'Checking crew and vehicle for the requested day', caption: '6 · Sol checks crew and vehicle availability.' },
  { at: 21800, agent: 'scheduler', kind: 'done', title: 'A free day with crew and van was found', caption: '7 · Sol found a free day.' },
  { at: 22400, agent: 'quote', kind: 'approval', title: 'Sample quotation waits for your approval', caption: '8 · The quotation is ready and waits for a human decision. Nothing is sent.' },
  { at: 24200, agent: 'jarvis', kind: 'done', title: 'Summary: 1 sample inquiry, 1 quotation awaiting approval', caption: '9 · JARVIS summarises. The sample ends here, awaiting approval.' },
];
export const SCENARIO_LENGTH = 45000;   // the script ends at 24.2 s (Mara walks the task to Booking first); the rest lets the last hand-overs settle so the scene ends in the real "waiting for approval" state
/** The sample events that have happened by `elapsed` milliseconds after `base` (the virtual clock). */
export function scenarioEvents(base: number, elapsed: number): HqEvent[] {
  return SCENARIO.filter((s) => s.at <= elapsed).map((s, i) => ({ id: `demo-${s.at}-${i}`, at: new Date(base + s.at).toISOString(), agent: s.agent, dept: agentByKey(s.agent)?.dept ?? 'hub', kind: s.kind, title: s.title, ref: null, to_agent: s.to ?? null }));
}
export const scenarioCaption = (elapsed: number): string => [...SCENARIO].reverse().find((s) => s.at <= elapsed)?.caption ?? 'Press Start to run the sample inquiry. Everything you see in demo mode is sample data.';
