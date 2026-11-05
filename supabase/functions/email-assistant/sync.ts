import { graph, db } from './shared.ts';
type Mail={id:string;conversationId?:string;from?:{emailAddress?:{address?:string;name?:string}};subject?:string;bodyPreview?:string;receivedDateTime?:string};
type Sent={conversationId?:string;sentDateTime?:string};
export async function syncInbox(){
 const result=await graph('/mailFolders/inbox/messages?$top=40&$orderby=receivedDateTime%20desc&$select=id,conversationId,from,subject,bodyPreview,receivedDateTime');
 const items=(result.value||[]) as Mail[];
 const out=await graph('/mailFolders/sentitems/messages?$top=100&$orderby=sentDateTime%20desc&$select=conversationId,sentDateTime');
 const sent=(out.value||[]) as Sent[];
 const lastSent=new Map<string,string>();
 for(const m of sent){
  if(m.conversationId&&m.sentDateTime&&(!lastSent.has(m.conversationId)||m.sentDateTime>lastSent.get(m.conversationId)!))lastSent.set(m.conversationId,m.sentDateTime);
 }
 let imported=0;
 for(const m of items){
  const sender=m.from?.emailAddress?.address;
  if(!m.id||!sender||!m.receivedDateTime)continue;
  const newest=lastSent.get(m.conversationId||'');
  const answered=Boolean(newest&&newest>m.receivedDateTime);
  const row={graph_message_id:m.id,conversation_id:m.conversationId||null,sender_email:sender.toLowerCase(),
   sender_name:m.from?.emailAddress?.name||null,subject:m.subject||'',preview:m.bodyPreview||'',
   received_at:m.receivedDateTime,status:answered?'sent':'new',sent_at:answered?newest:null};
  const {error}=await db.from('email_threads').upsert(row,{onConflict:'graph_message_id',ignoreDuplicates:true});
  if(error)throw error;
  imported++;
 }
 return {checked:items.length,processed:imported};
}
