import { createClient } from 'npm:@supabase/supabase-js@2';

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireUser(req: Request) {
  const header = req.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required');
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Authentication required');
  return { supabase, user: data.user };
}

export async function assertMember(supabase: ReturnType<typeof adminClient>, userId: string, householdId: string) {
  const { data, error } = await supabase.from('household_members').select('household_id').eq('household_id', householdId).eq('user_id', userId).maybeSingle();
  if (error || !data) throw new Error('Not a household member');
}
