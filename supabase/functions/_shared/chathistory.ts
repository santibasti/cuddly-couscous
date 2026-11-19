// The conversation as the model sees it: coherent recent turns, only replies the customer really received, nothing garbled at the start.
import { MSG_SPLIT, PHOTO_MARKER, isPhotoMessage } from './brain.ts';

export interface HistRow { direction: 'in' | 'out'; body: string; status: string }
export interface Turn { role: 'user' | 'assistant'; content: string }
/** `rows` oldest first. Customer messages count when received; our replies only when they were sent or approved (drafts never reach the customer). */
export function buildHistory(rows: HistRow[], maxChars = 7000): Turn[] {
  const turns: Turn[] = [];
  for (const r of rows) {
    const delivered = r.direction === 'in' ? r.status === 'received' : r.status === 'sent' || r.status === 'approved'; if (!delivered) continue;
    const role: Turn['role'] = r.direction === 'in' ? 'user' : 'assistant';
    let body = isPhotoMessage(r.body) ? PHOTO_MARKER : String(r.body ?? '').trim(); if (!body) continue;
    if (role === 'assistant' && /TopMop provides professional exterior cleaning/i.test(body)) { const rest = body.includes(MSG_SPLIT) ? body.split(MSG_SPLIT).slice(1).join(MSG_SPLIT).trim() : ''; body = rest ? `[TopMop welcome message was sent] ${rest}` : '[TopMop welcome message was sent]'; }   // the long welcome is not repeated in every request
    const last = turns[turns.length - 1]; if (last && last.role === role) last.content += `\n${body}`; else turns.push({ role, content: body });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();                       // never start on an assistant turn
  let total = turns.reduce((n, t) => n + t.content.length, 0);
  while (turns.length > 1 && total > maxChars) { total -= turns[0].content.length; turns.shift(); while (turns.length && turns[0].role !== 'user') { total -= turns[0].content.length; turns.shift(); } }   // trim the oldest turns, keep a user turn first
  return turns;
}
