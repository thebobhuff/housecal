import { corsHeaders, options } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

function response(body: BodyInit, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...corsHeaders, ...headers } });
}

async function authorize(req: Request, url: URL) {
  const displayToken = url.searchParams.get('display_token');
  if (displayToken) {
    const { data } = await adminClient().rpc('get_display_state', { display_token: displayToken });
    if (!data?.[0]?.household_id) throw new Error('Display is not paired');
    return;
  }
  const token = url.searchParams.get('access_token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required');
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Authentication required');
  const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', data.user.id).limit(1).maybeSingle();
  if (!member?.household_id) throw new Error('Not a household member');
}

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/\/traffic-map-tile\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!match) return response('Tile coordinates are required', 400, { 'Content-Type': 'text/plain' });
    await authorize(req, url);
    const key = Deno.env.get('TOMTOM_API_KEY');
    if (!key) return response('Traffic API key is not configured', 503, { 'Content-Type': 'text/plain' });
    const [, zoom, x, y] = match;
    const tileUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative/${zoom}/${x}/${y}.png?key=${encodeURIComponent(key)}`;
    const tile = await fetch(tileUrl);
    if (!tile.ok) return response('Traffic tile unavailable', tile.status, { 'Content-Type': 'text/plain' });
    return response(await tile.arrayBuffer(), 200, { 'Content-Type': tile.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=300' });
  } catch (error) {
    return response(error instanceof Error ? error.message : 'Traffic tile unavailable', 401, { 'Content-Type': 'text/plain' });
  }
});
