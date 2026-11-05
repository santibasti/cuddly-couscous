import { createClient } from 'npm:@supabase/supabase-js@2';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({error:'POST required'},{status:405});
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ','');
  const {data:session,error:authError} = await db.auth.getUser(jwt);
  if (authError || !session.user) return Response.json({error:'Unauthorized'},{status:401});
  const {data:profile} = await db.from('profiles').select('role,active').eq('id',session.user.id).single();
  if (!profile?.active || !['owner','ops'].includes(profile.role)) return Response.json({error:'Forbidden'},{status:403});
  const {data,error} = await db.from('email_threads').select('*').order('received_at',{ascending:false}).limit(50);
  if (error) return Response.json({error:error.message},{status:500});
  return Response.json({items:data});
});
