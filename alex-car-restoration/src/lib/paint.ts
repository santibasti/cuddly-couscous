import type { Project } from './types';

const NAMED: [RegExp, string][] = [
  [/highland green/i, '#2f5a43'], [/british racing|racing green/i, '#1f4a33'], [/signal orange/i, '#e8590c'], [/hugger orange/i, '#e0661a'],
  [/riverside red/i, '#a3202a'], [/silver/i, '#b8bdc7'], [/orange/i, '#e0661a'], [/green/i, '#2f5a43'], [/red|burgundy|maroon/i, '#a3202a'],
  [/blue/i, '#2f5fa8'], [/black/i, '#2a2d35'], [/white|ivory|cream/i, '#e6e2d6'], [/yellow|gold/i, '#d6a21e'], [/grey|gray|charcoal/i, '#6b717d'],
];

/** Best-effort hex for a paint name so each job's car art matches its real colour. */
export function paintHex(p: Pick<Project, 'color'>): string {
  for (const [re, hex] of NAMED) if (re.test(p.color)) return hex;
  return '#7a7f8c';
}
