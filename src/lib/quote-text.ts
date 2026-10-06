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
