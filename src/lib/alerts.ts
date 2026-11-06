// Admin: send one test text through the real alert path and report what happened.
import { CLOUD, supabase } from './cloud';
import { store } from './store';

export interface TestResult { state: 'sent' | 'failed' | 'waiting'; detail: string }
/** Queues a test alert (the database calls the send-alerts function) and waits up to ~25 seconds for the outcome. */
export async function sendTestSms(withLink: boolean, onTick?: (r: TestResult) => void): Promise<TestResult> {
  store.require('admin.settings');
  if (!CLOUD) return { state: 'failed', detail: 'This is the demo, which has no SMS service. On the live site the test text is sent through Semaphore.' };
  const { data: id, error } = await supabase().rpc('send_test_alert', { p_with_link: withLink });
  if (error) return { state: 'failed', detail: /does not exist|schema cache/i.test(error.message) ? 'The database update for the test text is missing (migration 0089). Run supabase.cmd db push.' : error.message };
  let last: TestResult = { state: 'waiting', detail: 'Waiting for the text to be sent…' };
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await supabase().from('alert_outbox').select('sent_at, attempts, error').eq('id', id as number).maybeSingle();
    if (data?.sent_at) return { state: 'sent', detail: 'Semaphore accepted the text. It should reach your phone within a minute.' };
    if (data?.error) return { state: 'failed', detail: String(data.error) };
    last = { state: 'waiting', detail: 'Waiting for the text to be sent…' }; onTick?.(last);
  }
  return { state: 'waiting', detail: 'Still queued after 25 seconds: the send-alerts function may not be reachable, or the function secret does not match. Check the function logs in Supabase.' };
}
