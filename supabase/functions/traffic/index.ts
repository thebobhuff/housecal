import { corsHeaders, json, options } from '../_shared/cors.ts';
import { adminClient, assertMember, requireUser } from '../_shared/supabase.ts';

async function authorize(req: Request, householdId?: string, displayToken?: string) {
  if (displayToken) {
    const supabase = adminClient();
    const { data } = await supabase.rpc('get_display_state', { display_token: displayToken });
    if (!data?.[0]?.household_id) throw new Error('Display is not paired');
    return { supabase, householdId: data[0].household_id };
  }
  const identity = await requireUser(req);
  let { data: member } = await identity.supabase.from('household_members').select('household_id').eq('user_id', identity.user.id).eq('household_id', householdId).maybeSingle();
  if (!member) ({ data: member } = await identity.supabase.from('household_members').select('household_id').eq('user_id', identity.user.id).order('created_at').limit(1).maybeSingle());
  if (!member?.household_id) throw new Error('Not a household member');
  await assertMember(identity.supabase, identity.user.id, member.household_id);
  return { supabase: identity.supabase, householdId: member.household_id };
}

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const body = await req.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Traffic coordinates are required');
    await authorize(req, body.household_id, body.display_token);
    const key = Deno.env.get('TOMTOM_API_KEY');
    if (!key) return json({ configured: false, incidents: [], flow: null, message: 'Traffic needs a TOMTOM_API_KEY secret' });
    const bbox = `${longitude - 0.2},${latitude + 0.15},${longitude + 0.2},${latitude - 0.15}`;
    const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description}}}}';
    const incidentUrl = new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');
    incidentUrl.searchParams.set('key', key); incidentUrl.searchParams.set('bbox', bbox); incidentUrl.searchParams.set('fields', fields); incidentUrl.searchParams.set('language', 'en-US'); incidentUrl.searchParams.set('timeValidityFilter', 'present');
    const flowUrl = new URL('https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json');
    flowUrl.searchParams.set('point', `${latitude},${longitude}`); flowUrl.searchParams.set('unit', 'mph'); flowUrl.searchParams.set('key', key);
    const [incidentResponse, flowResponse] = await Promise.all([fetch(incidentUrl), fetch(flowUrl)]);
    const incidentPayload = await incidentResponse.json();
    const flowPayload = await flowResponse.json();
    if (!incidentResponse.ok && !flowResponse.ok) throw new Error(incidentPayload.error?.description || 'Traffic service unavailable');
    const incidents = (incidentPayload.incidents || []).slice(0, 10).map((incident: any) => ({ title: incident.properties?.events?.[0]?.description || 'Traffic incident', category: incident.properties?.iconCategory || 'Incident', delay: incident.properties?.magnitudeOfDelay || 0 }));
    const flow = flowPayload.flowSegmentData ? { currentSpeed: flowPayload.flowSegmentData.currentSpeed, freeFlowSpeed: flowPayload.flowSegmentData.freeFlowSpeed, confidence: flowPayload.flowSegmentData.confidence } : null;
    return json({ configured: true, incidents, flow, fetched_at: new Date().toISOString() });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Traffic unavailable' }, 400); }
});
