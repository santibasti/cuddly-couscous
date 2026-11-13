// Telegram → Photo Library. The crew sends photos / videos in the company Telegram group (or to the bot); each one is saved to the job and
// client of the person who sent it, and records who sent it.
//  • POST from Telegram (header X-Telegram-Bot-Api-Secret-Token): a message or a button press.
//  • POST from the signed-in Owner / Admin ({action:'status'|'connect'}): checks the bot and points Telegram at this function.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (letters, digits, - and _ only). Deploy with --no-verify-jwt.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decide, extFor, firstName, jobsFor, manilaDay, ocularsFor, parseCaption, type Kind, type TgJob, type TgOcular } from './logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
type Db = ReturnType<typeof createClient>;
const API = (m: string) => `https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${m}`;
const MAX_BYTES = 20 * 1024 * 1024;   // the most a bot can download from Telegram

async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(API(method), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(`Telegram ${method}: ${j.description ?? r.status}`);
  return j.result;
}
const say = (chat: number, text: string, extra: Record<string, unknown> = {}) => tg('sendMessage', { chat_id: chat, text, ...extra }).catch((e) => { console.error(String(e)); });

interface Msg { message_id: number; date: number; chat: { id: number; type: string }; from?: { id: number; first_name?: string; is_bot?: boolean }; text?: string; caption?: string;
  photo?: { file_id: string; file_unique_id: string; file_size?: number; width: number; height: number }[];
  video?: { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string; width: number; height: number; thumbnail?: { file_id: string } };
  video_note?: { file_id: string; file_unique_id: string; file_size?: number };
  document?: { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string; thumbnail?: { file_id: string } }; media_group_id?: string }
interface Media { fileId: string; uniqueId: string; size?: number; mime: string; media: 'photo' | 'video'; w?: number; h?: number; thumbId?: string; original?: boolean }

function mediaOf(m: Msg): Media | null {
  if (m.photo?.length) { const p = [...m.photo].sort((a, b) => (b.file_size ?? b.width * b.height) - (a.file_size ?? a.width * a.height))[0]; const small = m.photo.filter((x) => x.width >= 280).sort((a, b) => a.width - b.width)[0] ?? m.photo[0]; return { fileId: p.file_id, uniqueId: p.file_unique_id, size: p.file_size, mime: 'image/jpeg', media: 'photo', w: p.width, h: p.height, thumbId: small.file_id !== p.file_id ? small.file_id : undefined }; }
  if (m.video) return { fileId: m.video.file_id, uniqueId: m.video.file_unique_id, size: m.video.file_size, mime: m.video.mime_type ?? 'video/mp4', media: 'video', w: m.video.width, h: m.video.height, thumbId: m.video.thumbnail?.file_id };
  if (m.video_note) return { fileId: m.video_note.file_id, uniqueId: m.video_note.file_unique_id, size: m.video_note.file_size, mime: 'video/mp4', media: 'video' };
  if (m.document && /^(image|video)\//.test(m.document.mime_type ?? '')) return { fileId: m.document.file_id, uniqueId: m.document.file_unique_id, size: m.document.file_size, mime: m.document.mime_type!, media: m.document.mime_type!.startsWith('video') ? 'video' : 'photo', thumbId: m.document.thumbnail?.file_id, original: true };
  return null;
}

async function loadJobs(db: Db, emp: string): Promise<TgJob[]> {
  const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
  const { data } = await db.from('jobs').select('id, number, client_id, start_at, end_at, status, leader_id, crew_ids').is('deleted_at', null).gte('start_at', since).lte('start_at', manilaDay(Date.now() + 86400_000) + 'T23:59');
  return ((data ?? []) as TgJob[]).filter((j) => j.leader_id === emp || (Array.isArray(j.crew_ids) && (j.crew_ids as unknown[]).includes(emp)));
}
const label = async (db: Db, j: TgJob) => { const { data } = await db.from('clients').select('name').eq('id', j.client_id).maybeSingle(); return `${j.number} (${data?.name ?? 'client'})`; };

async function saveMedia(db: Db, m: Msg, media: Media, emp: string, job: TgJob | null, parsed: ReturnType<typeof parseCaption>, ocular: TgOcular | null = null): Promise<'saved' | 'duplicate' | 'toobig'> {
  if ((media.size ?? 0) > MAX_BYTES) return 'toobig';
  const { data: dup } = await db.from('job_photos').select('id').eq('tg_unique_id', media.uniqueId).maybeSingle();
  if (dup) return 'duplicate';
  const file = await tg('getFile', { file_id: media.fileId }).catch(() => null);
  if (!file?.file_path) return 'toobig';
  const res = await fetch(`https://api.telegram.org/file/bot${env('TELEGRAM_BOT_TOKEN')}/${file.file_path}`);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const id = crypto.randomUUID(); const ext = extFor(media.mime, media.media === 'video' ? 'mp4' : 'jpg');
  const folder = job?.id ?? (ocular ? `ocular/${ocular.id}` : 'unsorted');
  const path = `${folder}/${id}.${ext}`;
  const up = await db.storage.from('job-photos').upload(path, bytes, { contentType: media.mime, upsert: false });
  if (up.error) throw new Error(up.error.message);
  // a small copy for the Photo Library grid (the original stays untouched for creatives)
  let thumb: string | null = null;
  if (media.thumbId) {
    try {
      const tf = await tg('getFile', { file_id: media.thumbId }); const tr = await fetch(`https://api.telegram.org/file/bot${env('TELEGRAM_BOT_TOKEN')}/${tf.file_path}`);
      if (tr.ok) { const tp = `${folder}/${id}_t.jpg`; const tu = await db.storage.from('job-photos').upload(tp, new Uint8Array(await tr.arrayBuffer()), { contentType: 'image/jpeg' }); if (!tu.error) thumb = tp; }
    } catch (e) { console.error(String(e)); }
  }
  const ins = await db.from('job_photos').insert({ id, job_id: job?.id ?? null, ocular_id: ocular?.id ?? null, client_id: job?.client_id ?? ocular?.client_id ?? null, path, thumb_path: thumb, kind: parsed.kind, caption: parsed.caption, tags: ['telegram'], width: media.w ?? null, height: media.h ?? null,
    taken_at: new Date(m.date * 1000).toISOString(), source: 'telegram', sent_by_employee_id: emp, media: media.media, tg_unique_id: media.uniqueId, size_bytes: bytes.length, uploaded_by: null });
  if (ins.error) { await db.storage.from('job-photos').remove(thumb ? [path, thumb] : [path]); if (ins.error.code === '23505') return 'duplicate'; throw new Error(ins.error.message); }
  return 'saved';
}

async function onMessage(db: Db, m: Msg) {
  const from = m.from; if (!from || from.is_bot) return;
  const chat = m.chat.id; const text = (m.text ?? '').trim();
  const reply = { reply_to_message_id: m.message_id, allow_sending_without_reply: true };

  // /link 123456  — joins this Telegram account to an employee
  const link = text.match(/^\/link(?:@\w+)?\s+(\d{6})\b/i);
  if (link) {
    const { data: c } = await db.from('telegram_link_codes').select('code, employee_id, expires_at, used_at').eq('code', link[1]).maybeSingle();
    if (!c || c.used_at || new Date(c.expires_at).getTime() < Date.now()) return void await say(chat, 'That code is wrong or has expired. Ask the office for a new one.', reply);
    const { data: e } = await db.from('employees').select('full_name').eq('id', c.employee_id).maybeSingle();
    await db.from('telegram_links').delete().eq('employee_id', c.employee_id);
    await db.from('telegram_links').upsert({ telegram_user_id: from.id, employee_id: c.employee_id, telegram_name: from.first_name ?? null, linked_at: new Date().toISOString() });
    await db.from('telegram_link_codes').update({ used_at: new Date().toISOString() }).eq('code', c.code);
    return void await say(chat, `✅ Linked, ${firstName(e?.full_name ?? '')}! Photos and videos you send here now go to your job automatically.`, reply);
  }
  if (/^\/(start|help)\b/i.test(text)) return void await say(chat, 'TopMop photo bot.\n• For the best quality (for our posts), send photos as a File: tap the paperclip → File, instead of Photo.\n• /link 123456 — join with the code the office gives you (once).\n• Send photos or videos: they go to your job today. Add the job number (e.g. JOB-2026-0012) and Before / After in the caption to choose.\n• /job JOB-2026-0012 — send the next photos to that job.\n• Ocular visit: put OV-2026-0001 in the caption, or send /ocular OV-2026-0001 first. With no job today, your photos go to your ocular visit of the day.', reply);

  const { data: lk } = await db.from('telegram_links').select('employee_id').eq('telegram_user_id', from.id).maybeSingle();
  const media = mediaOf(m);

  if (!lk) {
    if (media || text.startsWith('/')) {   // one reminder an hour, not one per photo of an album
      const { data: n } = await db.from('telegram_notice').select('at').eq('telegram_user_id', from.id).maybeSingle();
      if (!n || Date.now() - new Date(n.at).getTime() > 3600_000) { await db.from('telegram_notice').upsert({ telegram_user_id: from.id, at: new Date().toISOString() }); await say(chat, 'I do not know you yet, so I did not save that. Ask the office for a link code, then send /link CODE here.', reply); }
    }
    return;
  }
  const emp = lk.employee_id as string;

  if (/^\/whoami\b/i.test(text)) { const { data: e } = await db.from('employees').select('full_name').eq('id', emp).maybeSingle(); return void await say(chat, `You are ${e?.full_name ?? emp}.`, reply); }

  const jobCmd = text.match(/^\/job(?:@\w+)?\s+(\S+)/i);
  if (jobCmd) {
    const { data: j } = await db.from('jobs').select('id, number, client_id').ilike('number', jobCmd[1]).is('deleted_at', null).maybeSingle();
    if (!j) return void await say(chat, `I could not find ${jobCmd[1].toUpperCase()}.`, reply);
    await db.from('telegram_context').upsert({ employee_id: emp, job_id: j.id, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
    return void await say(chat, `OK — your next photos for 30 minutes go to ${await label(db, j as TgJob)}.`, reply);
  }
  const ovCmd = text.match(/^\/ocular(?:@\w+)?\s+(\S+)/i);
  if (ovCmd) {
    const { data: o } = await db.from('ocular_visits').select('id, number, client_id').ilike('number', ovCmd[1]).is('deleted_at', null).maybeSingle();
    if (!o) return void await say(chat, `I could not find ${ovCmd[1].toUpperCase()}.`, reply);
    await db.from('telegram_context').upsert({ employee_id: emp, job_id: null, ocular_id: o.id, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
    return void await say(chat, `OK — your next photos for 30 minutes go to ocular visit ${o.number}.`, reply);
  }
  if (!media) return;

  const parsed = parseCaption(m.caption);
  let captionJob: TgJob | null = null;
  if (parsed.jobNumber) { const { data } = await db.from('jobs').select('id, number, client_id, start_at, end_at, status, leader_id, crew_ids').ilike('number', parsed.jobNumber).is('deleted_at', null).maybeSingle(); captionJob = (data as TgJob) ?? null; }
  const { data: ctx } = await db.from('telegram_context').select('job_id, ocular_id, expires_at').eq('employee_id', emp).maybeSingle();
  let contextJob: TgJob | null = null;
  if (ctx?.job_id && new Date(ctx.expires_at).getTime() > Date.now()) { const { data } = await db.from('jobs').select('id, number, client_id, start_at, end_at, status, leader_id, crew_ids').eq('id', ctx.job_id).is('deleted_at', null).maybeSingle(); contextJob = (data as TgJob) ?? null; }
  // an ocular visit: its number in the caption, or /ocular OV-… lately, or (when there is no job today) the visit assigned to this person today
  const OV = 'id, number, client_id, assignee_id, start_at, status';
  let ocular: TgOcular | null = null; let ovWhy = '';
  if (parsed.ocularNumber) { const { data } = await db.from('ocular_visits').select(OV).ilike('number', parsed.ocularNumber).is('deleted_at', null).maybeSingle(); ocular = (data as TgOcular) ?? null; ovWhy = ocular ? '' : `I could not find ${parsed.ocularNumber}`; }
  else if (!captionJob && !parsed.jobNumber && ctx?.ocular_id && new Date(ctx.expires_at).getTime() > Date.now()) { const { data } = await db.from('ocular_visits').select(OV).eq('id', ctx.ocular_id).is('deleted_at', null).maybeSingle(); ocular = (data as TgOcular) ?? null; }
  if (!ocular && !ovWhy && !captionJob && !contextJob && !parsed.jobNumber && !jobsFor(await loadJobs(db, emp), emp, Date.now()).length) {
    const { data } = await db.from('ocular_visits').select(OV).eq('assignee_id', emp).is('deleted_at', null).gte('start_at', manilaDay(Date.now()) + 'T00:00').lte('start_at', manilaDay(Date.now()) + 'T23:59');
    ocular = ocularsFor((data ?? []) as TgOcular[], emp, Date.now())[0] ?? null;
  }
  if (ocular) {
    let ro: Awaited<ReturnType<typeof saveMedia>>;
    try { ro = await saveMedia(db, m, media, emp, null, parsed, ocular); } catch (e) { console.error(String(e)); return void await say(chat, '⚠ I could not save that one. Please try again, or upload it in the app.', reply); }
    if (ro === 'duplicate') return;
    if (ro === 'toobig') return void await say(chat, '⚠ That file is over 20 MB, which is more than I can fetch from Telegram. Please upload it in the app.', reply);
    if (m.media_group_id) { const { data: last } = await db.from('telegram_notice').select('at').eq('telegram_user_id', -from.id).maybeSingle(); if (last && Date.now() - new Date(last.at).getTime() < 60_000) return; await db.from('telegram_notice').upsert({ telegram_user_id: -from.id, at: new Date().toISOString() }); }
    return void await say(chat, `✅ ${media.media === 'video' ? 'Video' : 'Photo'} saved to ocular visit ${ocular.number}.`, reply);
  }
  const today = captionJob || contextJob ? [] : jobsFor(await loadJobs(db, emp), emp, Date.now());
  const d = decide({ captionJob, captionNumber: parsed.jobNumber, contextJob, today });

  const where = d.kind === 'job' ? d.job : null;
  let r: Awaited<ReturnType<typeof saveMedia>>;
  try { r = await saveMedia(db, m, media, emp, where, parsed); } catch (e) { console.error(String(e)); return void await say(chat, '⚠ I could not save that one. Please try again, or upload it in the app.', reply); }
  if (r === 'duplicate') return;
  if (r === 'toobig') return void await say(chat, '⚠ That file is over 20 MB, which is more than I can fetch from Telegram. Please upload it in the app (Photo Library).', reply);

  const noun = media.media === 'video' ? 'Video' : 'Photo';
  if (d.kind === 'job') {
    if (m.media_group_id) { const { data: last } = await db.from('telegram_notice').select('at').eq('telegram_user_id', -from.id).maybeSingle(); if (last && Date.now() - new Date(last.at).getTime() < 60_000) return; await db.from('telegram_notice').upsert({ telegram_user_id: -from.id, at: new Date().toISOString() }); }
    return void await say(chat, `✅ ${noun} saved to ${await label(db, d.job)}.`, reply);
  }
  const { data: me } = await db.from('job_photos').select('id').eq('tg_unique_id', media.uniqueId).maybeSingle();
  if (d.kind === 'unsorted') return void await say(chat, `📥 ${noun} saved to the office's Unsorted tray (${d.reason}). The office will file it, or send /job JOB-… first.`, reply);

  // several jobs today: ask once, covering every photo sent in the next couple of minutes
  const { data: open } = await db.from('telegram_pending').select('id, photo_ids').eq('chat_id', chat).eq('employee_id', emp).is('resolved_at', null).gte('created_at', new Date(Date.now() - 120_000).toISOString()).order('id', { ascending: false }).limit(1).maybeSingle();
  if (open) { await db.from('telegram_pending').update({ photo_ids: [...(open.photo_ids as string[]), me?.id] }).eq('id', open.id); return; }
  const opts = await Promise.all(d.options.map(async (j) => ({ id: j.id, text: await label(db, j) })));
  const { data: p } = await db.from('telegram_pending').insert({ chat_id: chat, employee_id: emp, photo_ids: [me?.id], jobs: opts }).select('id').single();
  await say(chat, `Which job is this ${noun.toLowerCase()} for?`, { ...reply, reply_markup: { inline_keyboard: [...opts.map((o, i) => [{ text: o.text.slice(0, 60), callback_data: `j:${p!.id}:${i}` }]), [{ text: 'Not sure — send to office', callback_data: `u:${p!.id}` }]] } });
}

async function onButton(db: Db, q: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } }) {
  const [kind, pid, idx] = (q.data ?? '').split(':'); const chat = q.message?.chat.id;
  const done = (t: string) => tg('answerCallbackQuery', { callback_query_id: q.id, text: t }).catch(() => undefined);
  const { data: p } = await db.from('telegram_pending').select('*').eq('id', Number(pid)).maybeSingle();
  const { data: lk } = await db.from('telegram_links').select('employee_id').eq('telegram_user_id', q.from.id).maybeSingle();
  if (!p || p.resolved_at || !lk || lk.employee_id !== p.employee_id) return void await done('That question is closed or is not yours.');
  let job: { id: string; client_id: string } | null = null; let said = 'Sent to the office (Unsorted).';
  if (kind === 'j') {
    const pick = (p.jobs as { id: string; text: string }[])[Number(idx)]; if (!pick) return void await done('Please try again.');
    const { data: j } = await db.from('jobs').select('id, client_id').eq('id', pick.id).maybeSingle(); if (!j) return void await done('Job not found.');
    job = j; said = `✅ Saved to ${pick.text}.`;
    await db.from('telegram_context').upsert({ employee_id: p.employee_id, job_id: j.id, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
  }
  const ids = (p.photo_ids as (string | null)[]).filter(Boolean) as string[];
  if (job && ids.length) await db.from('job_photos').update({ job_id: job.id, client_id: job.client_id }).in('id', ids);
  await db.from('telegram_pending').update({ resolved_at: new Date().toISOString() }).eq('id', p.id);
  await done('Done');
  if (chat && q.message) await tg('editMessageText', { chat_id: chat, message_id: q.message.message_id, text: `${said} (${ids.length} file${ids.length === 1 ? '' : 's'})` }).catch(() => undefined);
}

async function admin(req: Request) {
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const [{ data: ok }, { data: who }] = await Promise.all([asUser.rpc('can_admin_settings'), asUser.auth.getUser()]);
  if (ok !== true || !who?.user) return json({ error: 'Only the Owner / Admin can manage Telegram.' }, 403);
  const body = await req.json().catch(() => ({})) as { action?: string };
  if (!env('TELEGRAM_BOT_TOKEN') || !env('TELEGRAM_WEBHOOK_SECRET')) return json({ ok: true, configured: false, hint: 'TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are not set yet.' });
  try {
    const url = `${env('SUPABASE_URL')}/functions/v1/telegram-webhook`;
    if (body.action === 'connect') await tg('setWebhook', { url, secret_token: env('TELEGRAM_WEBHOOK_SECRET'), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
    const [me, info] = await Promise.all([tg('getMe', {}), tg('getWebhookInfo', {})]);
    return json({ ok: true, configured: true, bot: me.username, connected: info.url === url, last_error: info.last_error_message ?? null, pending: info.pending_update_count ?? 0 });
  } catch (e) { return json({ error: (e as Error).message }, 502); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('ok');
  const secret = env('TELEGRAM_WEBHOOK_SECRET'); const given = req.headers.get('x-telegram-bot-api-secret-token');
  if (given === null) return admin(req);                                   // from the app
  if (!secret || !safeEq(given, secret)) return new Response('forbidden', { status: 403 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  try {
    const u = await req.json();
    if (u.message) await onMessage(db, u.message as Msg); else if (u.callback_query) await onButton(db, u.callback_query);
  } catch (e) { console.error(String(e)); }                               // always 200: Telegram would otherwise resend the same update for hours
  return new Response('ok');
});
