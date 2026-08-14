# HouseCal

HouseCal is a Fire TV–friendly family command center: a calm, glanceable display for schedules, family routines, meal plans, and shared photos.

## Run it

```bash
npm install
npm run dev
```

Open the local URL in a browser. For a Fire TV proof of concept, host the built app on a reachable HTTPS URL and open it in a Silk-compatible browser or wrap the same frontend in a WebView APK. The layout intentionally uses large targets, no hover dependency, and a responsive 16:9 display-first composition.

## Current vertical slice

- Today / Week / Month display switching
- Family member color filters
- Add-event modal with immediate local state update
- Chore completion state
- Meal-plan card and photo screensaver-style panel
- Parent mode / awake display controls
- Scene playlist with 12-second auto-advance and direct scene controls:
  - Calendar: daily schedule and synced event rail
  - Photos: full-screen family photo frame
  - Week: seven-column week-at-a-glance calendar
  - Routines: chores and dinner plan dashboard
- Supabase-backed household access, display pairing, and live-data hooks

The Google Calendar and Google Photos flows use Supabase Edge Functions. The code is in this repository, but the migration, functions, and provider secrets must still be applied to the production Supabase project before the live buttons can connect.

## Google live-data setup

Apply both migrations in `supabase/migrations/`, then deploy the Edge Functions with the Supabase CLI. Configure a Google Cloud OAuth web client with the callback URL:

```text
https://jhdneughomcyoeechqkt.supabase.co/functions/v1/google-oauth-callback
```

Enable Google Calendar API and Google Photos Picker API. Add these Supabase Edge Function secrets:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=https://jhdneughomcyoeechqkt.supabase.co/functions/v1/google-oauth-callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<long-random-secret>
APP_URL=https://housecal-one.vercel.app
SUPABASE_SECRET_KEY=<Supabase secret key>
```

Then deploy:

```bash
supabase functions deploy google-connect-start
supabase functions deploy google-oauth-callback
supabase functions deploy google-calendar-sync
supabase functions deploy google-photos-start
supabase functions deploy google-photos-poll
supabase functions deploy housecal-state
```

Google Photos uses the Picker API: a parent selects photos in Google Photos, HouseCal downloads them into the private `housecal-photos` Storage bucket, and the display receives short-lived signed URLs. The Picker API requires the `photospicker.mediaitems.readonly` scope and is intentionally user-selected rather than an unrestricted library reader.

## Vercel environment variables

The Vite build accepts these Vercel variables and embeds them into the browser bundle at build time:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

The publishable key is safe for browser use when Row Level Security is enabled. Never add a Supabase secret or service-role key to Vercel variables exposed to the client.
