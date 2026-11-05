import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncInbox } from './sync.ts';
import { suggestReply } from './ai.ts';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async req => {
 if (req.method !== 'POST') return Response.json({error:'POST required'},{status:405});
 try {
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ','');
  const {data:session,error:authError} = await db.auth.getUser(jwt);
  if (authError || !session.user) return Response.json({error:'Unauthorized'},{status:401});
  const {data:profile} = await db.from('profiles').select('role,active').eq('id',session.user.id).single();
  if (!profile?.active || !['owner','ops'].includes(profile.role)) return Response.json({error:'Forbidden'},{status:403});
  const body=await req.json();
  if(body.action==='sync') return Response.json(await syncInbox());
  if(body.action==='suggest') {
   const {data:thread}=await db.from('email_threads').select('*').eq('id',body.id).single();
   if(!thread || ['sent','sending'].includes(thread.status)) return Response.json({error:'Not eligible for draft'},{status:409});
   const draft=await suggestReply(thread.graph_message_id);
   const {data:updated,error}=await db.from('email_threads').update({ai_draft:draft,status:'draft'}).eq('id',thread.id).in('status',['new','draft','needs_review']).select('id').maybeSingle();
   if(error) throw error;
   if(!updated) return Response.json({error:'Draft status changed'},{status:409});
   await db.from('email_audit').insert({thread_id:thread.id,action:'ai_draft',actor:session.user.id});
   return Response.json({draft});
  }
  if(body.action==='save') {
   if(typeof body.id!=='string'||typeof body.content!=='string'||!body.content.trim()||body.content.length>20000) return Response.json({error:'Invalid draft'},{status:400});
   const {data,error}=await db.from('email_threads').update({ai_draft:body.content,status:'draft',draft_edited_at:new Date().toISOString()}).eq('id',body.id).in('status',['new','draft','needs_review']).select('id').maybeSingle();
   if(error) throw error;
   if(!data) return Response.json({error:'Draft no longer editable'},{status:409});
   await db.from('email_audit').insert({thread_id:body.id,action:'draft_saved',actor:session.user.id});
   return Response.json({saved:true});
  }
  if(body.action!=='list') return Response.json({error:'Action not enabled'},{status:403});
  const {data,error} = await db.from('email_threads').select('*').order('received_at',{ascending:false}).limit(100);
  if (error) throw error;
  return Response.json({items:data});
 }catch(err){ return Response.json({error:String(err)},{status:500}); }
});
