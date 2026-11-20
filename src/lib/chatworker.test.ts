import { describe, expect, it } from 'vitest';
import { dropLoneSurrogates, isTransientError } from '../../supabase/functions/_shared/chatworker';

describe('requests to the AI', () => {
  it('drops a lone half of an emoji (the API answers 400) but keeps real emoji and typed backslash text', () => {
    const cut = JSON.stringify({ a: 'name \ud83d', b: 'ok 😊', c: '\\ud83d typed', d: 'x\ude00y' });
    const clean = dropLoneSurrogates(cut); expect(() => JSON.parse(clean)).not.toThrow();
    expect(JSON.parse(clean)).toEqual({ a: 'name ', b: 'ok 😊', c: '\\ud83d typed', d: 'xy' });
    expect(dropLoneSurrogates('{"a":"plain"}')).toBe('{"a":"plain"}');
  });
  it('keeps the Anthropic explanation in the error, and a 400 is still not retried', () => {
    expect(isTransientError('AI error 400: {"type":"error","error":{"type":"invalid_request_error","message":"x"}}')).toBe(false);
    expect(isTransientError('AI error 529: {"type":"error","error":{"type":"overloaded_error"}}')).toBe(true);
  });
});
