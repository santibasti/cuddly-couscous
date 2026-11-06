// Admin: send one test text through the real alert path and report what happened.
import { CLOUD, supabase } from './cloud';
import { store } from './store';
import { callFn } from './fnclient';

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

export interface SampleResult { to: string; message: string; job: string | null }
/** Sends the real client reminder text (for the next upcoming booking) to the alert number only, so you can see exactly what clients receive. Owner / Admin. */
export async function sendSampleReminder(kind: 'day_before' | 'morning'): Promise<SampleResult> {
  store.require('admin.settings');
  if (!CLOUD) throw new Error('This is the demo, which has no SMS service. On the live site the sample is texted to your alert number.');
  return callFn<SampleResult>('send-client-reminders', { kind }, { 'x-sample': '1' });
}

export interface ClientSmsRow { id: number; job_id: string; kind: 'day_before' | 'morning'; service_date: string; to_number: string | null; message: string | null; sent_at: string | null; error: string | null; created_at: string }
export interface AlertRow { id: number; kind: string; title: string; body: string; created_at: string; sent_at: string | null; attempts: number; error: string | null }
/** The latest client reminders and owner alerts, for the SMS page. */
export async function loadSmsLogs(): Promise<{ clients: ClientSmsRow[]; alerts: AlertRow[]; missing: boolean }> {
  if (!CLOUD) return { clients: [], alerts: [], missing: false };
  const [c, a] = await Promise.all([
    supabase().from('client_sms_log').select('id, job_id, kind, service_date, to_number, message, sent_at, error, created_at').order('id', { ascending: false }).limit(40),
    supabase().from('alert_outbox').select('id, kind, title, body, created_at, sent_at, attempts, error').neq('kind', 'test').order('id', { ascending: false }).limit(40),
  ]);
  const missing = [c.error, a.error].some((e) => e && /does not exist|schema cache/i.test(e.message));
  return { clients: (c.data ?? []) as ClientSmsRow[], alerts: (a.data ?? []) as AlertRow[], missing };
}
