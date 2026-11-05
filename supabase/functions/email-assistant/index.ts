import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncInbox } from './sync.ts';
import { suggestReply } from './ai.ts';
import { sendApprovedReply } from './send.ts';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async req => {
 const allowed=Deno.env.get('EMAIL_ALLOWED_ORIGIN');
 const origin=req.headers.get('origin');
 const cors={'Access-Control-Allow-Origin':allowed||'null','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const jsonReply=(value:unknown,init:ResponseInit={})=>Response.json(value,{...init,headers:{...cors,...Object.fromEntries(new Headers(init.headers).entries())}});
 if(req.method==='OPTIONS')return new Response(null,{status:allowed&&origin===allowed?204:403,headers:cors});
 if(origin&&(!allowed||origin!==allowed))return jsonReply({error:'Origin not allowed'},{status:403});
 if (req.method !== 'POST') return jsonReply({error:'POST required'},{status:405});
 try {
  const scheduleKey=Deno.env.get('EMAIL_SYNC_SECRET');
  const receivedKey=req.headers.get('x-email-sync-secret');
  if(scheduleKey && receivedKey && receivedKey===scheduleKey){
   const task=await req.json();
   if(task.action!=='sync')return jsonReply({error:'Scheduled access limited to sync'},{status:403});
   return jsonReply(await syncInbox());
  }
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ','');
  const {data:session,error:authError} = await db.auth.getUser(jwt);
  if (authError || !session.user) return jsonReply({error:'Unauthorized'},{status:401});
  const {data:profile} = await db.from('profiles').select('role,active').eq('id',session.user.id).single();
  if (!profile?.active || !['owner','ops'].includes(profile.role)) return jsonReply({error:'Forbidden'},{status:403});
  const body=await req.json();
  if(body.action==='sync') return jsonReply(await syncInbox());
  if(body.action==='suggest') {
   const {data:thread}=await db.from('email_threads').select('*').eq('id',body.id).single();
   if(!thread || ['sent','sending'].includes(thread.status)) return jsonReply({error:'Not eligible for draft'},{status:409});
   const draft=await suggestReply(thread.graph_message_id);
   const {data:updated,error}=await db.from('email_threads').update({ai_draft:draft,status:'draft'}).eq('id',thread.id).in('status',['new','draft','needs_review']).select('id').maybeSingle();
   if(error) throw error;
   if(!updated) return jsonReply({error:'Draft status changed'},{status:409});
   await db.from('email_audit').insert({thread_id:thread.id,action:'ai_draft',actor:session.user.id});
   return jsonReply({draft});
  }
  if(body.action==='send') {
   if(typeof body.id!=='string') return jsonReply({error:'Missing id'},{status:400});
   if(body.confirm!==true) return jsonReply({error:'Explicit approval required'},{status:400});
   return jsonReply(await sendApprovedReply(body.id,session.user.id));
  }
  if(body.action==='save') {
   if(typeof body.id!=='string'||typeof body.content!=='string'||!body.content.trim()||body.content.length>20000) return jsonReply({error:'Invalid draft'},{status:400});
   const {data,error}=await db.from('email_threads').update({ai_draft:body.content,status:'draft',draft_edited_at:new Date().toISOString()}).eq('id',body.id).in('status',['new','draft','needs_review']).select('id').maybeSingle();
   if(error) throw error;
   if(!data) return jsonReply({error:'Draft no longer editable'},{status:409});
   await db.from('email_audit').insert({thread_id:body.id,action:'draft_saved',actor:session.user.id});
   return jsonReply({saved:true});
  }
  if(body.action!=='list') return jsonReply({error:'Action not enabled'},{status:403});
  const {data,error} = await db.from('email_threads').select('*').order('received_at',{ascending:false}).limit(100);
  if (error) throw error;
  return jsonReply({items:data});
 }catch(err){ return jsonReply({error:String(err)},{status:500}); }
});
