import { corsHeaders, json, options } from '../_shared/cors.ts';
import { assertMember, requireUser } from '../_shared/supabase.ts';
import { GOOGLE_SCOPES, googleConfig } from '../_shared/google.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { supabase, user } = await requireUser(req);
    const { household_id, provider } = await req.json();
    if (!['calendar', 'photos'].includes(provider)) return json({ error: 'Unsupported Google provider' }, 400);
    await assertMember(supabase, user.id, household_id);
    const config = googleConfig();
    const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const { error: stateError } = await supabase.from('oauth_states').insert({ state, user_id: user.id, household_id, provider, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    if (stateError) throw stateError;
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', scope: GOOGLE_SCOPES[provider as 'calendar' | 'photos'].join(' '), state });
    return new Response(JSON.stringify({ auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unable to start Google connection' }, 400); }
});
