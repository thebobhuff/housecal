import { corsHeaders, json, options } from '../_shared/cors.ts';
import { adminClient, assertMember, requireUser } from '../_shared/supabase.ts';

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function readTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function recentArticles(articles: any[]) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return articles.filter((article) => {
    const published = Date.parse(article.published_at || '');
    return Number.isFinite(published) && published >= cutoff;
  });
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
    const { supabase } = await resolveHousehold(req, body.household_id, body.display_token);
    const cityKey = city.toLocaleLowerCase();
    const { data: cached } = await supabase.from('local_news_cache').select('city_label, articles, fetched_at, expires_at').eq('city_key', cityKey).maybeSingle();
    const cachedArticles = recentArticles(cached?.articles || []);
    if (cached && new Date(cached.expires_at).getTime() > Date.now() && cachedArticles.length) {
      return json({ city: cached.city_label, articles: cachedArticles, fetched_at: cached.fetched_at, cached: true });
    }
    try {
      const queries = [`${city} when:2d`, `${city} local news when:2d`];
      const feedResults = await Promise.all(queries.map(async (query) => {
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const response = await fetch(feedUrl, { headers: { 'User-Agent': 'HouseCal/1.0 local-news-feed' } });
        if (!response.ok) throw new Error('Local news service unavailable');
        return response.text();
      }));
      const articles = recentArticles(feedResults.flatMap((xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
        const item = match[1];
        return { title: readTag(item, 'title'), link: readTag(item, 'link'), published_at: readTag(item, 'pubDate'), source: readTag(item, 'source') || 'Local news' };
      })).filter((article) => article.title && article.link).filter((article, index, all) => all.findIndex((candidate) => candidate.link === article.link) === index).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))).slice(0, 8);
      if (!articles.length && cachedArticles.length) return json({ city: cached.city_label, articles: cachedArticles, fetched_at: cached.fetched_at, cached: true });
      const fetchedAt = new Date();
      const expiresAt = new Date(fetchedAt.getTime() + 30 * 60 * 1000);
      const { error: cacheError } = await supabase.from('local_news_cache').upsert({ city_key: cityKey, city_label: city, articles, fetched_at: fetchedAt.toISOString(), expires_at: expiresAt.toISOString(), updated_at: fetchedAt.toISOString() });
      if (cacheError) throw cacheError;
      return json({ city, articles, fetched_at: fetchedAt.toISOString(), cached: false });
    } catch (upstreamError) {
      if (cached) return json({ city: cached.city_label, articles: recentArticles(cached.articles || []), fetched_at: cached.fetched_at, cached: true, stale: true });
      throw upstreamError;
    }
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Local news unavailable' }, 400); }
});
