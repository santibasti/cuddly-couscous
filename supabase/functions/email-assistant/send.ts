import { db, graph } from './shared.ts';
export async function sendApprovedReply(threadId:string,actor:string) {
 if(Deno.env.get('EMAIL_SEND_ENABLED')!=='true')throw Error('Email sending is not enabled.');
 const {data:locked,error:lockError}=await db.from('email_threads')
  .update({status:'sending',updated_at:new Date().toISOString()})
  .eq('id',threadId).eq('status','draft').not('ai_draft','is',null).select('*').maybeSingle();
 if(lockError)throw lockError;
 if(!locked)throw Error('No unsent approved draft available.');
 await db.from('email_audit').insert({thread_id:threadId,action:'send_started',actor});
 try{
  // Stop if anyone already replied after this incoming message.
  const sent=await graph('/mailFolders/sentitems/messages?$top=100&$select=conversationId,sentDateTime');
  if((sent.value||[]).some((x:{conversationId?:string;sentDateTime?:string})=>x.conversationId===locked.conversation_id && x.sentDateTime && x.sentDateTime>locked.received_at)){
   throw Error('Conversation already has a newer outgoing reply');
  }
  const draft=await graph('/messages/'+encodeURIComponent(locked.graph_message_id)+'/createReply','POST',{});
  if(!draft?.id)throw Error('Microsoft did not return reply draft ID');
  await db.from('email_threads').update({graph_sent_draft_id:draft.id}).eq('id',threadId);
  await graph('/messages/'+encodeURIComponent(draft.id),'PATCH',{body:{contentType:'Text',content:locked.ai_draft}});
  await graph('/messages/'+encodeURIComponent(draft.id)+'/send','POST');
  const {error}=await db.from('email_threads').update({status:'sent',sent_at:new Date().toISOString(),sent_by:actor,error_message:null}).eq('id',threadId);
  if(error)throw error;
  await db.from('email_audit').insert({thread_id:threadId,action:'sent',actor});
  return {sent:true};
 }catch(error){
  await db.from('email_threads').update({status:'needs_review',error_message:String(error)}).eq('id',threadId);
  await db.from('email_audit').insert({thread_id:threadId,action:'uncertain_send',actor});
  throw Error('Send outcome uncertain. Review Outlook Sent Items and Drafts; do not retry automatically.');
 }
}
