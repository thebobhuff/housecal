create table if not exists public.local_news_cache (
  city_key text primary key,
  city_label text not null,
  articles jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.local_news_cache enable row level security;
revoke all on public.local_news_cache from anon, authenticated;
