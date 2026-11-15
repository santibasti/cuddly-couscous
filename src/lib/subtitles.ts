// Movie-style subtitles: an answer is cut into short lines (one or two screen lines each) that are shown one after another, in time with the speech.

const TRAIL = /^[\s"')\]]+/;
/** Cuts one long sentence at the best natural break (; : — , or a conjunction) so each piece fits `max` characters. */
function splitLong(s: string, max: number): string[] {
  const out: string[] = []; let rest = s.trim();
  while (rest.length > max) {
    const win = rest.slice(0, max + 1); const lo = Math.floor(max * 0.4); let cut = -1;
    for (const re of [/[;:—–]\s/g, /,\s/g, /\s(?=(?:and|but|or|so|that|which|with|because|while|then)\s)/g, /\s/g]) {
      let m: RegExpExecArray | null; let best = -1;
      while ((m = re.exec(win))) { const end = m.index + m[0].length; if (end > lo && end <= max + 1) best = end; }
      if (best > 0) { cut = best; break; }
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).replace(TRAIL, (x) => (x.includes('"') || x.includes("'") || x.includes(')') ? x : '')).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Subtitle lines for a spoken answer: about `max` characters each, sentences kept whole when they fit, very short ones joined. */
export function subtitleChunks(text: string, max = 72): string[] {
  const clean = (text ?? '').replace(/https?:\/\/\S+/g, '').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g) ?? [clean];
  const pieces: string[] = [];
  for (const s of sentences) pieces.push(...splitLong(s.trim(), max));
  const out: string[] = [];
  for (const p of pieces) { const last = out[out.length - 1]; if (last && last.length + 1 + p.length <= Math.min(max, 56) && (last.length < 24 || p.length < 24)) out[out.length - 1] = `${last} ${p}`; else out.push(p); }
  return out.filter(Boolean);
}

/** The line to show at progress p (0..1) of the speech: each line gets time in proportion to its length (plus a small pause). */
export function lineAt(chunks: string[], p: number): string {
  if (!chunks.length || p >= 1) return '';
  const w = chunks.map((c) => c.length + 8); const total = w.reduce((a, b) => a + b, 0); let acc = 0;
  for (let i = 0; i < chunks.length; i++) { acc += w[i] / total; if (p < acc) return chunks[i]; }
  return '';
}
/** How long a spoken answer lasts when there is no audio clock to follow (reading speed), in seconds. */
export const readSeconds = (text: string) => Math.max(2, text.length * 0.062);
