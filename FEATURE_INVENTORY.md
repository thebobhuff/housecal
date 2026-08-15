# HouseCal feature inventory and completion plan

Updated 2026-08-14.

## Working in the current web display

- Supabase sign-in and protected household access.
- Display pairing with one-time codes and display tokens.
- Google Calendar OAuth, calendar sync, all-day event handling, local date/time rendering, and profile photo display.
- Google Photos Picker session creation, resumable polling, private Storage uploads, signed display URLs, randomized photo layouts, and night mode.
- Playlist scenes for Calendar, Photos, Week, Routines, and Weather.
- 1920x1080 display-first layout and automatic scene rotation.

## Partially working or still needing production verification

- Google Photos: the user-selection/import loop needs a real end-to-end selection and database verification in production; the app now reports expired sessions instead of silently failing.
- Weather: live current conditions are implemented for Chicago using Open-Meteo; location settings and a household-configurable location are not implemented yet.
- Traffic: the display now provides a live Google Maps traffic launch link and an honest placeholder surface. An embedded live map needs a Google Maps embed/API key and a configured `VITE_TRAFFIC_MAP_URL`.
- Fire TV: the responsive web display is ready to host in Silk or wrap in a WebView APK; a packaged Fire TV APK has not been created.

## Not implemented yet

- Roku native channel. Roku requires a separate SceneGraph/BrightScript client that consumes the existing Supabase display-state endpoint.
- Persistent meal planning and shopping lists; the current meal cards are presentation-only.
- Persistent routines/chore assignments, household members, completion history, and notifications.
- Month calendar view; the current control is visual and does not yet render a month grid.
- Push/background sync and offline cache for a display that temporarily loses network access.
- Household settings for city, traffic destination, scene durations, photo collections, and night-mode schedule.

## Recommended build order

1. Complete the production Google Photos selection/import verification.
2. Add household settings for location, traffic destination, playlist timing, and display brightness schedule.
3. Replace presentation-only routines and meals with Supabase tables, RLS policies, and operator controls.
4. Add an embedded traffic provider after a Google Maps key or another traffic API is supplied.
5. Package and sideload the Fire TV client, then build the Roku SceneGraph client against the same pairing/state contract.
6. Add offline caching, background refresh, monitoring, and production smoke tests for every display platform.
