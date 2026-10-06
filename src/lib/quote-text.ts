// Standard wording on a quotation: manpower deployment, estimated duration and the service disclaimer.
import type { Quotation, Settings } from './types';

export const DEFAULT_CREW_SIZE = '6-7';
export const DEFAULT_DISCLAIMER = `Our cleaning process is designed to effectively remove loose dirt, dust, and general surface contaminants using professional equipment and specialized cleaning techniques. However, certain conditions such as hard water stains, mineral deposits, paint residue, adhesive residue, silicone residue, and other permanent or chemically bonded contaminants may not be fully removable through standard cleaning procedures.

While our team will apply the appropriate cleaning methods and make every reasonable effort to improve the appearance of the surface, complete removal of these types of stains cannot be guaranteed, as the final outcome will depend on the actual surface condition, material composition, and duration of stain exposure.

In some cases, these marks may already be etched, embedded, or permanently bonded to the surface, and their true condition will only become fully visible after the cleaning process has been completed.`;

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
