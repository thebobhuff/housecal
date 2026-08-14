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

The Google Calendar and Google Photos labels in the menu are intentionally marked as “coming next” until OAuth credentials and a backend are configured.
