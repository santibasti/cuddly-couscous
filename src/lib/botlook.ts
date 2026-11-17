// Every agent has its own robot: a different head, face, ears, antenna, body and feet, like a squad of toy robots. Pure data; the drawing is in components/HqBot.tsx.
export type HeadShape = 'sphere' | 'tall' | 'square' | 'dome' | 'big';
export type Face = 'pair' | 'wide' | 'cyclops' | 'band' | 'screen';
export type Ears = 'lens' | 'phones' | 'headset' | 'none';
export type Antenna = 'none' | 'ball' | 'wire';
export type BodyShape = 'slim' | 'chunk' | 'pear' | 'round';
export type Feet = 'boot' | 'wheel' | 'big';
export interface Look { head: HeadShape; face: Face; ears: Ears; ant: Antenna; body: BodyShape; feet: Feet; size: number }

const L = (head: HeadShape, face: Face, ears: Ears, ant: Antenna, body: BodyShape, feet: Feet, size = 1): Look => ({ head, face, ears, ant, body, feet, size });
/** The squad. Presets: orb (big round head, one eye), astro (wide visor), lens (side camera lens), band (visor band), wire (one eye + antenna wire), phones (tall head, headphones), headset (dome, headset), screen (square head with a screen face), bighead (big head, small body), helmet (astronaut dome). */
export const LOOKS: Record<string, Look> = {
  jarvis: L('tall', 'wide', 'phones', 'ball', 'round', 'big', 1.1),
  messenger: L('dome', 'pair', 'headset', 'none', 'slim', 'boot'), qualifier: L('sphere', 'cyclops', 'phones', 'none', 'slim', 'wheel'), support: L('big', 'pair', 'lens', 'none', 'chunk', 'boot', 0.96), router: L('square', 'screen', 'none', 'ball', 'pear', 'boot'),
  quote: L('sphere', 'wide', 'lens', 'none', 'chunk', 'boot'), booking: L('sphere', 'cyclops', 'none', 'wire', 'slim', 'boot'), scheduler: L('dome', 'wide', 'lens', 'none', 'round', 'big', 1.04), joborders: L('sphere', 'band', 'lens', 'none', 'chunk', 'boot'),
  inbox: L('sphere', 'cyclops', 'phones', 'none', 'slim', 'wheel'), mailer: L('sphere', 'band', 'lens', 'none', 'chunk', 'boot'), followup: L('dome', 'pair', 'headset', 'none', 'pear', 'boot'),
  photo: L('big', 'pair', 'lens', 'none', 'slim', 'wheel', 0.96), video: L('sphere', 'pair', 'lens', 'ball', 'slim', 'wheel'), creative: L('sphere', 'wide', 'lens', 'none', 'chunk', 'big', 1.04), qc: L('dome', 'wide', 'lens', 'none', 'round', 'boot'),
  campaign: L('tall', 'pair', 'phones', 'none', 'chunk', 'boot'), strategist: L('big', 'pair', 'none', 'ball', 'slim', 'boot', 0.96), attrib: L('sphere', 'cyclops', 'none', 'wire', 'slim', 'boot'),
  records: L('square', 'screen', 'lens', 'none', 'chunk', 'boot'), attendance: L('dome', 'wide', 'lens', 'none', 'round', 'boot'), training: L('big', 'pair', 'none', 'none', 'pear', 'big', 0.96),
  cleaner: L('dome', 'wide', 'lens', 'ball', 'chunk', 'wheel', 0.96),
  growth: L('sphere', 'cyclops', 'phones', 'none', 'slim', 'wheel'), industry: L('sphere', 'wide', 'lens', 'none', 'chunk', 'boot'), cfo: L('tall', 'pair', 'phones', 'none', 'chunk', 'boot'), ops: L('square', 'screen', 'none', 'ball', 'pear', 'boot'),
};
const DEFAULT = L('sphere', 'pair', 'lens', 'none', 'slim', 'boot');
export const lookOf = (key: string): Look => LOOKS[key] ?? DEFAULT;

/** Shell size of each head shape (half width, half height) and where its visor sits. */
export const HEAD_DIM: Record<HeadShape, { rx: number; ry: number }> = { sphere: { rx: 21, ry: 20 }, tall: { rx: 18, ry: 23 }, square: { rx: 21, ry: 17.5 }, dome: { rx: 22.5, ry: 17 }, big: { rx: 25, ry: 22 } };
/** Body half width at the shoulders and at the hips, and its height. */
export const BODY_DIM: Record<BodyShape, { top: number; bottom: number }> = { slim: { top: 14, bottom: 14 }, chunk: { top: 19, bottom: 19 }, pear: { top: 14, bottom: 20 }, round: { top: 17, bottom: 20 } };
