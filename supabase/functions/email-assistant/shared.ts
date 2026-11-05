import { createClient } from 'npm:@supabase/supabase-js@2';
export const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
export async function authorize(request:Request){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)throw Error('Authentication failed');
 const {data:p}=await db.from('profiles').select('role,active,deleted_at').eq('id',data.user.id).single();
 if(!p?.active||p.deleted_at||!['owner','ops'].includes(p.role))throw Error('Access denied');
 return data.user.id;
}
export async function graph(path:string,method='GET',body?:unknown){
 const tenant=Deno.env.get('MS_TENANT_ID'),client=Deno.env.get('MS_CLIENT_ID'),secret=Deno.env.get('MS_CLIENT_SECRET'),mailbox=Deno.env.get('EMAIL_MAILBOX');
 if(!tenant||!client||!secret||!mailbox)throw Error('Microsoft connection not configured');
 const auth=await fetch('https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'})});
 if(!auth.ok)throw Error('Microsoft authorization failed');
 const token=(await auth.json()).access_token;
 const res=await fetch('https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(mailbox)+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 if(!res.ok)throw Error('Outlook request failed ('+res.status+')');
 return res.status===204?null:res.json();
}
