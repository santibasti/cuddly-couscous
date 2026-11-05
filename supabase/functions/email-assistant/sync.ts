import { graph } from './shared.ts';
import { db } from './shared.ts';
export async function syncInbox() {
 const result = await graph('/mailFolders/inbox/messages?$top=20&$select=id,conversationId,from,subject,bodyPreview,receivedDateTime');
 const items = (result.value || []) as Array<any>;
 let imported = 0;
 for (const m of items) {
  const sender = m.from?.emailAddress?.address;
  if (!m.id || !sender || !m.receivedDateTime) continue;
  const row = { graph_message_id:m.id, conversation_id:m.conversationId||null, sender_email:sender,
   sender_name:m.from.emailAddress.name||null, subject:m.subject||'', preview:m.bodyPreview||'', received_at:m.receivedDateTime };
  const {error} = await db.from('email_threads').upsert(row, {onConflict:'graph_message_id',ignoreDuplicates:true});
  if(error) throw error;
  imported++;
 }
 return {processed:imported,checked:items.length};
}
