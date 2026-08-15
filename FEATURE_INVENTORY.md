# HouseCal feature inventory and completion plan

Updated 2026-08-14.

## Working in the current web display

- Supabase sign-in and protected household access.
- Display pairing with one-time codes and display tokens.
- Google Calendar OAuth, calendar sync, all-day event handling, local date/time rendering, and profile photo display.
- Google Photos Picker session creation, resumable polling, private Storage uploads, signed display URLs, randomized photo layouts, and night mode.
- Playlist scenes for Calendar, Photos, Week, Routines, Weather, Traffic, and News.
- Local news playlist scene, using a protected server-side RSS fetch for the detected city.
- Persistent routines, daily completion records, meal plans, display timing/night settings, real month grid, and offline shell caching.
- 1920x1080 display-first layout and automatic scene rotation.

## Partially working or still needing production verification

- Google Photos: the user-selection/import loop needs a real end-to-end selection and database verification in production; the app now reports expired sessions instead of silently failing.
- Weather: live current conditions are implemented using Open-Meteo and the display's public-IP geolocation; location settings and a household-configurable override are not implemented yet.
- Local news: headline retrieval is implemented through the secured `local-news` Edge Function and cached per city for 30 minutes; stale cached headlines are served if the upstream Google News RSS feed is temporarily unavailable.
- Traffic: a separate scene and secured TomTom flow/incident Edge Function are implemented with a 30-minute refresh. It needs the free developer `TOMTOM_API_KEY` Supabase secret before live data can appear.
- Fire TV: the responsive web display is ready to host in Silk or wrap in a WebView APK; a packaged Fire TV APK has not been created.

## Not implemented yet

- Roku native channel. Roku requires a separate SceneGraph/BrightScript client that consumes the existing Supabase display-state endpoint.
- Household member management, assignments, completion history beyond today, and notifications.
- Recipe/shopping-list management beyond the persisted meal title, subtitle, and recipe URL.
- Push/background notifications.
- Household settings for city, traffic destination, scene durations, photo collections, and night-mode schedule.

## Recommended build order

1. Complete the production Google Photos selection/import verification.
2. Add household settings for location, traffic destination, playlist timing, and display brightness schedule.
3. Add household member management, assignments, and notifications.
4. Add the `TOMTOM_API_KEY` secret to activate live traffic.
5. Package and sideload the Fire TV client, then build the Roku SceneGraph client against the same pairing/state contract.
6. Add background refresh monitoring and production smoke tests for every display platform.
