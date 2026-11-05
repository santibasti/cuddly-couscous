import { useEffect, useState } from 'react';
import { PageHead, Card, Badge } from '@/components/ui';
import { CLOUD, supabase } from '@/lib/cloud';

type Mail = {id:string; sender_email:string; sender_name:string|null; subject:string; preview:string; status:string; received_at:string; ai_draft:string|null};
export default function EmailInbox(){
 const [items,setItems]=useState<Mail[]>([]);
 const [selected,setSelected]=useState('');
 const [body,setBody]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const current=items.find(x=>x.id===selected);
 async function invoke(action:string,extra:Record<string,unknown>={}){
  const {data,error}=await supabase().functions.invoke('email-assistant',{body:{action,...extra}});
  if(error)throw error;
  if(data?.error)throw Error(data.error);
  return data;
 }
 async function refresh(){
  const data=await invoke('list');
  setItems(data.items||[]);
  return data;
 }
 useEffect(()=>{if(!CLOUD)return;void refresh().catch(e=>setError(String(e)));},[]);
 useEffect(()=>{setBody(current?.ai_draft||'')},[selected,items]);
 async function act(action:'sync'|'suggest'|'save'|'send'){
  if(action==='send'&&!window.confirm('Send saved reply from info@topmop.ph to '+(current?.sender_email||'')+'?'))return;
  setBusy(true);setNotice('');setError('');
  try{
   const result=await invoke(action,action==='sync'?{}:action==='save'?{id:selected,content:body}:action==='send'?{id:selected,confirm:true}:{id:selected});
   if(action==='sync')setNotice('Inbox checked: '+result.checked+'; messages processed: '+result.processed);
   if(action==='suggest')setNotice('AI reply prepared. Review all details before saving.');
   if(action==='save')setNotice('Reply draft saved. Nothing has been sent.');
   if(action==='send')setNotice('Microsoft accepted the approved reply for sending.');
   await refresh();
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 return <div>
  <PageHead title="AI Email Inbox" sub="Outlook customer inquiries — review each reply before sending">
   <button className="btn primary" disabled={busy||!CLOUD} onClick={()=>void act('sync')}>Sync Outlook</button>
  </PageHead>
  {!CLOUD&&<div className="alert warn">Connect Supabase before using Outlook.</div>}
  {error&&<div className="alert warn" role="alert">{error}</div>}
  {notice&&<div className="alert" role="status">{notice}</div>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(250px,1fr) minmax(300px,1.6fr)',gap:14,alignItems:'start'}}>
   <Card title="Inbox">
    <div className="stack">
     {items.length===0?<p className="small muted">No emails imported yet. Sync after the Microsoft connection is configured.</p>:items.map(m=>
      <button key={m.id} className="btn block" onClick={()=>setSelected(m.id)} style={{height:'auto',textAlign:'left',whiteSpace:'normal',padding:10}}>
       <div className="row" style={{justifyContent:'space-between'}}><b>{m.sender_name||m.sender_email}</b><Badge>{m.status}</Badge></div>
       <div className="small">{m.subject}</div><div className="small muted">{m.preview.slice(0,110)}</div>
      </button>)}
    </div>
   </Card>
   <Card title="Reply editor">
    {!current?<p className="muted">Select an inquiry to review.</p>:<div className="stack">
     <div><b>{current.subject}</b><div className="small muted">{current.sender_email}</div></div>
     <p className="small" style={{whiteSpace:'pre-wrap'}}>{current.preview}</p>
     <button className="btn" disabled={busy||current.status==='sent'} onClick={()=>void act('suggest')}>Generate AI reply</button>
     <label htmlFor="ai-mail-editor"><b>Reply draft</b></label>
     <textarea id="ai-mail-editor" rows={12} value={body} onChange={e=>setBody(e.target.value)} />
     <div className="row"><button className="btn primary" disabled={busy||!body.trim()||current.status==='sent'} onClick={()=>void act('save')}>Save draft</button><button className="btn" disabled={busy||current.status!=='draft'||body!==current.ai_draft} onClick={()=>void act('send')}>Approve &amp; send</button><span className="small muted">Requires server activation</span></div>
    </div>}
   </Card>
  </div>
 </div>;
}
