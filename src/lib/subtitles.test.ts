import { describe, expect, it } from 'vitest';
import { lineAt, readSeconds, subtitleChunks } from './subtitles';

describe('movie-style subtitles', () => {
  it('keeps a short answer as one line', () => {
    expect(subtitleChunks('Two items need you today.')).toEqual(['Two items need you today.']);
    expect(subtitleChunks('')).toEqual([]);
  });
  it('shows one sentence at a time', () => {
    expect(subtitleChunks('Good morning. Two items need you: a discount request, and an unsigned handover. The weather looks dry.')).toEqual(
      ['Good morning.', 'Two items need you: a discount request, and an unsigned handover.', 'The weather looks dry.']);
  });
  it('joins very short sentences into one line', () => { expect(subtitleChunks('Yes. Done. Okay then.')).toEqual(['Yes. Done. Okay then.']); });
  it('splits a long sentence at natural breaks and never exceeds the width', () => {
    const t = 'Tomorrow, Monday, looks dry and hot, with a forecast of mostly cloudy skies at about ninety three degrees, and the chance of rain is only about three percent, so the crew can work.';
    const c = subtitleChunks(t); expect(c.length).toBeGreaterThan(2); expect(c.every((x) => x.length <= 72)).toBe(true);
    expect(c.join(' ').replace(/\s+/g, ' ')).toBe(t);                          // nothing is lost
    expect(c[0].endsWith(',')).toBe(true);                                       // breaks after a comma, not mid-phrase
  });
  it('splits a very long word run at spaces as a last resort and drops markdown and links', () => {
    const c = subtitleChunks('a '.repeat(100)); expect(c.every((x) => x.length <= 72)).toBe(true);
    expect(subtitleChunks('See **this** at https://example.com now.')).toEqual(['See this at now.']);
  });
  it('picks the line for a point in the speech', () => {
    const c = ['one two three', 'four five six', 'seven eight nine'];
    expect(lineAt(c, 0)).toBe('one two three'); expect(lineAt(c, 0.5)).toBe('four five six'); expect(lineAt(c, 0.99)).toBe('seven eight nine'); expect(lineAt(c, 1)).toBe(''); expect(lineAt([], 0.2)).toBe('');
  });
  it('estimates a reading time', () => { expect(readSeconds('x'.repeat(100))).toBeCloseTo(6.2); expect(readSeconds('Hi')).toBe(2); });
});
