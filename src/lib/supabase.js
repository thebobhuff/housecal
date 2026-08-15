import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the deployment environment.');
}

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-config.invalid',
  supabasePublishableKey || 'missing-supabase-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  if (!supabaseConfigured) {
    return { data: null, error: new Error('Supabase is not configured for this deployment. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy.') };
  }
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function createHousehold(name = 'Our family') {
  const { data, error } = await supabase.rpc('create_household', { household_name: name });
  if (error) throw error;
  return data;
}

export async function createDisplayPairing(householdId, deviceName = 'HouseCal display') {
  const { data, error } = await supabase.rpc('create_display_pairing', {
    target_household: householdId,
    device_name: deviceName,
  });
  if (error) throw error;
  return data?.[0];
}

export async function claimDisplayPairing(code, deviceName = 'HouseCal display') {
  const { data, error } = await supabase.rpc('claim_display_pairing', {
    pairing_code: code,
    device_name: deviceName,
  });
  if (error) throw error;
  const pairing = data?.[0];
  if (pairing?.device_token) localStorage.setItem('housecal_display_token', pairing.device_token);
  return pairing;
}

export async function validateDisplaySession() {
  const token = localStorage.getItem('housecal_display_token');
  if (!token) return null;
  const { data, error } = await supabase.rpc('get_display_state', { display_token: token });
  if (error || !data?.[0]) {
    localStorage.removeItem('housecal_display_token');
    return null;
  }
  return data[0];
}

async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const payload = await error.context?.json();
      if (payload?.error) message = payload.error;
    } catch { /* Keep the SDK error when the response body is unavailable. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function startGoogleConnection(provider, householdId) {
  return invokeFunction('google-connect-start', { provider, household_id: householdId });
}

export async function syncGoogleCalendar(householdId) {
  return invokeFunction('google-calendar-sync', { household_id: householdId });
}

export async function startGooglePhotosPicker(householdId) {
  return invokeFunction('google-photos-start', { household_id: householdId });
}

export async function pollGooglePhotosPicker(householdId, sessionId) {
  return invokeFunction('google-photos-poll', { household_id: householdId, session_id: sessionId });
}

export async function loadHousecalState({ householdId, displayToken } = {}) {
  return invokeFunction('housecal-state', { household_id: householdId, display_token: displayToken });
}

export async function loadLocalNews({ city, householdId, displayToken } = {}) {
  return invokeFunction('local-news', { city, household_id: householdId, display_token: displayToken });
}

export async function loadTraffic({ latitude, longitude, householdId, displayToken } = {}) {
  return invokeFunction('traffic', { latitude, longitude, household_id: householdId, display_token: displayToken });
}
