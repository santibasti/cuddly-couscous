// The AI customer-service rulebook as versioned data (not text buried in a prompt): sections you edit in the app, a draft that is tested and then published, and old versions kept for rollback.
// This file is the pure part (split / join / check). The text itself is never in the code: it lives in the database (the repository is public).
export interface Section { key: string; title: string; body: string }
export interface RulebookVersion { id: number; version: number; status: 'draft' | 'published' | 'archived'; title: string; change_note: string | null; sections: Section[]; tests_passed_at: string | null; created_at: string; published_at: string | null }

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
const unique = (key: string, used: Set<string>) => { let k = key, n = 2; while (used.has(k)) k = `${key}-${n++}`; used.add(k); return k; };

/** Pasted Markdown → sections: every line starting with "## " opens a section ("# " is the title; text before the first heading becomes "Introduction"). */
export function splitRulebook(md: string): { title: string; sections: Section[] } {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'); let title = ''; const out: { title: string; body: string[] }[] = []; let cur: { title: string; body: string[] } | null = null; const pre: string[] = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*#*\s*$/), h1 = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (h2) { cur = { title: h2[1].trim(), body: [] }; out.push(cur); } else if (h1 && !title && !cur) title = h1[1].trim(); else if (cur) cur.body.push(line); else if (!/^(\*\*.*\*\*|-{3,})?\s*$/.test(line) || pre.length) pre.push(line);
  }
  const used = new Set<string>(); const sections: Section[] = [];
  const intro = pre.join('\n').trim(); if (intro) sections.push({ key: unique('introduction', used), title: 'Introduction', body: intro });
  for (const s of out) sections.push({ key: unique(slug(s.title), used), title: s.title, body: s.body.join('\n').trim() });
  return { title, sections };
}
export const joinRulebook = (sections: Section[], title = ''): string => [title ? `# ${title}` : '', ...sections.map((s) => `## ${s.title}\n\n${s.body}`)].filter(Boolean).join('\n\n') + '\n';

/** What a rulebook must contain before it can be published. */
export const REQUIRED: { label: string; test: RegExp }[] = [
  { label: 'who the assistant is (identity)', test: /identity|personality/i }, { label: 'pricing rules', test: /pric/i }, { label: 'booking and scheduling rules', test: /booking|scheduling/i },
  { label: 'when to hand over to a person', test: /hand\s*over|handoff|escalat/i }, { label: 'the non-negotiable rules', test: /non-?negotiable|final.*rules/i },
];
export const LIMITS = { section: 30_000, total: 150_000, sections: 60 };
export function validateRulebook(sections: Section[]): string[] {
  const p: string[] = []; if (!sections.length) return ['The rulebook has no sections.'];
  if (sections.length > LIMITS.sections) p.push(`More than ${LIMITS.sections} sections.`);
  const keys = new Set<string>(); let total = 0;
  for (const s of sections) { if (!s.title.trim()) p.push('A section has no title.'); if (!s.body.trim()) p.push(`"${s.title || s.key}" is empty.`); if (keys.has(s.key)) p.push(`Two sections share the key "${s.key}".`); keys.add(s.key); if (s.body.length > LIMITS.section) p.push(`"${s.title}" is too long (over ${LIMITS.section} characters).`); total += s.body.length; }
  if (total > LIMITS.total) p.push(`The rulebook is too long (over ${LIMITS.total} characters).`);
  for (const r of REQUIRED) if (!sections.some((s) => r.test.test(s.title) || r.test.test(s.key))) p.push(`Missing: ${r.label}.`);
  return p;
}
/** A short, plain list of what changed between two versions of the sections. */
export function diffSections(a: Section[], b: Section[]): { added: string[]; removed: string[]; changed: string[] } {
  const am = new Map(a.map((s) => [s.key, s])), bm = new Map(b.map((s) => [s.key, s]));
  return { added: b.filter((s) => !am.has(s.key)).map((s) => s.title), removed: a.filter((s) => !bm.has(s.key)).map((s) => s.title), changed: b.filter((s) => am.has(s.key) && (am.get(s.key)!.body !== s.body || am.get(s.key)!.title !== s.title)).map((s) => s.title) };
}
