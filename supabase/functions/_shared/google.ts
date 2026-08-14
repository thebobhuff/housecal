import { decrypt, encrypt } from './crypto.ts';

export const GOOGLE_SCOPES = {
  calendar: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly'],
  photos: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'],
};

export function googleConfig() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');
  const appUrl = Deno.env.get('APP_URL');
  if (!clientId || !clientSecret || !redirectUri || !appUrl) throw new Error('Google OAuth secrets are not configured');
  return { clientId, clientSecret, redirectUri, appUrl };
}

export async function exchangeCode(code: string) {
  const config = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code' }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || 'Google token exchange failed');
  return payload;
}

export async function googleUserInfo(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || 'Google profile lookup failed');
  return payload;
}

export async function getAccessToken(supabase: any, connection: any) {
  const refreshToken = await decrypt(connection.refresh_token_encrypted);
  const config = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || 'Google token refresh failed');
  const expiresAt = new Date(Date.now() + (payload.expires_in || 3600) * 1000).toISOString();
  await supabase.from('google_connections').update({ access_token_encrypted: await encrypt(payload.access_token), expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', connection.id);
  return payload.access_token;
}

export async function connectedGoogle(supabase: any, householdId: string, provider: string) {
  const { data, error } = await supabase.from('google_connections').select('*').eq('household_id', householdId).eq('provider', provider).maybeSingle();
  if (error || !data) throw new Error(`Google ${provider} is not connected`);
  return { connection: data, accessToken: await getAccessToken(supabase, data) };
}

export { encrypt };
