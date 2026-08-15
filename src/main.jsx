import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Check, ChevronDown, CloudSun, Droplets, ExternalLink, Image, ListChecks, LockKeyhole, MapPinned, Menu, Moon, Newspaper, Plus, RefreshCw, Settings2, Sun, UtensilsCrossed, Wind, X } from 'lucide-react';
import './styles.css';
import './wall.css';
import './scenes.css';
import './access.css';
import './pairing.css';
import './photo-display.css';
import './photo-layouts.css';
import './dark-mode.css';
import './profile.css';
import './weather-traffic.css';
import './news.css';
import './month.css';
import './modal.css';
import './display-fit.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { AccessGate, SecurityLoading } from './components/AccessGate';
import { createDisplayPairing, createHousehold, createRoutine, deleteRoutine, ensureHousecalDefaults, getCurrentSession, loadHousecalState, loadLocalNews, loadTraffic, pollGooglePhotosPicker, resolveLocation, saveHouseholdName, saveHouseholdSettings, saveMealPlan, setRoutineCompletion, signOut, startGoogleConnection, startGooglePhotosPicker, supabase, syncGoogleCalendar, validateDisplaySession } from './lib/supabase';

const family = [
  { name: 'Everyone', color: '#6d7b70', tint: '#dfe8df' },
  { name: 'Maya', color: '#c96f52', tint: '#f6ddd3' },
  { name: 'Dad', color: '#6686a4', tint: '#dbe6f0' },
  { name: 'Leo', color: '#c89b45', tint: '#f4e7bf' },
];

const seedEvents = [
  { id: 1, time: '8:15 AM', title: 'School drop-off', person: 'Everyone', place: 'Briarwood Elementary', color: '#6d7b70', icon: 'school' },
  { id: 2, time: '3:30 PM', title: 'Soccer practice', person: 'Leo', place: 'Ridgeview Field', color: '#c89b45', icon: 'ball' },
  { id: 3, time: '5:45 PM', title: 'Dinner with Nana', person: 'Maya', place: 'Home', color: '#c96f52', icon: 'dinner' },
  { id: 4, time: '7:00 PM', title: 'Family movie night', person: 'Everyone', place: 'Living room', color: '#6d7b70', icon: 'movie' },
];

function getWeekDays(date = new Date()) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return { day: day.toLocaleDateString([], { weekday: 'short' }).toUpperCase(), date: String(day.getDate()), iso: day.toISOString().slice(0, 10), active: day.toDateString() === date.toDateString() };
  });
}

const scenes = [
  { label: 'Calendar', kicker: 'YOUR DAY' },
  { label: 'Photos', kicker: 'FAMILY FRAME' },
  { label: 'Week', kicker: 'THE WEEK AHEAD' },
  { label: 'Weather', kicker: 'OUT THE DOOR' },
  { label: 'Traffic', kicker: 'ON THE ROAD' },
  { label: 'News', kicker: 'LOCAL PULSE' },
];

const fallbackLocation = { city: 'Chicago, IL', latitude: 41.8781, longitude: -87.6298, source: 'fallback' };
const defaultSceneEnabled = Object.fromEntries(scenes.map((item) => [item.label, true]));

function weatherDescription(code) {
  if (code === 0) return 'Clear sky';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Current conditions';
}

function isNighttime(startHour = 20, endHour = 7) {
  const hour = new Date().getHours();
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}

function toDisplayEvent(event) {
  const start = new Date(event.starts_at);
  return { id: event.id || event.external_id, dayKey: start.toLocaleDateString('en-CA'), time: event.all_day ? 'All day' : start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), title: event.title, person: event.person || 'Everyone', place: event.location || 'Family calendar', color: event.color || '#6d7b70', icon: event.source === 'google_calendar' ? 'calendar' : 'family', startsAt: event.starts_at, endsAt: event.ends_at };
}

function formatToday(date = new Date()) {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatWeekRange(days) {
  const start = new Date(`${days[0].iso}T12:00:00`);
  const end = new Date(`${days[days.length - 1].iso}T12:00:00`);
  return `${start.toLocaleDateString([], { month: 'short' }).toUpperCase()} ${start.getDate()} — ${end.getDate()}\n${end.getFullYear()}`;
}

function readCachedState(householdId) {
  try { return JSON.parse(localStorage.getItem(`housecal_state_${householdId}`) || 'null'); } catch { return null; }
}

function writeCachedState(householdId, state) {
  try { localStorage.setItem(`housecal_state_${householdId}`, JSON.stringify({ ...state, cached_at: new Date().toISOString() })); } catch { /* Storage may be unavailable in private display browsers. */ }
}

function App() {
  const [nightMode, setNightMode] = useState(() => isNighttime());
  const [access, setAccess] = useState({ loading: true, session: null, display: null });
  const [events, setEvents] = useState(seedEvents);
  const [photos, setPhotos] = useState([]);
  const [profilePhoto, setProfilePhoto] = useState('');
  const [activeFilter, setActiveFilter] = useState('Everyone');
  const [view, setView] = useState('Today');
  const [showModal, setShowModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoutineManager, setShowRoutineManager] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [done, setDone] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [mealPlan, setMealPlan] = useState(null);
  const [toast, setToast] = useState('');
  const [photosPickerUrl, setPhotosPickerUrl] = useState('');
  const [photosSession, setPhotosSession] = useState(null);
  const [scene, setScene] = useState(0);
  const [pairingCode, setPairingCode] = useState('');
  const [weather, setWeather] = useState({ loading: true, data: null, error: '' });
  const [weatherLocation, setWeatherLocation] = useState(fallbackLocation);
  const [news, setNews] = useState({ loading: true, articles: [], error: '' });
  const [traffic, setTraffic] = useState({ loading: true, configured: true, data: null, error: '' });
  const [settings, setSettings] = useState({ scene_duration_seconds: 12, night_start_hour: 20, night_end_hour: 7, scene_enabled: defaultSceneEnabled, location_label: '', latitude: null, longitude: null });
  const [familyName, setFamilyName] = useState('Our family');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const currentWeek = getWeekDays();
  const todayKey = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    let mounted = true;
    Promise.all([getCurrentSession(), validateDisplaySession()]).then(async ([session, display]) => {
      if (!mounted) return;
      let household = null;
      if (session) {
        const result = await supabase.from('households').select('id,name').limit(1).maybeSingle();
        household = result.data;
        if (!household && !result.error) {
          try {
            const householdId = await createHousehold();
            household = { id: householdId, name: 'Our family' };
          } catch { /* A schema that has not been migrated yet should not break local preview. */ }
        }
      }
      if (household) {
        setFamilyName(household.name || 'Our family');
        try { await ensureHousecalDefaults(household.id); } catch { /* Keep displays usable while the content migration is being applied. */ }
        try {
          const liveState = await loadHousecalState({ householdId: household.id });
          if (liveState?.events?.length) setEvents(liveState.events.map(toDisplayEvent));
          if (liveState?.photos?.length) setPhotos(liveState.photos.map((photo) => photo.url));
          if (liveState?.routines?.length) setRoutines(liveState.routines);
          if (liveState?.routine_completions?.length) setDone((liveState.routine_completions || []).map((item) => liveState.routines?.find((routine) => routine.id === item.routine_id)?.title).filter(Boolean));
          if (liveState?.meals?.length) setMealPlan(liveState.meals[0]);
          if (liveState?.settings) setSettings((current) => ({ ...current, ...liveState.settings, scene_enabled: { ...defaultSceneEnabled, ...(liveState.settings.scene_enabled || {}) } }));
          writeCachedState(household.id, liveState);
        } catch { const cached = readCachedState(household.id); if (cached?.events?.length) setEvents(cached.events.map(toDisplayEvent)); if (cached?.photos?.length) setPhotos(cached.photos.map((photo) => photo.url)); if (cached?.routines?.length) setRoutines(cached.routines); if (cached?.meals?.length) setMealPlan(cached.meals[0]); setToast(cached ? 'Using the last saved family update' : 'Family data is temporarily unavailable'); }
        const { data: profile } = await supabase.from('google_connections').select('profile_picture_url').eq('household_id', household.id).not('profile_picture_url', 'is', null).limit(1).maybeSingle();
        if (profile?.profile_picture_url) setProfilePhoto(profile.profile_picture_url);
        try {
          const { data: calendarConnection } = await supabase.from('google_connections').select('provider').eq('household_id', household.id).eq('provider', 'calendar').maybeSingle();
          if (calendarConnection) {
            await syncGoogleCalendar(household.id);
            const refreshedState = await loadHousecalState({ householdId: household.id });
            if (refreshedState?.events?.length) setEvents(refreshedState.events.map(toDisplayEvent));
          }
          } catch (error) { setToast(error.message || 'Google Calendar sync failed'); }
      } else if (display) {
        try {
          const liveState = await loadHousecalState({ displayToken: localStorage.getItem('housecal_display_token') });
          if (liveState?.events?.length) setEvents(liveState.events.map(toDisplayEvent));
          if (liveState?.photos?.length) setPhotos(liveState.photos.map((photo) => photo.url));
          if (liveState?.routines?.length) setRoutines(liveState.routines);
          if (liveState?.routine_completions?.length) setDone((liveState.routine_completions || []).map((item) => liveState.routines?.find((routine) => routine.id === item.routine_id)?.title).filter(Boolean));
          if (liveState?.meals?.length) setMealPlan(liveState.meals[0]);
          if (liveState?.household_name) setFamilyName(liveState.household_name);
          if (liveState?.settings) setSettings((current) => ({ ...current, ...liveState.settings, scene_enabled: { ...defaultSceneEnabled, ...(liveState.settings.scene_enabled || {}) } }));
          writeCachedState(liveState.household_id || display.household_id, liveState);
        } catch { const cached = display?.household_id ? readCachedState(display.household_id) : null; if (cached?.events?.length) setEvents(cached.events.map(toDisplayEvent)); if (cached?.photos?.length) setPhotos(cached.photos.map((photo) => photo.url)); if (cached?.routines?.length) setRoutines(cached.routines); if (cached?.meals?.length) setMealPlan(cached.meals[0]); setToast(cached ? 'Using the last saved family update' : 'Display data is temporarily unavailable'); }
      }
      setAccess({ loading: false, session, display, household });
    }).catch(() => setAccess({ loading: false, session: null, display: null, household: null }));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccess((current) => ({ ...current, session, loading: false }));
    });
    return () => { mounted = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!weatherLocation.city || (!access.household?.id && !access.display)) return undefined;
    let cancelled = false;
    const loadNews = async () => {
      try {
        const result = await loadLocalNews({ city: weatherLocation.city, householdId: access.household?.id, displayToken: access.display ? localStorage.getItem('housecal_display_token') : undefined });
        if (!cancelled) setNews({ loading: false, articles: result.articles || [], error: '' });
      } catch (error) { if (!cancelled) setNews({ loading: false, articles: [], error: error.message || 'Local news unavailable' }); }
    };
    loadNews();
    const timer = setInterval(loadNews, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [access.display, access.household?.id, weatherLocation.city]);

  useEffect(() => {
    if (!Number.isFinite(weatherLocation.latitude) || (!access.household?.id && !access.display)) return undefined;
    let cancelled = false;
    const refreshTraffic = async () => {
      try {
        const result = await loadTraffic({ latitude: weatherLocation.latitude, longitude: weatherLocation.longitude, householdId: access.household?.id, displayToken: access.display ? localStorage.getItem('housecal_display_token') : undefined });
        if (!cancelled) setTraffic({ loading: false, configured: result.configured !== false, data: result, error: result.message || '' });
      } catch (error) { if (!cancelled) setTraffic({ loading: false, configured: true, data: null, error: error.message || 'Traffic unavailable' }); }
    };
    refreshTraffic();
    const timer = setInterval(refreshTraffic, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [access.display, access.household?.id, weatherLocation.latitude, weatherLocation.longitude]);

  useEffect(() => {
    const updateNightMode = () => setNightMode(isNighttime(settings.night_start_hour, settings.night_end_hour));
    document.documentElement.dataset.theme = nightMode ? 'night' : 'day';
    const timer = setInterval(updateNightMode, 60000);
    return () => { clearInterval(timer); delete document.documentElement.dataset.theme; };
  }, [nightMode, settings.night_start_hour, settings.night_end_hour]);

  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        let location;
        if (settings.location_label && Number.isFinite(Number(settings.latitude)) && Number.isFinite(Number(settings.longitude))) {
          location = { city: settings.location_label, latitude: Number(settings.latitude), longitude: Number(settings.longitude), source: 'custom' };
        } else {
          const ipResponse = await fetch('https://ipwho.is/');
          const ipLocation = ipResponse.ok ? await ipResponse.json() : null;
          location = ipLocation?.success && Number.isFinite(ipLocation.latitude) && Number.isFinite(ipLocation.longitude) ? { city: [ipLocation.city, ipLocation.region_code || ipLocation.region].filter(Boolean).join(', '), latitude: ipLocation.latitude, longitude: ipLocation.longitude, source: 'ip' } : fallbackLocation;
        }
        if (!cancelled) setWeatherLocation(location);
        const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m', hourly: 'temperature_2m,weather_code,precipitation_probability', forecast_days: '2', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'auto' });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!response.ok) throw new Error('Weather service unavailable');
        const payload = await response.json();
        if (!cancelled) setWeather({ loading: false, data: payload.current, hourly: payload.hourly, error: '' });
      } catch (error) { if (!cancelled) setWeather({ loading: false, data: null, error: error.message || 'Weather unavailable' }); }
    };
    loadWeather();
    const timer = setInterval(loadWeather, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [settings.location_label, settings.latitude, settings.longitude]);

  useEffect(() => {
    const enabledIndexes = scenes.map((item, index) => settings.scene_enabled?.[item.label] !== false ? index : null).filter((index) => index !== null);
    if (!enabledIndexes.length) return undefined;
    const timer = setInterval(() => setScene((current) => { const position = enabledIndexes.indexOf(current); return enabledIndexes[(position + 1 + enabledIndexes.length) % enabledIndexes.length]; }), (settings.scene_duration_seconds || 12) * 1000);
    return () => clearInterval(timer);
  }, [settings.scene_duration_seconds, settings.scene_enabled]);
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (settings.scene_enabled?.[scenes[scene]?.label] === false) {
      const firstEnabled = scenes.findIndex((item) => settings.scene_enabled?.[item.label] !== false);
      if (firstEnabled >= 0) setScene(firstEnabled);
    }
  }, [scene, settings.scene_enabled]);

  const dateFilteredEvents = useMemo(() => view === 'Today' ? events.filter((event) => event.dayKey === todayKey) : events, [events, todayKey, view]);
  const filteredEvents = useMemo(() => activeFilter === 'Everyone' ? dateFilteredEvents : dateFilteredEvents.filter((event) => event.person === activeFilter || event.person === 'Everyone'), [dateFilteredEvents, activeFilter]);
  const completeChore = async (name) => {
    if (!access.session) { setToast('Routines are managed from the parent device'); return; }
    const currentlyDone = done.includes(name);
    setDone((current) => currentlyDone ? current.filter((item) => item !== name) : [...current, name]);
    const routine = routines.find((item) => item.title === name);
    if (access.session && routine) { try { await setRoutineCompletion(routine.id, !currentlyDone); } catch (error) { setToast(error.message || 'Routine update failed'); setDone((current) => currentlyDone ? [...current, name] : current.filter((item) => item !== name)); } }
  };
  const addEvent = (event) => { setEvents((current) => [...current, { ...event, id: Date.now(), color: family.find((person) => person.name === event.person)?.color || '#6d7b70' }]); setShowModal(false); setToast('Added to the family calendar'); setTimeout(() => setToast(''), 2200); };
  const connectGoogle = async (provider) => {
    if (!access.session || !access.household?.id) return setToast('Parent sign-in and a household are required');
    try { const result = await startGoogleConnection(provider, access.household.id); window.location.assign(result.auth_url); } catch (error) { setToast(error.message || `Unable to connect Google ${provider}`); }
  };
  const openPhotosPicker = async () => {
    try {
      const picker = await startGooglePhotosPicker(access.household?.id);
      const householdId = picker.household_id || access.household?.id;
      if (!householdId) throw new Error('Household access is still loading. Try again.');
      localStorage.setItem('housecal_photos_session', JSON.stringify({ householdId, sessionId: picker.session_id }));
      setPhotosSession({ householdId, sessionId: picker.session_id });
      setPhotosPickerUrl(picker.picker_uri);
      setToast('Google Photos is ready');
    } catch (error) { setToast(error.message || 'Connect Google Photos first'); }
  };
  useEffect(() => {
    if (!access.household?.id || !access.session) return undefined;
    let saved;
    try { saved = JSON.parse(localStorage.getItem('housecal_photos_session') || 'null'); } catch { saved = null; }
    if (!saved || saved.householdId !== access.household.id) return undefined;
    setPhotosSession((current) => current || { householdId: saved.householdId, sessionId: saved.sessionId });
    return undefined;
  }, [access.household?.id, access.session]);
  useEffect(() => {
    if (!photosSession) return undefined;
    let stopped = false;
    let polling = false;
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const result = await pollGooglePhotosPicker(photosSession.householdId, photosSession.sessionId);
        if (!stopped && result.ready) {
          localStorage.removeItem('housecal_photos_session');
          setPhotosSession(null);
          const liveState = await loadHousecalState({ householdId: photosSession.householdId });
          setPhotos((liveState.photos || []).map((photo) => photo.url));
          setPhotosPickerUrl('');
          setToast(result.imported ? `Imported ${result.imported} photos` : 'No photos were selected');
        }
      } catch (error) {
        if (!stopped) {
          localStorage.removeItem('housecal_photos_session');
          setPhotosSession(null);
          setPhotosPickerUrl('');
          setToast(error.message || 'Photo import failed. Start a new picker session.');
        }
      } finally { polling = false; }
    };
    poll();
    const interval = setInterval(poll, 5000);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!stopped) {
        localStorage.removeItem('housecal_photos_session');
        setPhotosSession(null);
        setPhotosPickerUrl('');
        setToast('Google Photos session expired. Start a new picker session.');
      }
    }, 12 * 60 * 1000);
    return () => { stopped = true; clearInterval(interval); clearTimeout(timeout); };
  }, [photosSession]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      const provider = params.get('provider');
      if (provider === 'calendar' && !access.household?.id) return;
      window.history.replaceState({}, '', window.location.pathname);
      setToast(`Google ${provider === 'photos' ? 'Photos' : 'Calendar'} connected`);
      if (provider === 'calendar' && access.household?.id) syncGoogleCalendar(access.household.id).then(async () => { const liveState = await loadHousecalState({ householdId: access.household.id }); if (liveState?.events?.length) setEvents(liveState.events.map(toDisplayEvent)); setToast('Google Calendar synced'); }).catch((error) => setToast(error.message || 'Calendar sync failed'));
    } else if (params.get('google') === 'error') { setToast(`Google connection failed: ${params.get('reason') || 'try again'}`); window.history.replaceState({}, '', window.location.pathname); }
  }, [access.household?.id]);

  if (access.loading) return <SecurityLoading />;
  if (!access.session && !access.display && !import.meta.env.DEV) return <AccessGate onPaired={(display) => setAccess({ loading: false, session: null, display })} />;

  return <div className={`app-shell ${scene === 1 ? 'photo-display-active' : ''}`}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>housecal</strong><small>{familyName}</small></div></div>
      <div className="topbar-right"><div className="clock" aria-label="Current time">{currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div><div className="weather">{nightMode ? <Moon size={18} strokeWidth={1.7}/> : <Sun size={18} strokeWidth={1.7}/>}<span>{weather.data ? `${Math.round(weather.data.temperature_2m)}°` : '--°'}</span><small>{weatherLocation.city}</small></div><button className="icon-button" aria-label="Notifications"><Bell size={20}/><i></i></button><button className="avatar" onClick={() => setShowMenu(!showMenu)} aria-label="Open family settings" aria-expanded={showMenu}>{profilePhoto ? <img src={profilePhoto} alt="Google profile"/> : 'BH'}</button><button className="icon-button menu-button" onClick={() => setShowMenu(!showMenu)} aria-label="Open menu"><Menu size={22}/></button></div>
      {showMenu && <div className="quick-menu"><button onClick={() => connectGoogle('calendar')}>Connect Google Calendar <span>→</span></button><button onClick={() => connectGoogle('photos')}>Connect Google Photos <span>→</span></button>{access.session && <button onClick={() => { setShowRoutineManager(true); setShowMenu(false); }}>Manage routines <span>→</span></button>}{access.session && <button onClick={async () => { try { const result = await createDisplayPairing(access.household?.id); setPairingCode(result?.code || ''); setShowMenu(false); } catch (error) { setToast(error.message || 'Create a pairing code after applying the Supabase migration'); } }}>Pair a Display <span>→</span></button>}<button onClick={() => { setShowSettings(true); setShowMenu(false); }}>Display settings <span>→</span></button>{access.session && <button onClick={async () => { await signOut(); setShowMenu(false); }}>Sign out <span>↗</span></button>}</div>}
    </header>

    <main className={`scene-main scene-${scene}`}>
      {scene === 0 && <CalendarScene
        todayLabel={formatToday()} familyName={familyName} filteredEvents={filteredEvents} photos={photos} setShowModal={setShowModal} setToast={setToast} openPhotosPicker={openPhotosPicker} done={done} routines={routines} completeChore={completeChore} editable={Boolean(access.session)} currentTime={currentTime} weather={weather} location={weatherLocation}/>}
      {scene === 1 && <PhotoScene setToast={setToast} photos={photos} openPhotosPicker={openPhotosPicker}/>}
      {scene === 2 && <WeekScene events={events} family={family} week={currentWeek}/>}
      {scene === 3 && <WeatherScene weather={weather} location={weatherLocation} setToast={setToast}/>}
      {scene === 4 && <TrafficScene traffic={traffic} location={weatherLocation} setToast={setToast}/>}
      {scene === 5 && <NewsScene news={news} location={weatherLocation} setToast={setToast}/>}
      <SceneDock scene={scene} setScene={setScene} sceneEnabled={settings.scene_enabled}/>
    </main>
    {showModal && <AddEventModal onClose={() => setShowModal(false)} onAdd={addEvent}/>} {showMealModal && <MealModal householdId={access.household?.id} meal={mealPlan} onClose={() => setShowMealModal(false)} onSaved={(meal) => { setMealPlan(meal); setShowMealModal(false); setToast('Meal plan saved'); }}/>} {showSettings && <SettingsModal householdId={access.household?.id} householdName={familyName} settings={settings} onClose={() => setShowSettings(false)} onSaved={(next, name) => { setSettings(next); setFamilyName(name); setShowSettings(false); setToast('Family settings saved'); }}/>} {showRoutineManager && <RoutineManagerModal householdId={access.household?.id} routines={routines} onClose={() => setShowRoutineManager(false)} onChanged={setRoutines}/>} {pairingCode && <PairingModal code={pairingCode} onClose={() => setPairingCode('')}/>} {toast && <div className="toast">{toast}{photosPickerUrl && <a href={photosPickerUrl} target="_blank" rel="noreferrer" onClick={() => setPhotosPickerUrl('')}>Open Google Photos</a>}</div>}
  </div>;
}

function LegacyCalendarScene({ view, setView, week, todayLabel, familyName, family, activeFilter, setActiveFilter, filteredEvents, events, photos, setShowModal, setShowMealModal, setToast, openPhotosPicker, done, routines, completeChore, editable }) { const albumTitle = photos.length ? `SELECTED PHOTOS · ${photos.length}` : 'FAMILY PHOTOS'; return <div className="scene-content calendar-scene">
  <section className="welcome-row"><div><p className="eyebrow">{todayLabel.toUpperCase()}</p><h1>Good morning, {familyName}.</h1><p className="subhead">Here’s what’s happening around the house.</p></div><div className="view-switcher">{['Today', 'Week', 'Month'].map((item) => <button className={view === item ? 'selected' : ''} key={item} onClick={() => setView(item)}>{item}</button>)}</div></section>
  <section className="week-strip"><button className="week-arrow"><ArrowLeft size={18}/></button>{week.map((item) => <button key={item.date} className={`day-card ${item.active ? 'current' : ''}`} onClick={() => setToast(item.active ? 'You are viewing today' : `${item.day}, August ${item.date}`)}><span>{item.day}</span><strong>{item.date}</strong>{item.active && <i></i>}</button>)}<button className="week-arrow"><ArrowRight size={18}/></button></section>
  <div className="family-filters">{family.map((person) => <button key={person.name} className={activeFilter === person.name ? 'active' : ''} onClick={() => setActiveFilter(person.name)}><span style={{ background: person.color }}></span>{person.name}</button>)}<button className="manage-family" onClick={() => setToast('Family profiles are ready for Google account linking')}><Settings2 size={16}/> Manage family</button></div>
  {view === 'Month' ? <MonthCalendar events={events}/> : <section className="content-grid"><div className="schedule-card panel"><div className="panel-heading"><div><p className="eyebrow">TODAY AT A GLANCE</p><h2>{view === 'Today' ? todayLabel : `${view} view`}</h2></div><button className="add-button" onClick={() => setShowModal(true)}><Plus size={18}/> Add event</button></div><div className="timeline">{filteredEvents.map((event) => <div className="event-row" key={event.id}><div className="event-time">{event.time}</div><div className="event-line"><span style={{ background: event.color }}></span></div><div className="event-info"><div><h3>{event.title}</h3><p>{event.place} <span>·</span> {event.person}</p></div><div className="event-badge" style={{ color: event.color, background: `${event.color}18` }}>{event.icon === 'dinner' ? 'Dinner' : event.icon === 'ball' ? 'Activity' : 'Family'}</div></div></div>)}</div><div className="sync-row"><span className="sync-dot"></span> Synced with Google Calendar <span className="sync-time">just now</span></div></div><div className="right-column"><section className="photo-card panel" style={photos[0] ? { backgroundImage: `linear-gradient(145deg,#81917899,#2f4941cc), url('${photos[0]}')` } : undefined}><div className="photo-content"><div className="photo-topline"><span><Image size={15}/> {albumTitle}</span><button onClick={openPhotosPicker}>{photos.length ? 'Change photos' : 'Choose photos'} <ArrowRight size={15}/></button></div><div className="photo-copy"><p>{photos.length ? <>Your family,<br/><em>always close by.</em></> : <>Little moments,<br/><em>always close by.</em></>}</p><small>{photos.length ? `${photos.length} chosen from Google Photos` : 'Choose photos from Google Photos'}</small></div><div className="photo-dots"><i></i><i className="active"></i><i></i><i></i></div></div></section><div className="small-panels"><section className="mini-card panel"><div className="mini-heading"><div className="mini-icon meal"><UtensilsCrossed size={17}/></div><div><p className="eyebrow">TONIGHT</p><h3>Dinner plan</h3></div><ChevronDown size={17}/></div><div className="meal-line"><strong>Sheet-pan salmon</strong><span>with roasted vegetables</span></div><button className="text-action" onClick={() => setShowMealModal(true)}>Edit meal plan <ArrowRight size={15}/></button></section><section className="mini-card panel"><div className="mini-heading"><div className="mini-icon chores"><ListChecks size={17}/></div><div><p className="eyebrow">ROUTINES</p><h3>Little wins</h3></div><span className="count">{done.length}/{routines.length || 4}</span></div>{(routines.length ? routines : [{ title: 'Pack soccer bag' }, { title: 'Feed the dog' }, { title: 'Put away laundry' }]).map((chore) => <button className={`chore ${done.includes(chore.title) ? 'completed' : ''}`} key={chore.title} onClick={() => completeChore(chore.title)}><span>{done.includes(chore.title) ? <Check size={13}/> : null}</span>{chore.title}<b>{done.includes(chore.title) ? 'Done' : 'Today'}</b></button>)}</section></div></div></section>}
  <section className="bottom-bar"><div><LockKeyhole size={15}/> Parent mode is on</div><span>Tap the lock icon on any device to edit</span><button onClick={() => setToast('Display is set to stay awake during the day')}><CloudSun size={16}/> Display awake <span className="toggle on"><i></i></span></button></section>
</div> }

function CalendarScene({ todayLabel, familyName, filteredEvents, photos, setShowModal, setToast, openPhotosPicker, done, routines, completeChore, editable, currentTime, weather, location }) {
  const now = currentTime || new Date();
  const currentEvent = filteredEvents.find((event) => event.startsAt && new Date(event.startsAt) <= now && (!event.endsAt || new Date(event.endsAt) > now));
  const upcoming = filteredEvents.filter((event) => !event.startsAt || new Date(event.startsAt) > now).length;
  const currentWeather = weather?.data;
  const chores = routines.length ? routines : [{ title: 'Pack soccer bag' }, { title: 'Feed the dog' }, { title: 'Put away laundry' }];
  return <div className="scene-content calendar-scene">
    <section className="welcome-row calendar-today-heading"><div><p className="eyebrow">TODAY · {todayLabel.toUpperCase()}</p><h1>Today, {familyName}.</h1><p className="subhead">Your family’s calendar, weather, and next move at a glance.</p></div><button className="add-button" onClick={() => setShowModal(true)}><Plus size={18}/> Add event</button></section>
    <section className="week-strip">{getWeekDays(now).map((item) => <div key={item.date} className={`day-card ${item.active ? 'current' : ''}`}><span>{item.day}</span><strong>{item.date}</strong>{item.active && <i></i>}</div>)}</section>
    <section className="content-grid today-content-grid"><div className="schedule-card panel"><div className="panel-heading"><div><p className="eyebrow">TODAY FROM YOUR CALENDAR</p><h2>{filteredEvents.length ? `${filteredEvents.length} plans today` : 'Nothing scheduled today'}</h2></div><span className="today-clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div><div className="timeline">{filteredEvents.length ? filteredEvents.map((event) => { const active = currentEvent?.id === event.id; return <div className={`event-row ${active ? 'event-row-active' : ''}`} key={event.id}><div className="event-time">{event.time}</div><div className="event-line"><span style={{ background: event.color }}></span></div><div className="event-info"><div><div className="event-live-label">{active ? 'HAPPENING NOW' : ''}</div><h3>{event.title}</h3><p>{event.place} <span>·</span> {event.person}</p></div><div className="event-badge" style={{ color: event.color, background: `${event.color}18` }}>{active ? 'Now' : event.icon === 'ball' ? 'Activity' : 'Family'}</div></div></div>; }) : <div className="today-empty">No calendar events are scheduled for today.</div>}</div><div className="sync-row"><span className="sync-dot"></span> Google Calendar synced <span className="sync-time">{upcoming} upcoming</span></div></div><div className="right-column"><section className="today-summary panel"><div className="mini-heading"><div className="mini-icon weather-summary-icon"><CloudSun size={17}/></div><div><p className="eyebrow">TODAY SUMMARY</p><h3>{currentEvent ? 'Happening now' : upcoming ? 'Next up today' : 'A clear day ahead'}</h3></div></div>{currentEvent ? <div className="summary-current"><strong>{currentEvent.title}</strong><span>{currentEvent.time} · {currentEvent.place}</span></div> : <div className="summary-current"><strong>{upcoming ? `${upcoming} upcoming ${upcoming === 1 ? 'event' : 'events'}` : 'No events on the calendar'}</strong><span>{upcoming ? 'Your next plans are ready below.' : 'A little room to breathe.'}</span></div>}<div className="summary-weather"><span>{currentWeather ? `${Math.round(currentWeather.temperature_2m)}°` : '—°'}</span><div><strong>{location.city}</strong><small>{currentWeather ? weatherDescription(currentWeather.weather_code) : 'Weather loading'}</small></div></div></section><section className="mini-card panel"><div className="mini-heading"><div className="mini-icon chores"><ListChecks size={17}/></div><div><p className="eyebrow">ROUTINES</p><h3>Little wins</h3></div><span className="count">{done.length}/{routines.length || 4}</span></div>{chores.map((chore) => <button className={`chore ${done.includes(chore.title) ? 'completed' : ''}`} key={chore.title} onClick={() => completeChore(chore.title)} disabled={!editable}><span>{done.includes(chore.title) ? <Check size={13}/> : null}</span>{chore.title}<b>{done.includes(chore.title) ? 'Done' : 'Today'}</b></button>)}</section><section className="photo-card panel today-photo-card" style={photos[0] ? { backgroundImage: `linear-gradient(145deg,#81917899,#2f4941cc), url('${photos[0]}')` } : undefined}><div className="photo-content"><div className="photo-topline"><span><Image size={15}/> {photos.length ? `SELECTED PHOTOS · ${photos.length}` : 'FAMILY PHOTOS'}</span><button onClick={openPhotosPicker}>{photos.length ? 'Change photos' : 'Choose photos'} <ArrowRight size={15}/></button></div><div className="photo-copy"><p>Small moments,<br/><em>close by.</em></p></div></div></section></div></section>
    <section className="bottom-bar"><div><LockKeyhole size={15}/> Parent mode is on</div><span>Today stays visible on the family display</span><button onClick={() => setToast('Today is the active calendar view')}><CloudSun size={16}/> Today view</button></section>
  </div>;
}

function MonthCalendar({ events }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const first = new Date(start); first.setDate(1 - start.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return date; });
  return <section className="month-calendar panel"><div className="month-heading"><div><p className="eyebrow">MONTH AT A GLANCE</p><h2>{now.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2></div><span>{events.length} synced events</span></div><div className="month-grid">{['SUN','MON','TUE','WED','THU','FRI','SAT'].map((day) => <div className="month-weekday" key={day}>{day}</div>)}{days.map((date) => { const key = date.toLocaleDateString('en-CA'); const dayEvents = events.filter((event) => event.dayKey === key); return <div className={`month-day ${date.getMonth() !== now.getMonth() ? 'muted' : ''} ${date.toDateString() === now.toDateString() ? 'today' : ''}`} key={key}><strong>{date.getDate()}</strong>{dayEvents.slice(0, 3).map((event) => <span key={event.id} style={{ borderLeftColor: event.color }}>{event.title}</span>)}</div>; })}</div></section>
}

const photoImages = [
  'https://images.unsplash.com/photo-1504150558240-0b4fd8946624?auto=format&fit=crop&w=1920&q=85',
  'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1920&q=85',
  'https://images.unsplash.com/photo-1472162072942-cd5147eb3902?auto=format&fit=crop&w=1920&q=85',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1920&q=85',
];

const photoCaptions = [
  <>Little moments,<br/><em>always close by.</em></>,
  <>Together is<br/><em>our favorite place.</em></>,
  <>This is our<br/><em>kind of ordinary.</em></>,
  <>Home is where<br/><em>we find each other.</em></>,
  <>The best days<br/><em>look like this.</em></>,
];

function PhotoScene({ setToast, photos, openPhotosPicker }) {
  const [layout, setLayout] = useState(() => Math.floor(Math.random() * 7));
  const [imageIndex, setImageIndex] = useState(() => Math.floor(Math.random() * photoImages.length));
  const [captionIndex, setCaptionIndex] = useState(() => Math.floor(Math.random() * photoCaptions.length));
  useEffect(() => {
    const timer = setInterval(() => {
      setLayout(Math.floor(Math.random() * 7));
      setImageIndex(Math.floor(Math.random() * photoImages.length));
      setCaptionIndex(Math.floor(Math.random() * photoCaptions.length));
    }, 28000);
    return () => clearInterval(timer);
  }, []);
  const availableImages = photos.length ? photos : photoImages;
  const image = availableImages[imageIndex % availableImages.length];
  const secondImage = availableImages[(imageIndex + 1) % availableImages.length];
  return <div className={`photo-scene randomized-photo-scene layout-${layout}`} key={`${layout}-${imageIndex}`}>
    <div className="photo-layer photo-layer-main" style={{ backgroundImage: `linear-gradient(90deg,#182b27a8 0%,#182b2738 45%,#182b2715 100%), url('${image}')` }}></div>
    {(layout === 1 || layout === 3) && <div className="photo-layer photo-layer-secondary" style={{ backgroundImage: `linear-gradient(160deg,#2c493b44,#17231e66), url('${secondImage}')` }}></div>}
    {layout === 2 && <div className="photo-filmstrip"><div style={{ backgroundImage: `url('${secondImage}')` }}></div><div style={{ backgroundImage: `url('${image}')` }}></div><div style={{ backgroundImage: `url('${availableImages[(imageIndex + 2) % availableImages.length]}')` }}></div></div>}
    {layout === 4 && <div className="photo-collage"><div className="collage-large" style={{ backgroundImage: `url('${image}')` }}></div><div className="collage-small collage-small-a" style={{ backgroundImage: `url('${secondImage}')` }}></div><div className="collage-small collage-small-b" style={{ backgroundImage: `url('${availableImages[(imageIndex + 2) % availableImages.length]}')` }}></div></div>}
    {layout === 5 && <div className="photo-scroll-gallery">{Array.from({ length: Math.min(6, availableImages.length) }, (_, index) => <div key={index} style={{ backgroundImage: `url('${availableImages[(imageIndex + index) % availableImages.length]}')` }}></div>)}</div>}
    {layout === 6 && <div className="photo-mosaic">{Array.from({ length: 4 }, (_, index) => <div key={index} style={{ backgroundImage: `url('${availableImages[(imageIndex + index) % availableImages.length]}')` }}></div>)}</div>}
    <div className="photo-scene-overlay"><div className="photo-scene-top"><span><Image size={17}/> {photos.length ? `SELECTED PHOTOS · ${photos.length}` : 'FAMILY PHOTOS'}</span><span>68° · CHICAGO</span></div><div className="photo-scene-caption"><p>{photoCaptions[captionIndex]}</p><small>{photos.length ? 'Chosen from Google Photos' : 'Choose photos from Google Photos'}</small></div><button onClick={openPhotosPicker}>{photos.length ? 'Change photos' : 'Choose photos'} <ArrowRight size={16}/></button></div>
  </div>;
}

function WeatherTrafficScene({ weather, location, setToast }) {
  const current = weather.data;
  const trafficMapUrl = import.meta.env.VITE_TRAFFIC_MAP_URL || `https://www.google.com/maps/@${location.latitude},${location.longitude},11z/data=!5m1!1e1`;
  return <div className="weather-traffic-scene"><div className="scene-heading"><div><p className="eyebrow">OUT THE DOOR</p><h1>Know before<br/><em>you go.</em></h1><p className="subhead">Live conditions for the family’s next move.</p></div><div className="scene-date"><strong>{location.city}</strong><br/>UPDATED {current?.time ? new Date(current.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</div></div><div className="weather-traffic-grid"><section className="weather-live-card panel"><div className="weather-card-top"><span><CloudSun size={18}/> LIVE WEATHER</span><button onClick={() => setToast(weather.error || `Using ${location.source === 'ip' ? 'local IP location' : 'fallback location'}; weather refreshes every 15 minutes`)} aria-label="Weather status"><RefreshCw size={15}/></button></div>{weather.loading ? <div className="weather-loading">Finding your local area…</div> : current ? <><div className="weather-temperature">{Math.round(current.temperature_2m)}°</div><h2>{weatherDescription(current.weather_code)}</h2><p>Feels like {Math.round(current.apparent_temperature)}°</p><div className="weather-metrics"><span><Droplets size={16}/> {current.relative_humidity_2m}% humidity</span><span><Wind size={16}/> {Math.round(current.wind_speed_10m)} mph wind</span></div></> : <div className="weather-loading">{weather.error || 'Weather unavailable'}</div>}</section><section className="traffic-card panel"><div className="traffic-card-top"><span><MapPinned size={18}/> TRAFFIC MAP</span><span className="traffic-status"><i></i> Live in Google Maps</span></div><div className="traffic-map-placeholder"><div className="map-road map-road-a"></div><div className="map-road map-road-b"></div><div className="map-road map-road-c"></div><div className="map-pin"><MapPinned size={28}/><span>{location.city}</span></div><div className="map-overlay"><strong>Plan the drive</strong><small>Open the live traffic layer for current routes and delays.</small><a href={trafficMapUrl} target="_blank" rel="noreferrer">Open traffic map <ExternalLink size={14}/></a></div></div></section></div><div className="weather-traffic-foot"><span><Wind size={15}/> Weather powered by Open-Meteo</span><span><MapPinned size={15}/> Location from local public IP</span></div></div>;
}

function WeatherScene({ weather, location, setToast }) {
  const current = weather.data;
  const outlook = (weather.hourly?.time || []).map((time, index) => ({ time, temperature: weather.hourly.temperature_2m[index], code: weather.hourly.weather_code[index], rain: weather.hourly.precipitation_probability[index] })).filter((item) => new Date(item.time) >= new Date()).slice(0, 8);
  return <div className="weather-scene"><div className="scene-heading"><div><p className="eyebrow">OUT THE DOOR</p><h1>Know before<br/><em>you go.</em></h1><p className="subhead">Live conditions for the family’s next move.</p></div><div className="scene-date"><strong>{location.city}</strong><br/>UPDATED {current?.time ? new Date(current.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</div></div><div className="weather-layout"><section className="weather-live-card weather-scene-card panel"><div className="weather-card-top"><span><CloudSun size={18}/> LIVE WEATHER</span><button onClick={() => setToast(weather.error || `Using ${location.source === 'ip' ? 'local IP location' : 'fallback location'}; weather refreshes every 15 minutes`)} aria-label="Weather status"><RefreshCw size={15}/></button></div>{weather.loading ? <div className="weather-loading">Finding your local area…</div> : current ? <><div className="weather-temperature">{Math.round(current.temperature_2m)}°</div><h2>{weatherDescription(current.weather_code)}</h2><p>Feels like {Math.round(current.apparent_temperature)}°</p><div className="weather-metrics"><span><Droplets size={16}/> {current.relative_humidity_2m}% humidity</span><span><Wind size={16}/> {Math.round(current.wind_speed_10m)} mph wind</span></div></> : <div className="weather-loading">{weather.error || 'Weather unavailable'}</div>}</section><section className="hourly-card panel"><div className="hourly-heading"><div><p className="eyebrow">NEXT 8 HOURS</p><h2>Hourly outlook</h2></div><CloudSun size={20}/></div>{outlook.length ? <div className="hourly-list">{outlook.map((hour) => <div className="hourly-row" key={hour.time}><span className="hourly-time">{new Date(hour.time).toLocaleTimeString([], { hour: 'numeric' })}</span><span className="hourly-condition">{weatherDescription(hour.code)}</span><strong>{Math.round(hour.temperature)}°</strong><small>{hour.rain || 0}% rain</small></div>)}</div> : <div className="weather-loading">Hourly outlook unavailable</div>}</section></div><div className="weather-traffic-foot"><span><Wind size={15}/> Weather powered by Open-Meteo</span><span><MapPinned size={15}/> Location from local public IP</span></div></div>;
}

function TrafficMap({ location }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const createMap = async () => {
      try {
        const displayToken = localStorage.getItem('housecal_display_token');
        const { data: { session } } = await supabase.auth.getSession();
        const token = displayToken ? `display_token=${encodeURIComponent(displayToken)}` : session?.access_token ? `access_token=${encodeURIComponent(session.access_token)}` : '';
        if (!token || !mapElement.current || cancelled) return;
        const map = L.map(mapElement.current, { zoomControl: false }).setView([location.latitude, location.longitude], 11);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
        const tileBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/traffic-map-tile/{z}/{x}/{y}.png?${token}`;
        L.tileLayer(tileBase, { opacity: 0.82, maxZoom: 19, attribution: 'Traffic flow &copy; TomTom' }).addTo(map);
        L.circleMarker([location.latitude, location.longitude], { radius: 7, color: '#26322e', weight: 2, fillColor: '#f5d3a6', fillOpacity: 1 }).addTo(map).bindTooltip(location.city, { permanent: true, direction: 'top', className: 'traffic-map-label' });
        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 0);
      } catch (error) { if (!cancelled) setMapError(error.message || 'Live traffic map unavailable'); }
    };
    createMap();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [location.latitude, location.longitude, location.city]);
  return <div className="traffic-map-wrap">{mapError ? <div className="traffic-map-error">{mapError}</div> : <div ref={mapElement} className="traffic-leaflet-map"/>}<div className="traffic-map-key"><span><i className="flow-green"></i> Moving</span><span><i className="flow-yellow"></i> Slow</span><span><i className="flow-red"></i> Congested</span></div></div>;
}

function LegacyTrafficScene({ traffic, location, setToast }) {
  const flow = traffic.data?.flow;
  const incidents = traffic.data?.incidents || [];
  const trafficMapUrl = `https://www.google.com/maps/@${location.latitude},${location.longitude},11z/data=!5m1!1e1`;
  const liveMapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${location.latitude},${location.longitude}`)}&z=11&output=embed`;
  return <div className="traffic-scene"><div className="scene-heading"><div><p className="eyebrow">ON THE ROAD</p><h1>Traffic,<br/><em>at a glance.</em></h1><p className="subhead">A fresh local snapshot every 30 minutes.</p></div><div className="scene-date"><strong>{location.city}</strong><br/>UPDATED {traffic.data?.fetched_at ? new Date(traffic.data.fetched_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</div></div>{traffic.loading ? <div className="news-state panel">Loading traffic…</div> : !traffic.configured ? <div className="news-state panel"><MapPinned size={28}/><h2>Traffic API key needed</h2><p>Add the free-tier <code>TOMTOM_API_KEY</code> Supabase secret to enable live traffic.</p></div> : <div className="traffic-dashboard"><section className="traffic-summary panel"><div className="traffic-card-top"><span><MapPinned size={18}/> LIVE TRAFFIC</span><span className="traffic-status"><i></i> 30 MIN REFRESH</span></div><div className="flow-score">{flow ? `${Math.round(flow.currentSpeed)} mph` : '—'}</div><h2>{flow?.freeFlowSpeed && flow.currentSpeed < flow.freeFlowSpeed * .7 ? 'Heavy traffic' : flow ? 'Moving well' : 'No flow data'}</h2><p>{flow?.freeFlowSpeed ? `Typical speed ${Math.round(flow.freeFlowSpeed)} mph` : 'Live road-speed data will appear when available.'}</p><a className="traffic-open-link" href={trafficMapUrl} target="_blank" rel="noreferrer">Open live map <ExternalLink size={14}/></a></section><section className="traffic-incidents panel"><div className="traffic-card-top"><span><MapPinned size={18}/> NEARBY INCIDENTS</span><span>{incidents.length} found</span></div>{incidents.length ? incidents.map((incident, index) => <div className="traffic-incident" key={`${incident.title}-${index}`}><span className="incident-dot"></span><div><strong>{incident.title}</strong><small>{incident.category}{incident.delay ? ` · delay ${incident.delay}` : ''}</small></div></div>) : <div className="traffic-empty">No active incidents reported nearby.</div>}</section><section className="traffic-live-map panel"><div className="traffic-card-top"><span><MapPinned size={18}/> LIVE MAP</span><span className="traffic-status"><i></i> GOOGLE TRAFFIC LAYER</span></div><iframe title={`Live traffic map for ${location.city}`} src={liveMapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen></iframe></section></div>}<div className="weather-traffic-foot"><span><MapPinned size={15}/> TomTom Traffic API + Google live map</span><span>Traffic data refreshes every 30 minutes</span><button onClick={() => setToast(traffic.error || 'Traffic refreshes automatically every 30 minutes')}>Refresh status</button></div></div>;
}

function TrafficScene({ traffic, location, setToast }) {
  const flow = traffic.data?.flow;
  const incidents = traffic.data?.incidents || [];
  const trafficMapUrl = `https://www.google.com/maps/@${location.latitude},${location.longitude},11z/data=!5m1!1e1`;
  return <div className="traffic-scene"><div className="scene-heading"><div><p className="eyebrow">ON THE ROAD</p><h1>Traffic,<br/><em>at a glance.</em></h1><p className="subhead">Live TomTom flow for your saved location.</p></div><div className="scene-date"><strong>{location.city}</strong><br/>UPDATED {traffic.data?.fetched_at ? new Date(traffic.data.fetched_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</div></div>{traffic.loading ? <div className="news-state panel">Loading traffic…</div> : !traffic.configured ? <div className="news-state panel"><MapPinned size={28}/><h2>Traffic API key needed</h2><p>Add the free-tier <code>TOMTOM_API_KEY</code> Supabase secret to enable live traffic.</p></div> : <div className="traffic-dashboard"><section className="traffic-summary panel"><div className="traffic-card-top"><span><MapPinned size={18}/> LIVE TRAFFIC</span><span className="traffic-status"><i></i> 30 MIN REFRESH</span></div><div className="flow-score">{flow ? `${Math.round(flow.currentSpeed)} mph` : '—'}</div><h2>{flow?.freeFlowSpeed && flow.currentSpeed < flow.freeFlowSpeed * .7 ? 'Heavy traffic' : flow ? 'Moving well' : 'No flow data'}</h2><p>{flow?.freeFlowSpeed ? `Typical speed ${Math.round(flow.freeFlowSpeed)} mph` : 'Live road-speed data will appear when available.'}</p><a className="traffic-open-link" href={trafficMapUrl} target="_blank" rel="noreferrer">Open full traffic map <ExternalLink size={14}/></a></section><section className="traffic-incidents panel"><div className="traffic-card-top"><span><MapPinned size={18}/> NEARBY INCIDENTS</span><span>{incidents.length} found</span></div>{incidents.length ? incidents.map((incident, index) => <div className="traffic-incident" key={`${incident.title}-${index}`}><span className="incident-dot"></span><div><strong>{incident.title}</strong><small>{incident.category}{incident.delay ? ` · delay ${incident.delay}` : ''}</small></div></div>) : <div className="traffic-empty">No active incidents reported nearby.</div>}</section><section className="traffic-live-map panel"><div className="traffic-card-top"><span><MapPinned size={18}/> LIVE FLOW MAP</span><span className="traffic-status"><i></i> TOMTOM REAL-TIME</span></div><TrafficMap location={location}/></section></div>}<div className="weather-traffic-foot"><span><MapPinned size={15}/> TomTom traffic flow + incidents</span><span>Refreshes every 30 minutes</span><button onClick={() => setToast(traffic.error || 'Traffic refreshes automatically every 30 minutes')}>Refresh status</button></div></div>;
}

function NewsScene({ news, location, setToast }) {
  return <div className="news-scene"><div className="scene-heading"><div><p className="eyebrow">LOCAL PULSE</p><h1>What’s happening<br/><em>nearby.</em></h1><p className="subhead">A calm, glanceable briefing for {location.city}.</p></div><div className="scene-date"><strong>{location.city}</strong><br/>REFRESHES EVERY 30 MIN</div></div>{news.loading ? <div className="news-state panel">Loading local headlines…</div> : news.error ? <div className="news-state panel">{news.error}</div> : news.articles.length ? <div className="news-grid">{news.articles.map((article, index) => <a className="news-card panel" href={article.link} target="_blank" rel="noreferrer" key={`${article.link}-${index}`}><div className="news-card-top"><span><Newspaper size={16}/> {article.source}</span><ExternalLink size={14}/></div><h2>{article.title}</h2><time>{article.published_at ? new Date(article.published_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Latest'}</time></a>)}</div> : <div className="news-state panel">No local headlines are available right now. <button onClick={() => setToast('Local news will retry on the next refresh')}>Try again later</button></div>}<div className="news-foot"><Newspaper size={15}/> Headlines are provided by Google News RSS and open at the original source.</div></div>;
}

function WeekScene({ events, family, week }) { return <div className="week-scene"><div className="scene-heading"><div><p className="eyebrow">THE WEEK AHEAD</p><h1>Everyone, everywhere.</h1><p className="subhead">A simple view of the next seven days.</p></div><div className="scene-date">{formatWeekRange(week).split('\n').map((line) => <React.Fragment key={line}>{line}<br/></React.Fragment>)}</div></div><div className="week-board">{week.map((day) => { const dayEvents = events.filter((event) => event.dayKey === day.iso); return <div className={`week-column ${day.active ? 'today' : ''}`} key={day.iso}><div className="week-column-head">{day.day} {day.date}</div>{dayEvents.length ? dayEvents.map((event) => <div className="week-event" key={event.id} style={{ borderLeftColor: event.color }}><strong>{event.time}</strong><span>{event.title}</span><small>{event.person}</small></div>) : <div className="week-empty">No plans yet</div>}</div>; })}</div><div className="scene-legend">{family.slice(1).map((person) => <span key={person.name}><i style={{ background: person.color }}></i>{person.name}</span>)}<span className="week-sync"><span className="sync-dot"></span> Google Calendar synced</span></div></div> }

function RoutinesScene({ done, routines, mealPlan, setShowMealModal, completeChore, setToast, editable }) { const chores = routines.length ? routines : [{ title: 'Pack soccer bag' }, { title: 'Feed the dog' }, { title: 'Put away laundry' }, { title: 'Water the plants' }]; const meal = mealPlan || { title: 'Sheet-pan salmon', subtitle: 'with roasted vegetables' }; return <div className="routines-scene"><div className="scene-heading"><div><p className="eyebrow">AROUND THE HOUSE</p><h1>Small jobs.<br/><em>Big wins.</em></h1><p className="subhead">{editable ? 'Manage the family rhythm from this parent device.' : 'Read-only display · manage from a parent device.'}</p></div><div className="routine-score"><strong>{done.length}</strong><span>of {chores.length}<br/>complete</span></div></div><div className="routine-grid"><section className="routine-card chores-board"><div className="routine-card-head"><div className="mini-icon chores"><ListChecks size={20}/></div><div><p className="eyebrow">TODAY’S ROUTINES</p><h2>Little wins</h2></div><span className="count">{done.length}/{chores.length}</span></div>{chores.map((chore) => <button disabled={!editable} className={`big-chore ${done.includes(chore.title) ? 'completed' : ''}`} key={chore.title} onClick={() => completeChore(chore.title)}><span>{done.includes(chore.title) ? <Check size={17}/> : null}</span><strong>{chore.title}</strong><small>{done.includes(chore.title) ? 'Done' : editable ? 'Tap to complete' : 'Parent mode'}</small></button>)}</section><section className="routine-card meal-board"><div className="routine-card-head"><div className="mini-icon meal"><UtensilsCrossed size={20}/></div><div><p className="eyebrow">TONIGHT’S PLAN</p><h2>{meal.title}</h2></div></div><div className="meal-hero"><span>DINNER · {meal.meal_date || 'TODAY'}</span><strong>{meal.title}</strong><small>{meal.subtitle || 'Family meal plan'}</small></div><button disabled={!editable} className="meal-action" onClick={() => setShowMealModal(true)}>Edit recipe & shopping list <ArrowRight size={16}/></button></section></div></div> }

function SceneDock({ scene, setScene, sceneEnabled }) { return <nav className="scene-dock" aria-label="Display scenes"><span className="scene-dock-label">PLAYLIST</span>{scenes.map((item, index) => sceneEnabled?.[item.label] !== false && <button key={item.label} className={scene === index ? 'active' : ''} onClick={() => setScene(index)}><i></i>{item.label}</button>)}<span className="scene-progress" style={{ '--scene-progress': `${((scene + 1) / scenes.length) * 100}%` }}></span></nav> }

function PairingModal({ code, onClose }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal pairing-modal"><div className="modal-heading"><div><p className="eyebrow">DISPLAY PAIRING</p><h2>Enter this code on the display.</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><div className="pairing-code">{code}</div><p className="pairing-note">This code expires in 10 minutes and can only be used once.</p><button className="save-button" onClick={onClose}>Done <Check size={17}/></button></div></div> }

function AddEventModal({ onClose, onAdd }) { const [title, setTitle] = useState(''); const [time, setTime] = useState('6:30 PM'); const [person, setPerson] = useState('Everyone'); return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><p className="eyebrow">NEW FAMILY PLAN</p><h2>Add an event</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><label>What’s happening?<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Library books due"/></label><div className="form-row"><label>Time<input type="text" value={time} onChange={(event) => setTime(event.target.value)}/></label><label>For<select value={person} onChange={(event) => setPerson(event.target.value)}>{family.map((item) => <option key={item.name}>{item.name}</option>)}</select></label></div><button className="save-button" disabled={!title.trim()} onClick={() => onAdd({ title: title.trim(), time, person, place: 'Family calendar', icon: 'family' })}>Add to calendar <ArrowRight size={17}/></button></div></div> }

function MealModal({ householdId, meal, onClose, onSaved }) { const [title, setTitle] = useState(meal?.title || ''); const [subtitle, setSubtitle] = useState(meal?.subtitle || ''); const [recipeUrl, setRecipeUrl] = useState(meal?.recipe_url || ''); const save = async () => { try { const result = await saveMealPlan(householdId, { meal_date: meal?.meal_date || new Date().toISOString().slice(0, 10), title: title.trim(), subtitle: subtitle.trim(), recipe_url: recipeUrl.trim() }); onSaved(result); } catch { /* Parent receives the unchanged modal if the write fails. */ } }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><p className="eyebrow">TONIGHT’S PLAN</p><h2>Edit meal</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><label>Meal name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Tacos"/></label><label className="modal-field-gap">Description<input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="e.g. with avocado and salsa"/></label><label className="modal-field-gap">Recipe link<input value={recipeUrl} onChange={(event) => setRecipeUrl(event.target.value)} placeholder="https://..."/></label><button className="save-button" disabled={!title.trim() || !householdId} onClick={save}>Save meal plan <Check size={17}/></button></div></div> }

function SettingsModal({ householdId, householdName, settings, onClose, onSaved }) { const [name, setName] = useState(householdName || 'Our family'); const [locationLabel, setLocationLabel] = useState(settings.location_label || ''); const [duration, setDuration] = useState(settings.scene_duration_seconds || 12); const [nightStart, setNightStart] = useState(settings.night_start_hour ?? 20); const [nightEnd, setNightEnd] = useState(settings.night_end_hour ?? 7); const [enabled, setEnabled] = useState({ ...defaultSceneEnabled, ...(settings.scene_enabled || {}) }); const [error, setError] = useState(''); const save = async () => { setError(''); try { const location = locationLabel.trim() ? await resolveLocation(locationLabel.trim()) : { location_label: '', latitude: null, longitude: null }; const savedName = await saveHouseholdName(householdId, name.trim()); const result = await saveHouseholdSettings(householdId, { location_label: location.location_label, latitude: location.latitude, longitude: location.longitude, scene_duration_seconds: Number(duration), night_start_hour: Number(nightStart), night_end_hour: Number(nightEnd), scene_enabled: enabled }); onSaved(result, savedName); } catch (saveError) { setError(saveError.message || 'Unable to save family settings'); } }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><p className="eyebrow">FAMILY SETTINGS</p><h2>Make it feel like home.</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><label>Family name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Huffs"/></label><label className="modal-field-gap">Home location<input value={locationLabel} onChange={(event) => setLocationLabel(event.target.value)} placeholder="City, state or ZIP code"/><small className="settings-help">Used for weather, traffic, and local news. Leave blank to use device location.</small></label>{error && <p className="settings-error">{error}</p>}<p className="settings-section-label modal-field-gap">PLAYLIST SCENES</p><div className="scene-settings-grid">{scenes.map((item) => <label className="scene-setting" key={item.label}><input type="checkbox" checked={enabled[item.label] !== false} onChange={(event) => setEnabled((current) => ({ ...current, [item.label]: event.target.checked }))}/><span>{item.label}</span></label>)}</div><label className="modal-field-gap">Scene duration (seconds)<input type="number" min="5" max="180" value={duration} onChange={(event) => setDuration(event.target.value)}/></label><div className="form-row"><label>Night starts<input type="number" min="0" max="23" value={nightStart} onChange={(event) => setNightStart(event.target.value)}/></label><label>Night ends<input type="number" min="0" max="23" value={nightEnd} onChange={(event) => setNightEnd(event.target.value)}/></label></div><button className="save-button" disabled={!householdId || !name.trim() || !Object.values(enabled).some(Boolean)} onClick={save}>Save family settings <Check size={17}/></button></div></div> }

function RoutineManagerModal({ householdId, routines, onClose, onChanged }) { const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false); const add = async () => { if (!title.trim()) return; setBusy(true); try { const routine = await createRoutine(householdId, title.trim(), routines.length + 1); onChanged([...routines, routine]); setTitle(''); } finally { setBusy(false); } }; const remove = async (routine) => { setBusy(true); try { await deleteRoutine(routine.id); onChanged(routines.filter((item) => item.id !== routine.id)); } finally { setBusy(false); } }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><p className="eyebrow">PARENT CONTROLS</p><h2>Manage routines</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><div className="routine-manager-list">{routines.map((routine) => <div className="routine-manager-row" key={routine.id}><span>{routine.title}</span><button disabled={busy} onClick={() => remove(routine)}><X size={15}/></button></div>)}</div><div className="form-row"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a routine"/><button className="save-button routine-add-button" disabled={busy || !title.trim()} onClick={add}>Add <Plus size={16}/></button></div><p className="pairing-note">Changes sync to every paired TV display.</p></div></div> }

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js').catch(() => {});
