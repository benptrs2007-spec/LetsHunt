import React, { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { Location, ThemeVariantMode } from '../types';
import { searchLocations } from '../services/weatherService';
import { isSupabaseConfigured, getCurrentUser, onAuthStateChange, signUp, signInWithPassword, signInWithMagicLink } from '../services/supabaseService';
import { createHuntClub, joinHuntClub, getMyClubs, setActiveClub, publishClubData, pullClubData, type MyClub } from '../services/huntClubService';
import { safeSet } from '../utils/storage';
import { MapPin, Search, Compass, Check, X, Target, CloudSun, BellRing, ArrowRight, ChevronLeft, Loader2, Users, KeyRound, UserPlus, LogIn, ShieldCheck, Sparkles, Mail } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  onComplete: (loc: Location | null) => void;
}

const STEPS = ['Welcome', 'Account', 'HuntClub', 'Your Grounds', 'Done'];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  theme,
  isDark = theme === 'dark',
  onComplete,
}) => {
  const [step, setStep] = useState(0);

  // ---- Location search (existing) ----
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // ---- Account step ----
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [accountUser, setAccountUser] = useState<User | null>(null);
  const [isAccountSkipped, setIsAccountSkipped] = useState(false);

  // ---- HuntClub step ----
  const [clubBusy, setClubBusy] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [clubCode, setClubCode] = useState('');
  const [clubName, setClubName] = useState('');
  const [myClubs, setMyClubs] = useState<MyClub[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null);

  // Reset the wizard whenever it's (re)opened
  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedLoc(null);
    setShowDropdown(false);
    setAuthMode('signup');
    setEmail('');
    setPassword('');
    setAuthBusy(false);
    setAuthError(null);
    setAuthInfo(null);
    setAccountUser(null);
    setIsAccountSkipped(false);
    setClubBusy(false);
    setClubError(null);
    setClubCode('');
    setClubName('');
    setIsPublishing(false);
    setPublishProgress(null);
    setMyClubs([]);

    // Pre-fill signed-in state if a session already exists.
    getCurrentUser().then((u) => setAccountUser(u));
    if (isSupabaseConfigured) {
      getMyClubs().then(setMyClubs).catch(() => {});
    }
  }, [isOpen]);

  // Keep auth state in sync (e.g. magic-link confirmation in another tab).
  useEffect(() => {
    return onAuthStateChange((u) => {
      setAccountUser(u);
      if (u) {
        getMyClubs().then(setMyClubs).catch(() => {});
      }
    });
  }, []);

  // Debounced location search
  useEffect(() => {
    if (!isOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLocations(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
      setShowDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  // Click outside closes the dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGps = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: 'My GPS Location',
          admin1: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          country: 'Current Position',
          latitude,
          longitude,
        };
        setSelectedLoc(gpsLocation);
        setIsLocating(false);
        setStep(4);
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const selectLocation = (loc: Location) => {
    setSelectedLoc(loc);
    setShowDropdown(false);
    setStep(4);
  };

  // ---- Account handlers ----
  const handleAuthSubmit = async () => {
    if (!email.trim() || password.length < 6) {
      setAuthError('Enter a valid email and a password of at least 6 characters.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      if (authMode === 'signup') {
        const res = await signUp(email.trim(), password);
        if (res.error) {
          setAuthError(res.error);
          return;
        }
        // If email confirmation is required the session won't exist yet.
        const u = await getCurrentUser();
        if (!u) {
          setAuthInfo('Account created! Check your email for a confirmation link, then sign in below.');
          setAuthMode('signin');
          return;
        }
        setAccountUser(u);
        setStep(2);
      } else {
        const res = await signInWithPassword(email.trim(), password);
        if (res.error) {
          setAuthError(res.error);
          return;
        }
        setAccountUser(res.user);
        setStep(2);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email.trim()) {
      setAuthError('Enter your email first.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    const res = await signInWithMagicLink(email.trim());
    setAuthBusy(false);
    if (res.error) {
      setAuthError(res.error);
    } else {
      setAuthInfo(`Check ${email.trim()} for a sign-in link.`);
    }
  };

  // After joining a club with data: import, mark onboarding done, reload.
  const finishJoinWithData = (summary: Awaited<ReturnType<typeof pullClubData>>) => {
    safeSet('letshunt_onboarded', 'true');
    if (summary) {
      sessionStorage.setItem('letshunt_backup_imported', JSON.stringify(summary));
      window.location.reload();
    } else {
      onComplete(null);
    }
  };

  // ---- HuntClub handlers ----
  const handleJoinClub = async () => {
    const code = clubCode.trim();
    if (!code) {
      setClubError('Enter the club code from the club owner.');
      return;
    }
    setClubBusy(true);
    setClubError(null);
    try {
      const club = await joinHuntClub(code);
      setActiveClub({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      const summary = await pullClubData(club.id);
      finishJoinWithData(summary);
    } catch (err: any) {
      setClubError(err?.message || 'Could not join that club.');
    } finally {
      setClubBusy(false);
    }
  };

  const handleCreateClub = async () => {
    if (!clubName.trim()) {
      setClubError('Give your HuntClub a name.');
      return;
    }
    setClubBusy(true);
    setClubError(null);
    try {
      const club = await createHuntClub(clubName);
      setActiveClub({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      setIsPublishing(true);
      setPublishProgress({ done: 0, total: 0 });
      const result = await publishClubData(club.id, (done, total) => setPublishProgress({ done, total }));
      console.info(`[club] published ${result.uploadedPhotos} photos, ${result.dataBytes} bytes of data`);
      setIsPublishing(false);
      setStep(3); // Your Grounds
    } catch (err: any) {
      setIsPublishing(false);
      setClubError(err?.message || 'Could not create the club.');
    } finally {
      setClubBusy(false);
    }
  };

  const handleLoadExistingClub = async (club: MyClub) => {
    setClubBusy(true);
    setClubError(null);
    try {
      setActiveClub({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      const summary = await pullClubData(club.id);
      finishJoinWithData(summary);
    } catch (err: any) {
      setClubError(err?.message || 'Could not load that club.');
    } finally {
      setClubBusy(false);
    }
  };

  if (!isOpen) return null;

  const cardBg = isDark
    ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl border-slate-800'
    : theme === 'hunting'
    ? 'bg-[#f4eee1]/[var(--card-opacity)] backdrop-blur-xl border-[#d4c4a8]'
    : theme === 'olive'
    ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl border-[#d8d2c0]'
    : 'bg-white/[var(--card-opacity)] backdrop-blur-xl border-slate-200';

  const accentBtn =
    theme === 'hunting'
      ? 'bg-[#c85a17] hover:bg-[#b34e12] text-white'
      : theme === 'olive'
      ? 'bg-[#556b2f] hover:bg-[#4a5e27] text-white'
      : isDark
      ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
      : 'bg-emerald-500 hover:bg-emerald-600 text-white';

  const ghostBtn = isDark
    ? 'bg-slate-950/[var(--card-opacity)] border-slate-700 text-slate-200 hover:border-emerald-500/60'
    : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-700 hover:border-emerald-500/60';

  const textPrimary = isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-500';

  const inputCls = `w-full bg-transparent text-sm focus:outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`;
  const fieldCls = `flex items-center border rounded-xl px-3.5 py-2.5 transition-all ${
    isDark ? 'bg-slate-950 border-slate-700 focus-within:border-emerald-500' : 'bg-slate-100 border-slate-200 focus-within:border-emerald-600'
  }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden animate-fadeIn ${cardBg}`}>
        {/* Header strip */}
        <div className="relative px-6 pt-6 pb-4 text-center">
          <button
            onClick={() => onComplete(null)}
            className={`absolute right-3 top-3 w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-slate-500/10 ${textSecondary}`}
            title="Skip setup"
          >
            <X className="w-4 h-4" />
          </button>

          <img
            src="./hunt-icon-120.png"
            alt="LetsHunt"
            className="w-16 h-16 mx-auto rounded-2xl shadow-lg object-cover mb-3"
          />
          <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${textPrimary}`}>Welcome to LetsHunt</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>
            Simple deer movement forecasts built from weather, the barometer, wind, and moon times.
          </p>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {STEPS.map((label, i) => (
              <span
                key={label}
                title={label}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-8 bg-emerald-500'
                    : i < step
                    ? 'w-2 bg-emerald-500/60'
                    : isDark
                    ? 'w-2 bg-slate-700'
                    : 'w-2 bg-slate-300'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 pb-6">
          {/* STEP 0: Welcome */}
          {step === 0 && (
            <div className="space-y-3">
              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <CloudSun className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <div>
                  <div className={`text-xs font-extrabold ${textPrimary}`}>14-Day Movement Outlook</div>
                  <div className={`text-xs mt-0.5 leading-relaxed ${textSecondary}`}>
                    Your dashboard shows a close-up 7-day plan, plus a 14-day outlook for spotting the next cold front. Every day gets a 0–100 hunt score, best morning/evening windows, and moon times.
                  </div>
                </div>
              </div>

              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Target className="w-4.5 h-4.5 text-emerald-500" />
                </div>
                <div>
                  <div className={`text-xs font-extrabold ${textPrimary}`}>Map Your Grounds</div>
                  <div className={`text-xs mt-0.5 leading-relaxed ${textSecondary}`}>
                    Plot stands, bedding areas, food plots & travel routes, then get wind-matched stand recommendations.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(1)}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${accentBtn}`}
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 1: Account */}
          {step === 1 && (
            <div className="space-y-3">
              <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>
                {accountUser ? 'You are signed in' : 'Create an account or continue as guest'}
              </p>

              {accountUser ? (
                <>
                  <div className={`p-4 rounded-2xl border flex items-center gap-3 ${isDark ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'}`}>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Signed in as</div>
                      <div className="text-sm font-extrabold truncate">{accountUser.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${accentBtn}`}
                  >
                    Continue to HuntClub <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  {/* Mode toggle */}
                  <div className={`flex items-center justify-between px-1 text-[11px] ${textSecondary}`}>
                    <span>{authMode === 'signup' ? 'New to LetsHunt?' : 'Already have an account?'}</span>
                    <button
                      onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(null); setAuthInfo(null); }}
                      className="font-black text-emerald-500 hover:underline"
                    >
                      {authMode === 'signup' ? 'Sign in' : 'Create an account'}
                    </button>
                  </div>

                  <div className={fieldCls}>
                    <LogIn className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      autoComplete="email"
                      className={inputCls}
                    />
                  </div>

                  <div className={fieldCls}>
                    <KeyRound className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={authMode === 'signup' ? 'Password (6+ characters)' : 'Password'}
                      autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAuthSubmit(); }}
                      className={inputCls}
                    />
                  </div>

                  {authError && (
                    <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold ${
                      isDark ? 'bg-rose-950/40 border-rose-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}>
                      {authError}
                    </div>
                  )}
                  {authInfo && (
                    <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold ${
                      isDark ? 'bg-sky-950/40 border-sky-800 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700'
                    }`}>
                      {authInfo}
                    </div>
                  )}

                  <button
                    onClick={handleAuthSubmit}
                    disabled={authBusy}
                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 ${accentBtn}`}
                  >
                    {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : authMode === 'signup' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                    {authBusy ? 'Working...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
                  </button>

                  <button
                    onClick={handleMagicLink}
                    disabled={authBusy}
                    className={`w-full py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${ghostBtn}`}
                  >
                    <Mail className="w-4 h-4 text-emerald-500" /> Send Secret Link
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  setIsAccountSkipped(true);
                  setStep(2);
                }}
                className={`w-full py-2 text-xs font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                Skip for now — I'll set up an account later
              </button>
            </div>
          )}

          {/* STEP 2: HuntClub */}
          {step === 2 && (
            <div className="space-y-3">
              <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>
                Join a HuntClub or start fresh
              </p>

              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Users className="w-4.5 h-4.5 text-emerald-500" />
                </div>
                <div>
                  <div className={`text-xs font-extrabold ${textPrimary}`}>What's a HuntClub?</div>
                  <div className={`text-xs mt-0.5 leading-relaxed ${textSecondary}`}>
                    A shared hunting dataset — map pins, harvest logs, trail cam photos & settings. Join with a code to load a club's grounds, or start your own to share yours.
                  </div>
                </div>
              </div>

              {!accountUser && isAccountSkipped && (
                <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold ${
                  isDark ? 'bg-amber-950/40 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  Joining or creating a HuntClub needs an account.{' '}
                  <button onClick={() => setStep(1)} className="underline font-black">Create one</button> or skip below to start with a clean slate.
                </div>
              )}

              {accountUser && myClubs.length > 0 && (
                <div className="space-y-1.5">
                  <div className={`text-xs font-black uppercase tracking-wider ${textSecondary}`}>Your clubs</div>
                  {myClubs.map((club) => (
                    <button
                      key={club.id}
                      onClick={() => handleLoadExistingClub(club)}
                      disabled={clubBusy}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all disabled:opacity-60 ${ghostBtn}`}
                    >
                      <div className="min-w-0">
                        <div className={`text-xs font-extrabold truncate ${textPrimary}`}>{club.name}</div>
                        <div className={`text-xs ${textSecondary}`}>Code: {club.inviteCode} · {club.role === 'owner' ? 'Owner' : 'Member'}</div>
                      </div>
                      <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        Load <ArrowRight className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {accountUser && (
                <>
                  <div className={fieldCls}>
                    <KeyRound className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                    <input
                      type="text"
                      value={clubCode}
                      onChange={(e) => setClubCode(e.target.value.toUpperCase())}
                      placeholder="Club code (e.g. XK9F-7B2A)"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleJoinClub(); }}
                      className={inputCls}
                    />
                  </div>
                  <button
                    onClick={handleJoinClub}
                    disabled={clubBusy}
                    className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 ${accentBtn}`}
                  >
                    {clubBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {clubBusy ? 'Joining...' : 'Join This Club'}
                  </button>

                  <div className="flex items-center gap-3 my-1">
                    <div className={`flex-1 h-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>or</span>
                    <div className={`flex-1 h-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                  </div>

                  <div className={fieldCls}>
                    <UserPlus className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                    <input
                      type="text"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="Start your own club — e.g. 'Cedar Creek Lease'"
                      className={inputCls}
                    />
                  </div>
                  <button
                    onClick={handleCreateClub}
                    disabled={clubBusy}
                    className={`w-full py-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 ${ghostBtn}`}
                  >
                    {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-emerald-500" />}
                    {isPublishing
                      ? publishProgress && publishProgress.total > 0
                        ? `Publishing ${publishProgress.done}/${publishProgress.total} photos...`
                        : 'Publishing your data...'
                      : 'Create Club & Publish My Data'}
                  </button>
                </>
              )}

              {clubError && (
                <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold ${
                  isDark ? 'bg-rose-950/40 border-rose-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}>
                  {clubError}
                </div>
              )}

              <button
                onClick={() => setStep(3)}
                className={`w-full py-2 text-xs font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                Skip — start with a clean slate <ArrowRight className="w-3 h-3" />
              </button>

              <button
                onClick={() => setStep(1)}
                className={`w-full py-2 text-xs font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          )}

          {/* STEP 3: Pick your location */}
          {step === 3 && (
            <div className="space-y-3">
              <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Where do you hunt?</p>

              <div className="relative" ref={searchContainerRef}>
                <div className={fieldCls}>
                  <Search className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search city, county, or zip code..."
                    className={inputCls}
                  />
                  {isSearching && (
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0" />
                  )}
                </div>

                {showDropdown && searchResults.length > 0 && (
                  <div
                    className={`absolute top-full left-0 right-0 mt-1.5 border rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-200'
                        : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                    }`}
                  >
                    {searchResults.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectLocation(loc)}
                        className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center gap-2 text-xs cursor-pointer ${
                          isDark ? 'hover:bg-emerald-950/50 hover:text-emerald-300' : 'hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        <div className="min-w-0">
                          <span className="font-semibold">{loc.name}</span>
                          <span className={`ml-1 text-xs ${textSecondary}`}>
                            {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleGps}
                disabled={isLocating}
                className={`w-full py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 ${ghostBtn}`}
              >
                <Compass className={`w-4 h-4 text-emerald-500 ${isLocating ? 'animate-spin' : ''}`} />
                {isLocating ? 'Locating...' : 'Use My GPS Location'}
              </button>

              <button
                onClick={() => setStep(2)}
                className={`w-full py-2 text-xs font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          )}

          {/* STEP 4: Confirm & finish */}
          {step === 4 && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border flex items-center gap-3 ${
                  isDark ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Your Hunting Grounds
                  </div>
                  <div className={`text-sm font-extrabold truncate ${textPrimary}`}>{selectedLoc?.name}</div>
                  <div className={`text-xs truncate ${textSecondary}`}>
                    {selectedLoc?.admin1 ? `${selectedLoc.admin1}, ` : ''}{selectedLoc?.country}
                  </div>
                </div>
              </div>

              <p className={`text-xs leading-relaxed ${textSecondary}`}>
                This will be your default starting location and will be saved to your hunting grounds list. You can change it anytime from Settings.
              </p>

              <button
                onClick={() => onComplete(selectedLoc)}
                className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${accentBtn}`}
              >
                Start Hunting <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setStep(3)}
                className={`w-full py-2 text-xs font-bold flex items-center justify-center gap-1 ${textSecondary} hover:underline`}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Change location
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
