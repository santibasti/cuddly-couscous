// Reads the JSON object out of an AI answer that may have commentary around it, a stray brace, a trailing comma,
// or a raw line break inside a string. Pure (no network) so it can be tested.

/** Every balanced {...} block in the text, found by scanning (quotes and escapes respected), longest first. */
function blocks(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; }
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Fixes the small mistakes models make: trailing commas, and raw line breaks / tabs inside strings. */
export function tidy(s: string): string {
  let out = '', inStr = false, esc = false;
  for (const c of s) {
    if (inStr) {
      if (esc) { esc = false; out += c; continue; }
      if (c === '\\') { esc = true; out += c; continue; }
      if (c === '"') { inStr = false; out += c; continue; }
      out += c === '\n' ? '\\n' : c === '\r' ? '' : c === '\t' ? ' ' : c;
    } else { if (c === '"') inStr = true; out += c; }
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

export function readJson(text: string): Record<string, unknown> | null {
  for (const b of blocks(text)) {
    for (const cand of [b, tidy(b)]) {
      try { const v = JSON.parse(cand); if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>; } catch { /* try the next */ }
    }
  }
  return null;
}
