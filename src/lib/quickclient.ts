// Quick add client: paste what the customer sent in the chat (the filled-in booking form, or free text) and the details are picked out for you to check.
export interface QuickClient { name: string; mobile: string; email: string; address: string; storeys: string; date: string; service: string }
const EMPTY: QuickClient = { name: '', mobile: '', email: '', address: '', storeys: '', date: '', service: '' };

/** 0917 123 4567, +63 917 123 4567, 639171234567 -> 09171234567; anything else is returned as typed. */
export function normMobile(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return d; if (/^639\d{9}$/.test(d)) return `0${d.slice(2)}`; if (/^9\d{9}$/.test(d)) return `0${d}`;
  return String(raw ?? '').trim();
}
const LABELS: [keyof QuickClient, RegExp][] = [
  ['name', /^(?:full\s+)?name(?:\s+of\s+\w+)?$/i], ['name', /^client(?:'s)?\s+name$/i],
  ['address', /^(?:complete\s+)?(?:service\s+|job\s+|home\s+)?address(?:\s*\(with city\))?$/i],
  ['mobile', /^(?:contact\s*(?:number|no\.?)|mobile(?:\s*(?:number|no\.?))?|phone(?:\s*number)?|cp(?:\s*no\.?)?|number)$/i],
  ['email', /^e-?mail(?:\s*address)?$/i],
  ['storeys', /^(?:no\.?\s*of\s*)?(?:house\s+)?stor(?:e)?y?s?(?:\s*\(?(?:house|floors?)\)?)?$|^(?:no\.?\s*of\s*)?(?:house\s+)?storey$|^floors?$/i],
  ['date', /^(?:reservation\s+date|preferred\s+date|date|schedule)$/i],
  ['service', /^(?:type\s+of\s+)?service(?:s)?(?:\s+(?:window|wall|roof|solar|floor)[^:]*)?$/i],
];
const OPTIONS = /^(?:window|wall|roof|solar|floor)(?:\s*[,/]\s*(?:window|wall|roof|solar|floor))*\??$/i;
const labelOf = (l: string): keyof QuickClient | undefined => { const t = l.replace(/\([^)]*\)/g, ' ').trim().replace(/\s+/g, ' '); for (const [k, re] of LABELS) if (re.test(t)) return k; return undefined; };

export function parseQuickClient(text: string): QuickClient {
  const out: QuickClient = { ...EMPTY };
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  let cur: keyof QuickClient | undefined;
  for (const raw of lines) {
    if (!raw) { cur = undefined; continue; }
    const m = /^([^:：]{1,60})[:：]\s*(.*)$/.exec(raw) ?? /^(Service\s+Window,[^?]*\?)\s*(.*)$/i.exec(raw);
    const key = m ? labelOf(m[1]) : undefined;
    if (m && key) { cur = key; const v = m[2].trim(); if (v && !(key === 'service' && OPTIONS.test(v) && v.split(/[,/]/).length > 1)) out[key] = out[key] ? `${out[key]} ${v}` : v; continue; }
    if (/[:：]\s*\S/.test(raw) && !out[cur ?? 'name']) { cur = undefined; continue; }                               // some other "label: value" line, not the continuation of an empty field
    if (cur && (cur === 'address' || cur === 'name') && out[cur]) { out[cur] = `${out[cur]}, ${raw}`; continue; }   // an address that continues on the next line
    if (cur && !out[cur]) { out[cur] = raw; continue; }                                                            // the value sits on the line under its label
  }
  // free text: pick out what is plainly recognisable
  if (!out.email) { const e = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(text); if (e) out.email = e[0]; }
  if (!out.mobile) { const mm = /(?:\+?63|0)?\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/.exec(text); if (mm) out.mobile = mm[0]; }
  out.mobile = out.mobile ? normMobile(out.mobile) : '';
  out.name = out.name.replace(/\s+/g, ' ').trim(); out.address = out.address.replace(/\s+/g, ' ').trim();
  out.service = out.service.replace(/\?+$/, '').trim(); out.storeys = out.storeys.trim(); out.date = out.date.trim();
  return out;
}
/** The notes saved on the client from what the customer told us beyond name, mobile, email and address. */
export const quickNotes = (q: QuickClient): string => [q.service && `Service wanted: ${q.service}`, q.storeys && `Storeys: ${q.storeys}`, q.date && `Reservation date asked: ${q.date}`, 'Added from a chat with Quick add.'].filter(Boolean).join('\n');
