import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Check, ChevronDown, CloudSun, Image, ListChecks, LockKeyhole, Menu, Moon, Plus, Settings2, Sun, UtensilsCrossed, X } from 'lucide-react';
import './styles.css';
import './wall.css';
import './scenes.css';
import './access.css';
import './pairing.css';
import './photo-display.css';
import './dark-mode.css';
import { AccessGate, SecurityLoading } from './components/AccessGate';
import { createDisplayPairing, createHousehold, getCurrentSession, loadHousecalState, pollGooglePhotosPicker, signOut, startGoogleConnection, startGooglePhotosPicker, supabase, syncGoogleCalendar, validateDisplaySession } from './lib/supabase';

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

const week = [
  { day: 'SUN', date: '9' }, { day: 'MON', date: '10' }, { day: 'TUE', date: '11' },
  { day: 'WED', date: '12' }, { day: 'THU', date: '13' }, { day: 'FRI', date: '14' }, { day: 'SAT', date: '15', active: true },
];

const scenes = [
  { label: 'Calendar', kicker: 'YOUR DAY' },
  { label: 'Photos', kicker: 'FAMILY FRAME' },
  { label: 'Week', kicker: 'THE WEEK AHEAD' },
  { label: 'Routines', kicker: 'AROUND THE HOUSE' },
];

function isNighttime() {
  const hour = new Date().getHours();
  return hour >= 20 || hour < 7;
}

function toDisplayEvent(event) {
  const start = new Date(event.starts_at);
  return { id: event.id || event.external_id, time: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), title: event.title, person: event.person || 'Everyone', place: event.location || 'Family calendar', color: event.color || '#6d7b70', icon: event.source === 'google_calendar' ? 'calendar' : 'family' };
}

function App() {
  const [nightMode, setNightMode] = useState(isNighttime);
  const [access, setAccess] = useState({ loading: true, session: null, display: null });
  const [events, setEvents] = useState(seedEvents);
  const [photos, setPhotos] = useState([]);
  const [activeFilter, setActiveFilter] = useState('Everyone');
  const [view, setView] = useState('Today');
  const [showModal, setShowModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [done, setDone] = useState([]);
  const [toast, setToast] = useState('');
  const [scene, setScene] = useState(0);
  const [pairingCode, setPairingCode] = useState('');

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
        try {
          const liveState = await loadHousecalState({ householdId: household.id });
          if (liveState?.events?.length) setEvents(liveState.events.map(toDisplayEvent));
          if (liveState?.photos?.length) setPhotos(liveState.photos.map((photo) => photo.url));
        } catch { /* Keep the local preview data until the Edge Functions are deployed. */ }
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
        } catch { /* Keep the local preview data until the Edge Functions are deployed. */ }
      }
      setAccess({ loading: false, session, display, household });
    }).catch(() => setAccess({ loading: false, session: null, display: null, household: null }));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccess((current) => ({ ...current, session, loading: false }));
    });
    return () => { mounted = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const updateNightMode = () => setNightMode(isNighttime());
    document.documentElement.dataset.theme = nightMode ? 'night' : 'day';
    const timer = setInterval(updateNightMode, 60000);
    return () => { clearInterval(timer); delete document.documentElement.dataset.theme; };
  }, [nightMode]);

  useEffect(() => {
    const timer = setInterval(() => setScene((current) => (current + 1) % scenes.length), 12000);
    return () => clearInterval(timer);
  }, []);

  const filteredEvents = useMemo(() => activeFilter === 'Everyone' ? events : events.filter((event) => event.person === activeFilter || event.person === 'Everyone'), [events, activeFilter]);
  const completeChore = (name) => setDone((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  const addEvent = (event) => { setEvents((current) => [...current, { ...event, id: Date.now(), color: family.find((person) => person.name === event.person)?.color || '#6d7b70' }]); setShowModal(false); setToast('Added to the family calendar'); setTimeout(() => setToast(''), 2200); };
  const connectGoogle = async (provider) => {
    if (!access.session || !access.household?.id) return setToast('Parent sign-in and a household are required');
    try { const result = await startGoogleConnection(provider, access.household.id); window.location.assign(result.auth_url); } catch (error) { setToast(error.message || `Unable to connect Google ${provider}`); }
  };
  const openPhotosPicker = async () => {
    try {
      const picker = await startGooglePhotosPicker(access.household?.id);
      const pickerWindow = window.open(picker.picker_uri, '_blank', 'noopener,noreferrer');
      if (!pickerWindow) return setToast('Allow pop-ups to open Google Photos');
      setToast('Choose photos in the Google Photos tab');
      const interval = setInterval(async () => {
        try {
          const result = await pollGooglePhotosPicker(access.household.id, picker.session_id);
          if (result.ready) { clearInterval(interval); setToast(`Imported ${result.imported} photos`); const liveState = await loadHousecalState({ householdId: access.household.id }); setPhotos((liveState.photos || []).map((photo) => photo.url)); }
        } catch { clearInterval(interval); }
      }, 4000);
      setTimeout(() => clearInterval(interval), 12 * 60 * 1000);
    } catch (error) { setToast(error.message || 'Connect Google Photos first'); }
  };
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
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>housecal</strong><small>the family command center</small></div></div>
      <div className="topbar-right"><div className="weather">{nightMode ? <Moon size={18} strokeWidth={1.7}/> : <Sun size={18} strokeWidth={1.7}/>}<span>68°</span><small>Chicago, IL</small></div><button className="icon-button" aria-label="Notifications"><Bell size={20}/><i></i></button><button className="avatar" onClick={() => setShowMenu(!showMenu)} aria-label="Open family settings" aria-expanded={showMenu}>BH</button><button className="icon-button menu-button" onClick={() => setShowMenu(!showMenu)} aria-label="Open menu"><Menu size={22}/></button></div>
      {showMenu && <div className="quick-menu"><button onClick={() => connectGoogle('calendar')}>Connect Google Calendar <span>→</span></button><button onClick={() => connectGoogle('photos')}>Connect Google Photos <span>→</span></button>{access.session && <button onClick={async () => { try { const result = await createDisplayPairing(access.household?.id); setPairingCode(result?.code || ''); setShowMenu(false); } catch (error) { setToast(error.message || 'Create a pairing code after applying the Supabase migration'); } }}>Pair a Display <span>→</span></button>}<button onClick={() => setToast(access.session ? `Household: ${access.household?.name || 'Our family'}` : 'Local preview mode')}>Display settings <span>→</span></button>{access.session && <button onClick={async () => { await signOut(); setShowMenu(false); }}>Sign out <span>↗</span></button>}</div>}
    </header>

    <main className={`scene-main scene-${scene}`}>
      {scene === 0 && <CalendarScene view={view} setView={setView} week={week} family={family} activeFilter={activeFilter} setActiveFilter={setActiveFilter} filteredEvents={filteredEvents} setShowModal={setShowModal} setToast={setToast} openPhotosPicker={openPhotosPicker} done={done} completeChore={completeChore}/>}
      {scene === 1 && <PhotoScene setToast={setToast} photos={photos}/>}
      {scene === 2 && <WeekScene events={events} family={family}/>} 
      {scene === 3 && <RoutinesScene done={done} completeChore={completeChore} setToast={setToast}/>} 
      <SceneDock scene={scene} setScene={setScene}/>
    </main>
    {showModal && <AddEventModal onClose={() => setShowModal(false)} onAdd={addEvent}/>} {pairingCode && <PairingModal code={pairingCode} onClose={() => setPairingCode('')}/>} {toast && <div className="toast">{toast}</div>}
  </div>;
}

function CalendarScene({ view, setView, week, family, activeFilter, setActiveFilter, filteredEvents, setShowModal, setToast, openPhotosPicker, done, completeChore }) { return <div className="scene-content calendar-scene">
  <section className="welcome-row"><div><p className="eyebrow">SATURDAY, AUGUST 15, 2026</p><h1>Good morning, family.</h1><p className="subhead">Here’s what’s happening around the house.</p></div><div className="view-switcher">{['Today', 'Week', 'Month'].map((item) => <button className={view === item ? 'selected' : ''} key={item} onClick={() => setView(item)}>{item}</button>)}</div></section>
  <section className="week-strip"><button className="week-arrow"><ArrowLeft size={18}/></button>{week.map((item) => <button key={item.date} className={`day-card ${item.active ? 'current' : ''}`} onClick={() => setToast(item.active ? 'You are viewing today' : `${item.day}, August ${item.date}`)}><span>{item.day}</span><strong>{item.date}</strong>{item.active && <i></i>}</button>)}<button className="week-arrow"><ArrowRight size={18}/></button></section>
  <div className="family-filters">{family.map((person) => <button key={person.name} className={activeFilter === person.name ? 'active' : ''} onClick={() => setActiveFilter(person.name)}><span style={{ background: person.color }}></span>{person.name}</button>)}<button className="manage-family" onClick={() => setToast('Family profiles are ready for Google account linking')}><Settings2 size={16}/> Manage family</button></div>
  <section className="content-grid"><div className="schedule-card panel"><div className="panel-heading"><div><p className="eyebrow">TODAY AT A GLANCE</p><h2>{view === 'Today' ? 'Saturday, August 15' : `${view} view`}</h2></div><button className="add-button" onClick={() => setShowModal(true)}><Plus size={18}/> Add event</button></div><div className="timeline">{filteredEvents.map((event) => <div className="event-row" key={event.id}><div className="event-time">{event.time}</div><div className="event-line"><span style={{ background: event.color }}></span></div><div className="event-info"><div><h3>{event.title}</h3><p>{event.place} <span>·</span> {event.person}</p></div><div className="event-badge" style={{ color: event.color, background: `${event.color}18` }}>{event.icon === 'dinner' ? 'Dinner' : event.icon === 'ball' ? 'Activity' : 'Family'}</div></div></div>)}</div><div className="sync-row"><span className="sync-dot"></span> Synced with Google Calendar <span className="sync-time">just now</span></div></div><div className="right-column"><section className="photo-card panel"><div className="photo-content"><div className="photo-topline"><span><Image size={15}/> FAMILY PHOTOS</span><button onClick={openPhotosPicker}>View album <ArrowRight size={15}/></button></div><div className="photo-copy"><p>Little moments,<br/><em>always close by.</em></p><small>Now showing · Summer 2026</small></div><div className="photo-dots"><i></i><i className="active"></i><i></i><i></i></div></div></section><div className="small-panels"><section className="mini-card panel"><div className="mini-heading"><div className="mini-icon meal"><UtensilsCrossed size={17}/></div><div><p className="eyebrow">TONIGHT</p><h3>Dinner plan</h3></div><ChevronDown size={17}/></div><div className="meal-line"><strong>Sheet-pan salmon</strong><span>with roasted vegetables</span></div><button className="text-action" onClick={() => setToast('Meal planner opened')}>View this week <ArrowRight size={15}/></button></section><section className="mini-card panel"><div className="mini-heading"><div className="mini-icon chores"><ListChecks size={17}/></div><div><p className="eyebrow">ROUTINES</p><h3>Little wins</h3></div><span className="count">{done.length}/3</span></div>{['Pack soccer bag', 'Feed the dog', 'Put away laundry'].map((chore) => <button className={`chore ${done.includes(chore) ? 'completed' : ''}`} key={chore} onClick={() => completeChore(chore)}><span>{done.includes(chore) ? <Check size={13}/> : null}</span>{chore}<b>{done.includes(chore) ? 'Done' : 'Today'}</b></button>)}</section></div></div></section>
  <section className="bottom-bar"><div><LockKeyhole size={15}/> Parent mode is on</div><span>Tap the lock icon on any device to edit</span><button onClick={() => setToast('Display is set to stay awake during the day')}><CloudSun size={16}/> Display awake <span className="toggle on"><i></i></span></button></section>
</div> }

const photoImages = [
  'https://images.unsplash.com/photo-1504150558240-0b4fd8946624?auto=format&fit=crop&w=1920&q=85',
  'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1920&q=85',
  'https://images.unsplash.com/photo-1472162072942-cd5147eb3902?auto=format&fit=crop&w=1920&q=85',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1920&q=85',
];

function PhotoScene({ setToast, photos }) {
  const [layout, setLayout] = useState(() => Math.floor(Math.random() * 4));
  const [imageIndex, setImageIndex] = useState(() => Math.floor(Math.random() * photoImages.length));
  useEffect(() => {
    const timer = setInterval(() => {
      setLayout(Math.floor(Math.random() * 4));
      setImageIndex(Math.floor(Math.random() * photoImages.length));
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
    <div className="photo-scene-overlay"><div className="photo-scene-top"><span><Image size={17}/> FAMILY ALBUM · SUMMER 2026</span><span>68° · CHICAGO</span></div><div className="photo-scene-caption"><p>{layout === 3 ? <>Together is<br/><em>our favorite place.</em></> : <>Little moments,<br/><em>always close by.</em></>}</p><small>Sunday afternoon at the lake · 2026</small></div><button onClick={() => setToast('Photo albums will sync from Google Photos')}>Open family album <ArrowRight size={16}/></button></div>
  </div>;
}

function WeekScene({ events, family }) { return <div className="week-scene"><div className="scene-heading"><div><p className="eyebrow">THE WEEK AHEAD</p><h1>Everyone, everywhere.</h1><p className="subhead">A simple view of the next seven days.</p></div><div className="scene-date">AUG 9 — 15<br/><strong>2026</strong></div></div><div className="week-board">{['SUN 9','MON 10','TUE 11','WED 12','THU 13','FRI 14','SAT 15'].map((day, index) => <div className={`week-column ${index === 6 ? 'today' : ''}`} key={day}><div className="week-column-head">{day}</div>{index === 6 ? events.map((event) => <div className="week-event" key={event.id} style={{ borderLeftColor: event.color }}><strong>{event.time}</strong><span>{event.title}</span><small>{event.person}</small></div>) : <div className="week-empty">{index === 1 ? 'No plans yet' : index === 4 ? 'Open afternoon' : '—'}</div>}</div>)}</div><div className="scene-legend">{family.slice(1).map((person) => <span key={person.name}><i style={{ background: person.color }}></i>{person.name}</span>)}<span className="week-sync"><span className="sync-dot"></span> Google Calendar synced</span></div></div> }

function RoutinesScene({ done, completeChore, setToast }) { const chores = ['Pack soccer bag', 'Feed the dog', 'Put away laundry', 'Water the plants']; return <div className="routines-scene"><div className="scene-heading"><div><p className="eyebrow">AROUND THE HOUSE</p><h1>Small jobs.<br/><em>Big wins.</em></h1><p className="subhead">The things that keep our home moving.</p></div><div className="routine-score"><strong>{done.length}</strong><span>of 4<br/>complete</span></div></div><div className="routine-grid"><section className="routine-card chores-board"><div className="routine-card-head"><div className="mini-icon chores"><ListChecks size={20}/></div><div><p className="eyebrow">TODAY’S ROUTINES</p><h2>Little wins</h2></div><span className="count">{done.length}/4</span></div>{chores.map((chore) => <button className={`big-chore ${done.includes(chore) ? 'completed' : ''}`} key={chore} onClick={() => completeChore(chore)}><span>{done.includes(chore) ? <Check size={17}/> : null}</span><strong>{chore}</strong><small>{done.includes(chore) ? 'Done' : 'Tap to complete'}</small></button>)}</section><section className="routine-card meal-board"><div className="routine-card-head"><div className="mini-icon meal"><UtensilsCrossed size={20}/></div><div><p className="eyebrow">TONIGHT’S PLAN</p><h2>Sheet-pan salmon</h2></div></div><div className="meal-hero"><span>DINNER · 5:45 PM</span><strong>Roasted salmon<br/>with vegetables</strong><small>Easy, colorful, and ready in 30 minutes.</small></div><button className="meal-action" onClick={() => setToast('Meal planner opened')}>View recipe & shopping list <ArrowRight size={16}/></button></section></div></div> }

function SceneDock({ scene, setScene }) { return <nav className="scene-dock" aria-label="Display scenes"><span className="scene-dock-label">PLAYLIST</span>{scenes.map((item, index) => <button key={item.label} className={scene === index ? 'active' : ''} onClick={() => setScene(index)}><i></i>{item.label}</button>)}<span className="scene-progress" style={{ '--scene-progress': `${((scene + 1) / scenes.length) * 100}%` }}></span></nav> }

function PairingModal({ code, onClose }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal pairing-modal"><div className="modal-heading"><div><p className="eyebrow">DISPLAY PAIRING</p><h2>Enter this code on the display.</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><div className="pairing-code">{code}</div><p className="pairing-note">This code expires in 10 minutes and can only be used once.</p><button className="save-button" onClick={onClose}>Done <Check size={17}/></button></div></div> }

function AddEventModal({ onClose, onAdd }) { const [title, setTitle] = useState(''); const [time, setTime] = useState('6:30 PM'); const [person, setPerson] = useState('Everyone'); return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-heading"><div><p className="eyebrow">NEW FAMILY PLAN</p><h2>Add an event</h2></div><button className="close-button" onClick={onClose}><X size={20}/></button></div><label>What’s happening?<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Library books due"/></label><div className="form-row"><label>Time<input type="text" value={time} onChange={(event) => setTime(event.target.value)}/></label><label>For<select value={person} onChange={(event) => setPerson(event.target.value)}>{family.map((item) => <option key={item.name}>{item.name}</option>)}</select></label></div><button className="save-button" disabled={!title.trim()} onClick={() => onAdd({ title: title.trim(), time, person, place: 'Family calendar', icon: 'family' })}>Add to calendar <ArrowRight size={17}/></button></div></div> }

createRoot(document.getElementById('root')).render(<App />);
