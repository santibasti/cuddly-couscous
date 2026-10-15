// "Rephrase with AI" for a text box: works on the highlighted words, or the whole box when nothing is highlighted.
import { useState } from 'react';
import { CLOUD, supabase } from '@/lib/cloud';
import { Modal, toast } from '@/components/ui';

const MODES: [string, string][] = [['clearer', 'Make clearer'], ['professional', 'More professional'], ['shorter', 'Shorter'], ['simpler', 'Simpler words'], ['fix', 'Fix spelling & grammar']];

export function AiRephrase({ value, area, onApply }: { value: string; area: () => HTMLTextAreaElement | null; onApply: (next: string) => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, 0]); const [result, setResult] = useState(''); const [custom, setCustom] = useState('');
  const original = value.slice(range[0], range[1]);

  const start = () => {
    if (!CLOUD) { toast('AI rephrase works in the live app only (it needs the cloud connection).'); return; }
    const el = area(); let a = el?.selectionStart ?? 0; let b = el?.selectionEnd ?? 0;
    if (a === b) { a = 0; b = value.length; }
    if (!value.slice(a, b).trim()) { toast('Write something first, then I can rephrase it.'); return; }
    setRange([a, b]); setResult(''); setCustom(''); setOpen(true);
  };
  const run = async (mode: string, instruction?: string) => {
    setBusy(true); setResult('');
    try {
      const { data, error } = await supabase().functions.invoke('ai-rewrite', { body: { text: original, mode, instruction, selection: range[1] - range[0] < value.length } });
      if (error) { let msg = error.message; try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* keep the generic message */ } throw new Error(msg); }
      const d = data as { text?: string; error?: string }; if (d?.error) throw new Error(d.error);
      setResult(d.text ?? '');
    } catch (e) { toast(e instanceof Error ? e.message : 'The AI could not answer. Try again.'); } finally { setBusy(false); }
  };
  const apply = () => { onApply(value.slice(0, range[0]) + result + value.slice(range[1])); setOpen(false); };

  return (
    <>
      <button type="button" className="btn sm" onClick={start} title="Highlight words to rephrase only those, or tap with nothing highlighted to rephrase everything">✨ Rephrase with AI</button>
      {open && (
        <Modal title="Rephrase with AI" onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!result || busy} onClick={apply}>Use this wording</button></>}>
          <div className="stack">
            <div><div className="small muted">{range[1] - range[0] < value.length ? 'Your highlighted words' : 'The whole section'}</div><div className="pd-card" style={{ whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>{original}</div></div>
            <div className="chips" role="group" aria-label="How to rephrase">{MODES.map(([k, l]) => <button key={k} type="button" disabled={busy} onClick={() => run(k)}>{l}</button>)}</div>
            <div className="row"><input style={{ flex: 1 }} placeholder="Or tell the AI what to change…" value={custom} maxLength={300} onChange={(e) => setCustom(e.target.value)} /><button className="btn" disabled={busy || !custom.trim()} onClick={() => run('custom', custom)}>Go</button></div>
            {busy && <div className="small muted">Rephrasing…</div>}
            {result && <div><div className="small muted">Suggested wording — you can still edit it after using it</div><div className="pd-card" style={{ whiteSpace: 'pre-wrap' }}>{result}</div></div>}
          </div>
        </Modal>
      )}
    </>
  );
}
