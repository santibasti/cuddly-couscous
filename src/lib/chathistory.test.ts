import { describe, expect, it } from 'vitest';
import { buildHistory } from '../../supabase/functions/_shared/chathistory';

const inb = (body: string, status = 'received') => ({ direction: 'in' as const, body, status });
const out = (body: string, status = 'sent') => ({ direction: 'out' as const, body, status });
describe('building the history the model sees', () => {
  it('keeps order, merges same-role turns and never starts on an assistant turn', () => {
    const h = buildHistory([out('stray reply', 'sent'), inb('Binondo'), inb('Wall Cleaning'), out('Exterior or interior po?'), inb('Exterior')]);
    expect(h).toEqual([{ role: 'user', content: 'Binondo\nWall Cleaning' }, { role: 'assistant', content: 'Exterior or interior po?' }, { role: 'user', content: 'Exterior' }]);
  });
  it('leaves out drafts and anything not delivered, and never invents a turn from the current message', () => {
    const h = buildHistory([inb('Binondo'), out('DRAFT the customer never saw', 'draft'), inb('Wall Cleaning'), out('failed one', 'failed'), out('discarded', 'discarded')]);
    expect(h).toEqual([{ role: 'user', content: 'Binondo\nWall Cleaning' }]);
  });
  it('shortens the welcome and shows a photo as a marker', () => {
    const h = buildHistory([inb('hi'), out('Hello po, Ma’am/Sir! Good day.\nTopMop provides professional exterior cleaning and property-care services.\n\n---\n\nMay I know your city po?'), inb('https://scontent.xx.fbcdn.net/v/a.jpg')]);
    expect(h[1].content).toBe('[TopMop welcome message was sent] May I know your city po?'); expect(h[2].content).toBe('[The customer sent a photo or attachment]');
  });
  it('trims the oldest turns when the chat is long but keeps a user turn first (the facts live in the context)', () => {
    const rows = Array.from({ length: 60 }, (_, i) => (i % 2 ? out(`reply ${i} ` + 'x'.repeat(300)) : inb(`message ${i} ` + 'y'.repeat(300))));
    const h = buildHistory(rows, 3000); expect(h[0].role).toBe('user'); expect(h.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(3000); expect(h[h.length - 1].content).toContain('reply 59');
  });
});
