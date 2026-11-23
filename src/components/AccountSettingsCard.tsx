import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { ThemeVariantMode } from '../types';
import {
  isSupabaseConfigured,
  getCurrentUser,
  onAuthStateChange,
  signUp,
  signInWithPassword,
  signInWithMagicLink,
  signOut,
} from '../services/supabaseService';
import {
  createHuntClub,
  joinHuntClub,
  getMyClubs,
  getActiveClub,
  setActiveClub,
  publishClubData,
  pullClubData,
  type MyClub,
} from '../services/huntClubService';
import type { ActiveClub } from '../types';
import { Loader2, LogIn, LogOut, KeyRound, Users, Upload, Download, Check, UserPlus, ShieldCheck, Mail } from 'lucide-react';

interface AccountSettingsCardProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  showToast: (msg: string) => void;
}

export const AccountSettingsCard: React.FC<AccountSettingsCardProps> = ({
  theme,
  isDark = theme === 'dark',
  showToast,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeClub, setActiveClubState] = useState<ActiveClub | null>(() => getActiveClub());
  const [myClubs, setMyClubs] = useState<MyClub[]>([]);
  const [clubCode, setClubCode] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubBusy, setClubBusy] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null);

  const refreshClubs = useCallback(async () => {
    const clubs = await getMyClubs();
    setMyClubs(clubs);
  }, []);

  useEffect(() => {
    let mounted = true;
    getCurrentUser().then((u) => {
      if (mounted) setUser(u);
    });
    if (isSupabaseConfigured) refreshClubs();
    const unsub = onAuthStateChange((u) => {
      setUser(u);
      if (u) refreshClubs();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [refreshClubs]);

  // ---- Auth ----
  const handleAuthSubmit = async () => {
    if (!email.trim() || password.length < 6) {
      setAuthError('Enter a valid email and a password of at least 6 characters.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = authMode === 'signup'
        ? await signUp(email.trim(), password)
        : await signInWithPassword(email.trim(), password);
      if (res.error) {
        setAuthError(res.error);
        return;
      }
      const u = await getCurrentUser();
      if (!u) {
        setAuthError('Account created — check your email for a confirmation link, then sign in.');
        setAuthMode('signin');
        return;
      }
      setUser(u);
      setPassword('');
      showToast(authMode === 'signup' ? 'Account created — welcome!' : 'Signed in successfully.');
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
    const res = await signInWithMagicLink(email.trim());
    setAuthBusy(false);
    if (res.error) setAuthError(res.error);
    else showToast(`Magic link sent to ${email.trim()} — check your inbox.`);
  };

  const handleSignOut = async () => {
    await signOut();
    setActiveClub(null);
    setActiveClubState(null);
    setMyClubs([]);
    setEmail('');
    setPassword('');
    showToast('Signed out. Your data stays on this device.');
  };

  // ---- Club actions ----
  const reloadWithToast = (summary: Awaited<ReturnType<typeof pullClubData>>) => {
    if (summary) {
      sessionStorage.setItem('letshunt_backup_imported', JSON.stringify(summary));
      window.location.reload();
    } else {
      showToast('Club joined — no data published yet. Ask the owner to sync.');
    }
  };

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
      setActiveClubState({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      setClubCode('');
      const summary = await pullClubData(club.id);
      reloadWithToast(summary);
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
      setActiveClubState({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      setClubName('');
      const result = await publishClubData(club.id, (done, total) => setPublishProgress({ done, total }));
      showToast(
        `Club created! Code: ${club.inviteCode}. Synced ${result.uploadedPhotos} photo${result.uploadedPhotos === 1 ? '' : 's'}.`
      );
      refreshClubs();
    } catch (err: any) {
      setClubError(err?.message || 'Could not create the club.');
    } finally {
      setClubBusy(false);
      setPublishProgress(null);
    }
  };

  const handlePublish = async () => {
    if (!activeClub) return;
    setClubBusy(true);
    setClubError(null);
    try {
      const result = await publishClubData(activeClub.id, (done, total) => setPublishProgress({ done, total }));
      showToast(
        `Synced to "${activeClub.name}" — ${result.uploadedPhotos} photo${result.uploadedPhotos === 1 ? '' : 's'} uploaded, ${(result.dataBytes / 1024).toFixed(0)} KB of data.`
      );
    } catch (err: any) {
      setClubError(err?.message || 'Sync failed.');
    } finally {
      setClubBusy(false);
      setPublishProgress(null);
    }
  };

  const handlePull = async () => {
    if (!activeClub) return;
    setClubBusy(true);
    setClubError(null);
    try {
      const summary = await pullClubData(activeClub.id);
      reloadWithToast(summary);
    } catch (err: any) {
      setClubError(err?.message || 'Could not load club data.');
      setClubBusy(false);
    }
  };

  const handleSwitchClub = async (club: MyClub) => {
    setClubBusy(true);
    setClubError(null);
    try {
      setActiveClub({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      setActiveClubState({ id: club.id, name: club.name, inviteCode: club.inviteCode, ownerId: club.ownerId });
      const summary = await pullClubData(club.id);
      reloadWithToast(summary);
    } catch (err: any) {
      setClubError(err?.message || 'Could not load that club.');
      setClubBusy(false);
    }
  };

  const cardBg = isDark
    ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
    : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm';

  const isHunterDark = theme === 'hunting' && isDark;
  const textPrimary = isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-500';

  const accentBtn = theme === 'hunting'
    ? 'bg-[#c85a17] hover:bg-[#b34e12] text-white'
    : theme === 'olive'
    ? 'bg-[#556b2f] hover:bg-[#4a5e27] text-white'
    : isDark
    ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
    : 'bg-emerald-500 hover:bg-emerald-600 text-white';

  const ghostBtn = isDark
    ? 'bg-slate-950/50 border-slate-700 text-slate-200 hover:border-emerald-500/60'
    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-emerald-500/60';

  const fieldCls = `flex items-center border rounded-xl px-3.5 py-2.5 transition-all ${
    isDark ? 'bg-slate-950 border-slate-800 focus-within:border-emerald-500' : 'bg-slate-100 border-slate-200 focus-within:border-emerald-600'
  }`;
  const inputCls = `w-full bg-transparent text-xs focus:outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`;

  // Accounts/HuntClubs are not part of this build. Hide the whole card rather
  // than shipping developer environment-variable instructions to hunters.
  if (!isSupabaseConfigured) return null;

  return (
    <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${cardBg}`}>
      <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
        <ShieldCheck className="w-5 h-5 text-emerald-500" />
        <h2 className={`text-base font-black ${textPrimary}`}>Account & HuntClub</h2>
      </div>

      {/* Signed-out */}
      {!user && (
        <div className="space-y-3">
          <div className={`flex items-center justify-between px-1 text-[11px] ${textSecondary}`}>
            <span>{authMode === 'signup' ? 'New to LetsHunt?' : 'Already have an account?'}</span>
            <button
              onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(null); }}
              className="font-black text-emerald-500 hover:underline"
            >
              {authMode === 'signup' ? 'Sign in' : 'Create an account'}
            </button>
          </div>

          <div className={fieldCls}>
            <LogIn className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className={inputCls} />
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

          <button
            onClick={handleAuthSubmit}
            disabled={authBusy}
            className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${accentBtn}`}
          >
            {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : authMode === 'signup' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {authBusy ? 'Working...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>

          <button
            onClick={handleMagicLink}
            disabled={authBusy}
            className={`w-full py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${ghostBtn}`}
          >
            <Mail className="w-4 h-4 text-emerald-500" /> Send Secret Link
          </button>

          <p className={`text-xs leading-relaxed ${textSecondary}`}>
            Sign in to join or create a HuntClub — a shared dataset of pins, harvest logs, trail cam photos and settings.
          </p>
        </div>
      )}

      {/* Signed-in */}
      {user && (
        <div className="space-y-4">
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="min-w-0">
              <div className={`text-xs font-black uppercase tracking-wider ${textSecondary}`}>Signed in as</div>
              <div className={`text-xs font-extrabold truncate ${textPrimary}`}>{user.email}</div>
            </div>
            <button
              onClick={handleSignOut}
              className={`px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${ghostBtn}`}
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>

          {/* Active club */}
          {activeClub && (
            <div className={`p-3.5 rounded-2xl border ${
              isDark ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-emerald-50 border-emerald-300'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={`text-xs font-black uppercase tracking-wider ${isHunterDark ? 'text-white' : isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Active HuntClub
                  </div>
                  <div className={`text-sm font-extrabold truncate ${textPrimary}`}>{activeClub.name}</div>
                  <div className={`text-xs ${textSecondary}`}>Invite code: {activeClub.inviteCode}</div>
                </div>
                <button
                  onClick={() => { setActiveClub(null); setActiveClubState(null); }}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider ${ghostBtn}`}
                >
                  Detach
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={handlePublish}
                  disabled={clubBusy}
                  className={`px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-60 ${accentBtn}`}
                >
                  {clubBusy && publishProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Sync My Data Up
                </button>
                <button
                  onClick={handlePull}
                  disabled={clubBusy}
                  className={`px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-60 ${ghostBtn}`}
                >
                  {clubBusy && !publishProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Load Club Data
                </button>
              </div>

              {publishProgress && publishProgress.total > 0 && (
                <div className="mt-2.5">
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((publishProgress.done / publishProgress.total) * 100)}%` }}
                    />
                  </div>
                  <div className={`text-xs mt-1 ${textSecondary}`}>
                    Uploading photos… {publishProgress.done}/{publishProgress.total}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Join / create */}
          {!activeClub && (
            <div className="space-y-3">
              <div className={fieldCls}>
                <KeyRound className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
                <input
                  type="text"
                  value={clubCode}
                  onChange={(e) => setClubCode(e.target.value.toUpperCase())}
                  placeholder="Join by code (e.g. XK9F-7B2A)"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoinClub(); }}
                  className={inputCls}
                />
              </div>
              <button
                onClick={handleJoinClub}
                disabled={clubBusy}
                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${accentBtn}`}
              >
                {clubBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Join Club
              </button>

              <div className="flex items-center gap-3">
                <div className={`flex-1 h-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>or</span>
                <div className={`flex-1 h-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
              </div>

              <div className={fieldCls}>
                <Users className={`w-4 h-4 mr-2 flex-shrink-0 ${textSecondary}`} />
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
                className={`w-full py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${ghostBtn}`}
              >
                {clubBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 text-emerald-500" />}
                Create Club & Sync My Data
              </button>
            </div>
          )}

          {/* My clubs (switch) */}
          {myClubs.length > 0 && (
            <div className="space-y-1.5">
              <div className={`text-xs font-black uppercase tracking-wider ${textSecondary}`}>All your clubs</div>
              {myClubs.map((club) => (
                <button
                  key={club.id}
                  onClick={() => handleSwitchClub(club)}
                  disabled={clubBusy || activeClub?.id === club.id}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all disabled:opacity-50 ${ghostBtn}`}
                >
                  <div className="min-w-0">
                    <div className={`text-xs font-extrabold truncate ${textPrimary}`}>{club.name}</div>
                    <div className={`text-xs ${textSecondary}`}>Code: {club.inviteCode} · {club.role === 'owner' ? 'Owner' : 'Member'}</div>
                  </div>
                  {activeClub?.id === club.id ? (
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Load</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {clubError && (
            <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold ${
              isDark ? 'bg-rose-950/40 border-rose-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              {clubError}
            </div>
          )}

          <p className={`text-xs leading-relaxed ${textSecondary}`}>
            Sync uploads this device's pins, logs, settings & trail cam photos (full-res goes to Backblaze B2) and saves the bundle to the club. Load pulls the club bundle onto this device.
          </p>
        </div>
      )}
    </div>
  );
};
