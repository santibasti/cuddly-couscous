import { describe, expect, it } from 'vitest';
import { readJson } from '../../supabase/functions/ai-executive/readjson';

describe('readJson', () => {
  it('reads plain JSON and JSON with commentary and braces around it', () => {
    expect(readJson('{"a":1}')).toEqual({ a: 1 });
    expect(readJson('Let me search {the web}.\n```json\n{"a":[1,2],"b":{"c":"x"}}\n```\nSources {see above}')).toEqual({ a: [1, 2], b: { c: 'x' } });
  });
  it('picks the real answer when earlier text contains a smaller object', () => {
    expect(readJson('{"note":"x"} then {"findings":[{"t":"a"},{"t":"b"}],"summary":"s"}')).toEqual({ findings: [{ t: 'a' }, { t: 'b' }], summary: 's' });
  });
  it('repairs trailing commas and raw line breaks inside strings', () => {
    expect(readJson('{"a":"line1\nline2","b":[1,2,],}')).toEqual({ a: 'line1\nline2', b: [1, 2] });
  });
  it('ignores braces inside strings', () => {
    expect(readJson('{"a":"} {","b":1}')).toEqual({ a: '} {', b: 1 });
  });
  it('returns null when there is no object', () => { expect(readJson('sorry')).toBeNull(); expect(readJson('{"a":')).toBeNull(); });
});
