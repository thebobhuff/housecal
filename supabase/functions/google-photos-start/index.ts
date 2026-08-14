import { corsHeaders, json, options } from '../_shared/cors.ts';
import { assertMember, requireUser } from '../_shared/supabase.ts';
import { connectedGoogle } from '../_shared/google.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { supabase, user } = await requireUser(req);
    const { household_id } = await req.json();
    await assertMember(supabase, user.id, household_id);
    const { accessToken } = await connectedGoogle(supabase, household_id, 'photos');
    const response = await fetch('https://photospicker.googleapis.com/v1/sessions', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ pickingConfig: { maxItemCount: 200 } }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || 'Unable to start Google Photos Picker');
    return json({ session_id: payload.id, picker_uri: `${payload.pickerUri}/autoclose`, polling_config: payload.pollingConfig, expires_at: payload.expireTime });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Photos Picker failed' }, 400); }
});
