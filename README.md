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
- Fire TV-friendly no-backend demo data

## Production integration plan

1. Add a small Node/Next API layer for Google OAuth, encrypted refresh-token storage, and per-household access control.
2. Sync Google Calendar through the Calendar API using incremental sync tokens and push notifications; normalize events into a HouseCal household model.
3. Connect Google Photos through the current Photos Library API scopes and cache resized, short-lived display URLs server-side. Do not expose Google refresh tokens to the TV client.
4. Add a pairing flow: the TV shows a short code, a phone/browser completes Google sign-in, and the TV receives a scoped household session.
5. Package the display for Fire TV as a signed Android TV APK or ship it as a secure hosted web app, depending on the desired installation path.

The Google Calendar and Google Photos flows use Supabase Edge Functions. They require the database migrations and Google credentials below before they can be used in production.

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
