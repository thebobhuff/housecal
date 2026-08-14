import { googleConfig, exchangeCode, encrypt } from '../_shared/google.ts';
import { adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const config = googleConfig();
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');
  if (error || !state) return Response.redirect(`${config.appUrl}/?google=error`, 302);
  try {
    const supabase = adminClient();
    const { data: oauthState } = await supabase.from('oauth_states').select('*').eq('state', state).maybeSingle();
    if (!oauthState || new Date(oauthState.expires_at) < new Date()) return Response.redirect(`${config.appUrl}/?google=error&reason=expired_state`, 302);
    const tokens = await exchangeCode(url.searchParams.get('code') || '');
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Reconnect with consent.');
    await supabase.from('google_connections').upsert({ household_id: oauthState.household_id, user_id: oauthState.user_id, provider: oauthState.provider, access_token_encrypted: await encrypt(tokens.access_token), refresh_token_encrypted: await encrypt(tokens.refresh_token), expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(), scope: tokens.scope, updated_at: new Date().toISOString() }, { onConflict: 'household_id,provider' });
    await supabase.from('oauth_states').delete().eq('state', state);
    return Response.redirect(`${config.appUrl}/?google=connected&provider=${oauthState.provider}`, 302);
  } catch (caught) { return Response.redirect(`${config.appUrl}/?google=error&reason=${encodeURIComponent(caught instanceof Error ? caught.message : 'oauth_failed')}`, 302); }
});
