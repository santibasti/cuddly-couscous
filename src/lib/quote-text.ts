// Standard wording on a quotation: manpower deployment, estimated duration and the service disclaimer.
import type { Quotation, Settings } from './types';

export const DEFAULT_CREW_SIZE = '6-7';
export const DEFAULT_DISCLAIMER = `Our cleaning process is designed to effectively remove loose dirt, dust, and general surface contaminants using professional equipment and specialized cleaning techniques. However, certain conditions such as hard water stains, mineral deposits, paint residue, adhesive residue, silicone residue, and other permanent or chemically bonded contaminants may not be fully removable through standard cleaning procedures.

While our team will apply the appropriate cleaning methods and make every reasonable effort to improve the appearance of the surface, complete removal of these types of stains cannot be guaranteed, as the final outcome will depend on the actual surface condition, material composition, and duration of stain exposure.

In some cases, these marks may already be etched, embedded, or permanently bonded to the surface, and their true condition will only become fully visible after the cleaning process has been completed.`;

export const DEFAULT_TECHNOLOGY = 'Advanced Infinity Series System';
export const DEFAULT_INTRO = `We are pleased to present our Professional Cleaning Services, utilizing the ${DEFAULT_TECHNOLOGY} to deliver streak-free and spotless results for glass, ceilings, solar panels, roofs, ACP and walls. Our expertise, eco-friendly methods and attention to detail ensure your property achieves a polished, refreshed appearance.`;
/** Paragraphs are separated by a blank line. A "Process:" block lists steps as "Name: what happens"; a "Note:" paragraph is shown as a callout. */
export const DEFAULT_METHODOLOGY = `We utilize a Water-Fed Pole System with Deionized Water Technology, ensuring a spot-free, streak-free finish without the need for harsh chemicals. This system allows us to clean windows efficiently and safely from the ground, minimizing the need for scaffolding or ladders.

Process:
Pre-Rinse: Removes loose dirt and debris.
Deep Cleaning: Our water-fed pole with soft bristle brush gently scrubs the glass while deionized water dissolves contaminants.
Final Rinse: Leaves the surface crystal clear, as deionized water naturally dries without residue or streaks.

This method ensures maximum cleanliness, safety, and efficiency while maintaining the integrity of your glass surfaces.

Note: We will use your property's water connection to operate our Water-Fed Pole System. Rest assured, the water consumption is minimal and environmentally friendly.`;
export const defaultIntro = (s?: Pick<Settings, 'default_intro'>) => s?.default_intro?.trim() || DEFAULT_INTRO;
export const defaultMethodology = (s?: Pick<Settings, 'default_methodology'>) => s?.default_methodology?.trim() || DEFAULT_METHODOLOGY;
export interface MethodBlocks { paragraphs: string[]; steps: { name: string; text: string }[]; note?: string; stepsAfter: number }
/** Splits the methodology text into plain paragraphs, the numbered process steps and the closing note. */
export function parseMethodology(text: string): MethodBlocks {
  const out: MethodBlocks = { paragraphs: [], steps: [], stepsAfter: 0 };
  for (const block of text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    if (/^process\s*:/i.test(block)) {
      const lines = block.split('\n').slice(1).map((l) => l.replace(/^[\s•\-*o]+(?=\S)/, '').trim()).filter(Boolean);
      if (!lines.length) { const rest = block.replace(/^process\s*:/i, '').trim(); if (rest) lines.push(rest); }
      for (const l of lines) { const m = l.match(/^([^:]{2,40}):\s*(.+)$/); out.steps.push(m ? { name: m[1].trim(), text: m[2].trim() } : { name: '', text: l }); }
      out.stepsAfter = out.paragraphs.length;
    } else if (/^note\s*:/i.test(block)) out.note = block.replace(/^note\s*:/i, '').trim();
    else out.paragraphs.push(block.replace(/\s*\n\s*/g, ' '));
  }
  return out;
}

type Q = Pick<Quotation, 'crew_size' | 'safety_officer' | 'work_days'>;
export const defaultCrew = (s?: Pick<Settings, 'default_crew_size'>) => s?.default_crew_size?.trim() || DEFAULT_CREW_SIZE;
export const defaultDisclaimer = (s?: Pick<Settings, 'default_disclaimer'>) => s?.default_disclaimer?.trim() || DEFAULT_DISCLAIMER;

/** "6-7 trained Crew with Certified Work at Height, Designated Safety Officer, will be deployed …" — null when the quotation has no manpower details. */
export function manpowerText(q: Q): string | null {
  const crew = q.crew_size?.trim(); if (!crew) return null;
  return `${crew} trained Crew with Certified Work at Height${q.safety_officer ? ', Designated Safety Officer,' : ','} will be deployed to execute the project efficiently and safely. All team members are equipped with complete PPE and Work at Height Certificate.`;
}
export function durationText(q: Q): string | null {
  if (!q.work_days || q.work_days <= 0) return null;
  return `The cleaning activity is projected to be completed within ${q.work_days} day/s, subject to weather conditions and site accessibility.`;
}

/** How the client pays: on completion of the job, or net N days after the invoice date. Chosen on each quotation. */
/** Ocular done: the exact price is agreed, so the quotation shows amounts. Not done: only the agreed rates are shown (the final amount depends on the count on site). */
export const quoteShowsAmounts = (q: { ocular_done?: boolean; ocular_visit_id?: string }) => q.ocular_done ?? !!q.ocular_visit_id;
export const RATES_NOTE = 'The final amount is based on the actual work counted and completed on the day of service, at the agreed rates above.';

export const PAYMENT_OPTIONS = [
  { value: 'completion', label: 'Upon job completion' },
  { value: 'net_7', label: 'Net 7 days' }, { value: 'net_15', label: 'Net 15 days' }, { value: 'net_30', label: 'Net 30 days' },
  { value: 'net_45', label: 'Net 45 days' }, { value: 'net_60', label: 'Net 60 days' },
] as const;
export const DEFAULT_PAYMENT_OPTION = 'completion';
/** days allowed to pay after the invoice date (0 = payable upon completion) */
export const paymentDays = (opt?: string): number | undefined => (!opt ? undefined : opt === 'completion' ? 0 : Number(opt.replace('net_', '')) || undefined);
export const paymentLabel = (opt?: string) => PAYMENT_OPTIONS.find((o) => o.value === opt)?.label;
export const paymentSentence = (opt?: string) => {
  const d = paymentDays(opt); if (d === undefined) return undefined;
  return d === 0 ? 'Payment is due upon completion of the job.' : `Payment is due within ${d} days (net ${d}) from the invoice date.`;
};

/* ---------- materials & methodology per service ---------- */
export interface MethodDefault { materials: string; methodology: string }
/** Starting text for each service; Admin can edit it (Admin → Service pricing) and Sales can edit it again for a single quotation. */
export const SERVICE_METHOD_DEFAULTS: Record<string, MethodDefault> = {
  GLASS_EXT: { materials: 'Water-fed pole system, deionized (DI) water, soft-bristle brush, no harsh chemicals', methodology: DEFAULT_METHODOLOGY },
  GLASS_INT: { materials: 'Microfiber cloths, squeegee, neutral glass cleaner, drop sheets', methodology: `Interior glass is cleaned by hand, with drop sheets to protect floors and furniture.\n\nProcess:\nProtect: Drop sheets and floor protection are placed under the work area.\nClean: The glass is washed with a neutral cleaner and a microfiber applicator.\nSqueegee & detail: Squeegee finish, then frames and sills are wiped dry.\n\nNote: Furniture within reach of the windows should be moved or covered before we arrive.` },
  ROOF: { materials: 'Low-pressure rinse, soft brush, eco-safe roof cleaner, fall-protection harness and anchor lines', methodology: `We clean the roof with a low-pressure rinse and a soft brush, using eco-safe roof cleaner only when needed, so the roofing is not damaged. The crew works with certified work-at-height equipment.\n\nProcess:\nSafety setup: Anchor points, harnesses and barricades are set before work starts.\nDry removal: Loose debris, leaves and dust are cleared first.\nWash: Moss, algae and stains are loosened with a soft brush and low-pressure rinse.\nFinal rinse: The roof and gutters are rinsed clear.\n\nNote: Roofs that are too steep or fragile may need extra safety measures and are quoted separately.` },
  WALL: { materials: 'Low-pressure washer, soft brush, eco-safe cleaner, water supply from the property', methodology: `Walls and floors are cleaned with a low-pressure wash and a soft brush, so paint and surfaces are not damaged.\n\nProcess:\nPre-wet: The surface is wetted to loosen dirt.\nScrub: Stains, moss and algae are scrubbed with a soft brush and eco-safe cleaner where needed.\nRinse: The area is rinsed clear and the wash water is directed away.\n\nNote: We will use your property's water connection. Stubborn paint or oil stains may need a separate quotation.` },
  FLOOR: { materials: 'Surface cleaner, low-pressure washer, stiff brush, eco-safe degreaser, wet vacuum if needed', methodology: `Hardscape and floors are cleaned with a surface cleaner and low-pressure wash that lifts dirt without damaging the surface.\n\nProcess:\nSweep: Loose dirt and debris are cleared.\nWash: The surface is cleaned with a surface cleaner and degreaser where needed.\nRinse: Wash water is rinsed away or collected, leaving the surface clean.\n\nNote: We will use your property's water connection. Drainage for the wash water should be available.` },
  SOLAR: { materials: 'Deionized (DI) water, soft-bristle brush, water-fed pole, no detergents or abrasives', methodology: `Solar panels are cleaned with deionized water and a soft brush only, with no chemicals and no pressure washer, to protect the panel coating and the warranty.\n\nProcess:\nInspect: Panels are checked for cracks and loose parts before cleaning.\nBrush: A soft brush with deionized water lifts dust and bird droppings.\nRinse: Final rinse leaves a spot-free surface that dries without residue.\n\nNote: We clean in the early morning or late afternoon, when panels are cool.` },
  ACP: { materials: 'Soft brush, pH-neutral cleaner, low-pressure rinse, work-at-height equipment', methodology: `ACP and cladding panels are cleaned with a pH-neutral cleaner and a soft brush to keep the finish intact.\n\nProcess:\nRinse: Loose dirt is rinsed off from the top down.\nClean: Panels are washed with a pH-neutral cleaner and soft brush.\nFinal rinse: Panels are rinsed clear and left to dry.` },
  CEILING: { materials: 'Microfiber tools, dry sponge, vacuum, drop sheets', methodology: `Ceilings are cleaned dry or damp, depending on the material, with drop sheets protecting everything below.\n\nProcess:\nProtect: Floors and furniture are covered.\nDust: Dust and cobwebs are removed with microfiber tools and a vacuum.\nSpot clean: Marks are removed with a damp cloth where the material allows.` },
  GUTTER: { materials: 'Gloves, scoops, hose, work-at-height equipment', methodology: `Gutters are cleared by hand and flushed with water so rainwater flows freely.\n\nProcess:\nClear: Leaves and debris are removed by hand.\nFlush: Gutters and downpipes are flushed to check the flow.\nCheck: Joints and outlets are checked for blockages and leaks.` },
};
export interface MethodSection { code: string; name: string; materials?: string; methodology: string }
/** One section per distinct service on the quotation (in order), keeping what was already edited for a service that is still on it. */
export function syncMethodSections(services: { code: string; name: string; methodology?: string; materials?: string }[], itemCodes: string[], existing: MethodSection[] = []): MethodSection[] {
  const out: MethodSection[] = [];
  for (const code of itemCodes) {
    if (code === 'OTHER' || out.some((s) => s.code === code)) continue;
    const kept = existing.find((s) => s.code === code); if (kept) { out.push(kept); continue; }
    const sv = services.find((x) => x.code === code); const d = SERVICE_METHOD_DEFAULTS[code];
    const methodology = (sv?.methodology ?? d?.methodology ?? '').trim(); if (!methodology && !(sv?.materials ?? d?.materials)) continue;
    out.push({ code, name: sv?.name ?? code, materials: (sv?.materials ?? d?.materials ?? '').trim() || undefined, methodology });
  }
  return out;
}
