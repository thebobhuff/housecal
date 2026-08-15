import { corsHeaders, json, options } from '../_shared/cors.ts';
import { adminClient, assertMember, requireUser } from '../_shared/supabase.ts';

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function readTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

async function resolveHousehold(req: Request, requestedHouseholdId?: string, displayToken?: string) {
  if (displayToken) {
    const supabase = adminClient();
    const { data } = await supabase.rpc('get_display_state', { display_token: displayToken });
    if (!data?.[0]?.household_id) throw new Error('Display is not paired');
    return { supabase, householdId: data[0].household_id };
  }
  const identity = await requireUser(req);
  let { data: member } = await identity.supabase.from('household_members').select('household_id').eq('user_id', identity.user.id).eq('household_id', requestedHouseholdId).maybeSingle();
  if (!member) ({ data: member } = await identity.supabase.from('household_members').select('household_id').eq('user_id', identity.user.id).order('created_at').limit(1).maybeSingle());
  if (!member?.household_id) throw new Error('Not a household member');
  await assertMember(identity.supabase, identity.user.id, member.household_id);
  return { supabase: identity.supabase, householdId: member.household_id };
}

Deno.serve(async (req) => {
  const preflight = options(req); if (preflight) return preflight;
  try {
    const body = await req.json();
    const city = String(body.city || '').trim().slice(0, 80);
    if (!city) throw new Error('A local city is required');
    await resolveHousehold(req, body.household_id, body.display_token);
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${city} local news`)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(feedUrl, { headers: { 'User-Agent': 'HouseCal/1.0 local-news-feed' } });
    if (!response.ok) throw new Error('Local news service unavailable');
    const xml = await response.text();
    const articles = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8).map((match) => {
      const item = match[1];
      return { title: readTag(item, 'title'), link: readTag(item, 'link'), published_at: readTag(item, 'pubDate'), source: readTag(item, 'source') || 'Local news' };
    }).filter((article) => article.title && article.link);
    return json({ city, articles, fetched_at: new Date().toISOString() });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Local news unavailable' }, 400); }
});
