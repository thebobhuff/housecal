import { corsHeaders, json, options } from '../_shared/cors.ts';
import { assertMember, requireUser } from '../_shared/supabase.ts';
import { connectedGoogle } from '../_shared/google.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const { supabase, user } = await requireUser(req);
    const { household_id, session_id } = await req.json();
    let { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).eq('household_id', household_id).maybeSingle();
    if (!member) ({ data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).order('created_at').limit(1).maybeSingle());
    const targetHousehold = member?.household_id;
    if (!targetHousehold) throw new Error('Not a household member');
    await assertMember(supabase, user.id, targetHousehold);
    const { accessToken } = await connectedGoogle(supabase, targetHousehold, 'photos');
    const sessionResponse = await fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(session_id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) throw new Error(session.error?.message || 'Unable to read Photos Picker session');
    if (!session.mediaItemsSet) return json({ ready: false, polling_config: session.pollingConfig });
    const mediaItems = [];
    let pageToken = '';
    do {
      const pageUrl = new URL('https://photospicker.googleapis.com/v1/mediaItems');
      pageUrl.searchParams.set('sessionId', session_id);
      if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);
      const mediaResponse = await fetch(pageUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const mediaPayload = await mediaResponse.json();
      if (!mediaResponse.ok) throw new Error(mediaPayload.error?.message || 'Unable to read selected photos');
      mediaItems.push(...(mediaPayload.mediaItems || []));
      pageToken = mediaPayload.nextPageToken || '';
    } while (pageToken);
    if (!mediaItems.length) return json({ ready: false, selected: 0, polling_config: session.pollingConfig });
    let imported = 0;
    for (const item of mediaItems) {
      const media = item.mediaFile || {};
      const baseUrl = media.baseUrl;
      if (!baseUrl) continue;
      const imageResponse = await fetch(`${baseUrl}=w1920-h1080`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!imageResponse.ok) throw new Error(`Unable to download selected photo (${imageResponse.status})`);
      const bytes = new Uint8Array(await imageResponse.arrayBuffer());
      const extension = (media.mimeType || 'image/jpeg').split('/')[1] || 'jpg';
      const storagePath = `${targetHousehold}/${item.id}.${extension}`;
      const upload = await supabase.storage.from('housecal-photos').upload(storagePath, bytes, { contentType: media.mimeType || 'image/jpeg', upsert: true });
      if (upload.error) throw upload.error;
      const { error: selectionError } = await supabase.from('photo_selections').upsert({ household_id: targetHousehold, google_media_id: item.id, storage_path: storagePath, caption: media.filename || null, width: media.mediaFileMetadata?.width || null, height: media.mediaFileMetadata?.height || null }, { onConflict: 'household_id,google_media_id' });
      if (selectionError) throw selectionError;
      imported += 1;
    }
    await fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(session_id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    return json({ ready: true, selected: mediaItems.length, imported });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Photos import failed' }, 400); }
});
