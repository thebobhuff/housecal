import { useState } from 'react';
import { ArrowRight, KeyRound, Monitor, ShieldCheck } from 'lucide-react';
import { claimDisplayPairing, signInWithGoogle } from '../lib/supabase';

export function AccessGate({ onPaired }) {
  const [mode, setMode] = useState('parent');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = async () => {
    setBusy(true); setError('');
    const { error: authError } = await signInWithGoogle();
    if (authError) setError(authError.message);
    setBusy(false);
  };

  const pair = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await claimDisplayPairing(code, 'Living room Display');
      if (!result) throw new Error('That pairing code is invalid or expired.');
      onPaired(result);
    } catch (pairError) {
      setError(pairError.message || 'Unable to pair this display.');
    } finally { setBusy(false); }
  };

  return <div className="access-screen"><div className="access-card"><div className="access-mark"><span></span><span></span><span></span></div><p className="eyebrow">HOUSECAL ACCESS</p><h1>Your family,<br/><em>only your family.</em></h1><p className="access-copy">HouseCal keeps the family display private. Sign in to manage your household, or pair this screen with a code from a parent device.</p><div className="access-tabs"><button className={mode === 'parent' ? 'active' : ''} onClick={() => { setMode('parent'); setError(''); }}><ShieldCheck size={16}/> Parent sign-in</button><button className={mode === 'display' ? 'active' : ''} onClick={() => { setMode('display'); setError(''); }}><Monitor size={16}/> Pair this display</button></div>{mode === 'parent' ? <div className="access-action"><button className="google-button" onClick={login} disabled={busy}><span className="google-g">G</span>{busy ? 'Opening Google…' : 'Continue with Google'}<ArrowRight size={16}/></button><small>Only household parents can connect calendars and photos.</small></div> : <form className="access-action" onSubmit={pair}><label>PAIRING CODE<input autoFocus inputMode="text" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123"/></label><button className="google-button" disabled={busy || code.length < 6}><KeyRound size={16}/>{busy ? 'Pairing…' : 'Pair this Display'}<ArrowRight size={16}/></button><small>Generate a code in HouseCal settings on a parent device. Codes expire after 10 minutes.</small></form>}{error && <p className="access-error">{error}</p>}</div></div>;
}

export function SecurityLoading() { return <div className="access-screen"><div className="security-loading"><div className="access-mark"><span></span><span></span><span></span></div><p>Securing your family display…</p></div></div>; }
