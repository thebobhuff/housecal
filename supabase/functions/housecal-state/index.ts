import { corsHeaders, json, options } from '../_shared/cors.ts';
import { adminClient, assertMember, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = adminClient();
    let householdId = body.household_id;
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader && !body.display_token) { const identity = await requireUser(req); householdId = householdId || (await identity.supabase.from('household_members').select('household_id').eq('user_id', identity.user.id).limit(1).maybeSingle()).data?.household_id; }
    if (body.display_token) { const { data } = await supabase.rpc('get_display_state', { display_token: body.display_token }); householdId = data?.[0]?.household_id; }
    if (!householdId) throw new Error('Household access required');
    if (!body.display_token && authHeader) { const identity = await requireUser(req); await assertMember(supabase, identity.user.id, householdId); }
    const [{ data: events }, { data: photos }, { data: routines }, { data: completions }, { data: meals }, { data: settings }, { data: people }] = await Promise.all([
      supabase.from('events').select('*').eq('household_id', householdId).order('starts_at').limit(200),
      supabase.from('photo_selections').select('*').eq('household_id', householdId).order('created_at', { ascending: false }).limit(100),
      supabase.from('routines').select('id,title,sort_order,active').eq('household_id', householdId).eq('active', true).order('sort_order'),
      supabase.from('routine_completions').select('routine_id,completed_on').eq('completed_on', new Date().toISOString().slice(0, 10)),
      supabase.from('meal_plans').select('*').eq('household_id', householdId).order('meal_date').limit(14),
      supabase.from('household_settings').select('*').eq('household_id', householdId).maybeSingle(),
      body.display_token ? supabase.from('household_people').select('*').eq('household_id', householdId).eq('show_on_display', true).order('created_at') : supabase.from('household_people').select('*').eq('household_id', householdId).order('created_at'),
    ]);
    const photoResults = await Promise.all((photos || []).filter((photo) => photo.storage_path).map(async (photo) => { const { data } = await supabase.storage.from('housecal-photos').createSignedUrl(photo.storage_path, 3600); return { ...photo, url: data?.signedUrl || null }; }));
    const { data: household } = await supabase.from('households').select('name').eq('id', householdId).maybeSingle();
    return json({ household_id: householdId, household_name: household?.name || 'Our family', events: events || [], photos: photoResults.filter((photo) => photo.url), routines: routines || [], routine_completions: completions || [], meals: meals || [], settings: settings || null, people: people || [] });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unable to load HouseCal state' }, 401); }
});
