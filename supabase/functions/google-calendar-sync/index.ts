import { corsHeaders, json, options } from '../_shared/cors.ts';
import { assertMember, requireUser } from '../_shared/supabase.ts';
import { connectedGoogle, googleUserInfo } from '../_shared/google.ts';

async function googleGet(url: string, accessToken: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }); const body = await response.json(); if (response.status === 410) return { syncExpired: true }; if (!response.ok) throw new Error(body.error?.message || 'Google Calendar request failed'); return body; }

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { supabase, user } = await requireUser(req);
    const { household_id } = await req.json();
    await assertMember(supabase, user.id, household_id);
    const { accessToken, connection } = await connectedGoogle(supabase, household_id, 'calendar');
    const profile = await googleUserInfo(accessToken);
    await supabase.from('google_connections').update({ profile_name: profile.name || null, profile_email: profile.email || null, profile_picture_url: profile.picture || null, updated_at: new Date().toISOString() }).eq('id', connection.id);
    const calendars = await googleGet('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', accessToken);
    let imported = 0;
    for (const calendar of calendars.items || []) {
      const { data: source, error: sourceError } = await supabase.from('calendar_sources').upsert({ household_id, google_calendar_id: calendar.id, name: calendar.summary || calendar.id, color: calendar.backgroundColor || '#6d7b70' }, { onConflict: 'household_id,google_calendar_id' }).select().single();
      if (sourceError) throw sourceError;
      let pageToken = ''; let nextSyncToken = null;
      do {
        const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', showDeleted: 'true', maxResults: '2500' });
        if (pageToken) params.set('pageToken', pageToken); else if (source?.sync_token) params.set('syncToken', source.sync_token); else params.set('timeMin', new Date(Date.now() - 30 * 86400000).toISOString());
        const result = await googleGet(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`, accessToken);
        if (result.syncExpired) { await supabase.from('calendar_sources').update({ sync_token: null }).eq('id', source.id); pageToken = ''; nextSyncToken = null; source.sync_token = null; continue; }
        for (const item of result.items || []) {
          if (item.status === 'cancelled') { await supabase.from('events').delete().eq('household_id', household_id).eq('source', 'google_calendar').eq('external_id', item.id); continue; }
          const allDay = Boolean(item.start?.date);
          const start = item.start?.dateTime || `${item.start?.date}T12:00:00Z`;
          const end = item.end?.dateTime || (item.end?.date ? `${item.end.date}T12:00:00Z` : null);
          const { error: eventError } = await supabase.from('events').upsert({ household_id, external_id: item.id, source: 'google_calendar', title: item.summary || '(untitled)', starts_at: start, ends_at: end, all_day: allDay, location: item.location || null, person: 'Everyone', color: calendar.backgroundColor || '#6d7b70', updated_at: new Date().toISOString() }, { onConflict: 'household_id,source,external_id' });
          if (eventError) throw eventError;
          imported += 1;
        }
        pageToken = result.nextPageToken || ''; nextSyncToken = result.nextSyncToken || nextSyncToken;
      } while (pageToken);
      if (source?.id && nextSyncToken) await supabase.from('calendar_sources').update({ sync_token: nextSyncToken, updated_at: new Date().toISOString() }).eq('id', source.id);
    }
    return json({ imported, synced_at: new Date().toISOString() });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Calendar sync failed' }, 400); }
});
