/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {

  DailyForecast,
  Location,
  UnitSystem,
  ThemeMode,
  ThemeVariant,
  ThemeVariantMode,
  combineVariantMode,

  PressureUnit,

} from './types';
import { fetch5DayHuntingForecast } from './services/weatherService';
import { safeGetString, safeGetJSON, safeSet, safeSetJSON, safeRemove, DATA_CHANGED_EVENT } from './utils/storage';
import { getActiveClub, publishClubData, pullClubDataIfChanged } from './services/huntClubService';
import { Header } from './components/Header';
import { DesktopRail } from './components/DesktopRail';
import { ForecastCards } from './components/ForecastCards';
import { DayDetailView } from './components/DayDetailView';
import { SimpleDashboard } from './components/SimpleDashboard';
import { FloatingHourlySlider } from './components/FloatingHourlySlider';
import { SettingsView } from './components/SettingsView';
import { DetailedPredictionView } from './components/DetailedPredictionView';
import { MapView } from './components/MapView';
import { LogsAndStatsView } from './components/LogsAndStatsView';
import { MeteorologyGuideModal } from './components/MeteorologyGuideModal';
import { PwaInstallModal } from './components/PwaInstallModal';
import { OnboardingModal } from './components/OnboardingModal';
import { TrailCameraView } from './components/TrailCameraView';
import { preloadTrailCamPhotos } from './services/trailCameraService';
import { prefetchMapTiles } from './utils/mapTilePrefetch';
import { RefreshCw, AlertTriangle, CheckCircle, Smartphone, LayoutDashboard, Map, Settings, ScrollText, Camera, ArrowLeft, CalendarDays, MapPin, X, Loader2 } from 'lucide-react';

const FALLBACK_DEFAULT_LOCATION: Location = {
  name: 'Madison',
  admin1: 'Wisconsin',
  country: 'United States',
  latitude: 43.0731,
  longitude: -89.4012,
};

export default function App() {
  // Navigation tab state: 'dashboard', 'settings', 'details', 'map', 'logs', or 'trailcams'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'details' | 'map' | 'logs' | 'trailcams'>('dashboard');

  // Theme state: dark or light
  const [customBackground, setCustomBackground] = useState<string | null>(() => {
    return safeGetString('letshunt_custom_background');
  });
  // Theme: 4-variant × light/dark matrix. Two orthogonal state slots.
  // Persistence: split into two localStorage keys. The old single-string
  // `letshunt_theme` key was used by LetsHunt builds before this split,
  // so both initializers also honour that legacy key — critical for users
  // who had Olive / Hunter / Paperback + dark before the refactor
  // (without this they'd silently land on Standard + Dark).
  const [themeVariant, setThemeVariant] = useState<ThemeVariant>(() => {
    const saved = safeGetString('letshunt_theme_variant') as ThemeVariant | null;
    if (saved && (saved === 'standard' || saved === 'olive' || saved === 'hunting')) {
      return saved;
    }
    // Legacy migration: the original composite key held the variant name
    // directly for non-standard themes.
    const legacy = safeGetString('letshunt_theme');
    if (legacy === 'olive' || legacy === 'hunting') return legacy;
    // New visitors land on the rustic Hunter theme — it reads as a field tool
    // from the first open instead of a generic weather dashboard. Saved
    // Standard/Olive choices above are always respected.
    return 'hunting';
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = safeGetString('letshunt_theme_mode');
    if (saved === 'light' || saved === 'dark') return saved;
    // Legacy migration: pre-split builds only had the composite
    // 'letshunt_theme' key. Treat 'light' as light; everything else
    // (dark / olive / hunting) was rendered dark.
    const legacy = safeGetString('letshunt_theme');
    if (legacy === 'light') return 'light';
    return 'dark';
  });
  // Composite (legacy-shaped) theme string handed to most child components
  // so their inline ternaries `theme === 'olive'` etc. keep working
  // unchanged. New code should write to variant + mode where possible.
  const theme: ThemeVariantMode = combineVariantMode(themeVariant, themeMode);
  const setTheme = (next: ThemeVariantMode) => {
    if (next === 'dark' || next === 'light') {
      setThemeMode(next);
    } else {
      setThemeVariant(next);
    }
  };
  const setVariant = (next: ThemeVariant) => setThemeVariant(next);
  const setMode = (next: ThemeMode) => setThemeMode(next);

  // Default starting location state
  const [defaultLocation, setDefaultLocation] = useState<Location>(() => {
    return safeGetJSON<Location>('letshunt_default_location', FALLBACK_DEFAULT_LOCATION);
  });

  // Active viewed location state
  const [currentLocation, setCurrentLocation] = useState<Location>(() => {
    const fromLocation = safeGetJSON<Location | null>('letshunt_location', null);
    if (fromLocation) return fromLocation;
    const fromDefault = safeGetJSON<Location | null>('letshunt_default_location', null);
    if (fromDefault) return fromDefault;
    return FALLBACK_DEFAULT_LOCATION;
  });

  const [units, setUnits] = useState<UnitSystem>(() => {
    const saved = safeGetString('letshunt_units');
    return (saved as UnitSystem) || 'imperial';
  });

  const [pressureUnit, setPressureUnit] = useState<PressureUnit>(() => {
    const saved = safeGetString('letshunt_pressure_unit');
    return (saved as PressureUnit) || 'inHg';
  });

  const [favorites, setFavorites] = useState<Location[]>(() => {
    return safeGetJSON<Location[]>('letshunt_favorites', [FALLBACK_DEFAULT_LOCATION]);
  });

  const [dailyForecast, setDailyForecast] = useState<DailyForecast[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  // Dashboard-owned subpage state. It deliberately does not become an
  // activeTab/navbar item: browser/mobile navigation continues to read as
  // Dashboard while this view is open.
  const [isFourteenDayView, setIsFourteenDayView] = useState(false);
  // Simple Dashboard is the app default; users who explicitly switched to
  // the Advanced (full) dashboard keep their saved choice.
  const [simpleDashboard, setSimpleDashboard] = useState<boolean>(() => {
    return safeGetString('letshunt_simple_dashboard') !== 'false';
  });
  const [selectedHour, setSelectedHour] = useState<number>(() => new Date().getHours()); // Default to current local time hour
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modals
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);
  const [isLocationPromptOpen, setIsLocationPromptOpen] = useState(false);
  const [locationPermissionState, setLocationPermissionState] = useState<'prompt' | 'denied' | 'unsupported'>('prompt');
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  // First-run onboarding: show for brand-new visitors who have never saved a location.
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => {
    if (safeGetString('letshunt_onboarded')) return false;
    const savedLoc = safeGetString('letshunt_location') || safeGetString('letshunt_default_location');
    return !savedLoc;
  });

  // Timestamp of the last successful forecast refresh (used for the auto-refresh label).
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Toast Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  // Global light-vs-dark: applies to every variant (standard/olive/hunting).
  // Use `theme` (the composite) when branching on a specific variant.
  const isDark = themeMode === 'dark';

  useEffect(() => {
    if (customBackground) {
      // Base64 data URLs of large photos can blow past the 5 MB localStorage
      // quota — SettingsView compresses to 1920px JPEG @ 0.85 quality before
      // calling setCustomBackground, and we swallow any residual failure.
      safeSet('letshunt_custom_background', customBackground);
    } else {
      safeRemove('letshunt_custom_background');
    }
  }, [customBackground]);

  const [customBackgroundOpacity, setCustomBackgroundOpacity] = useState<number>(() => {
    const saved = safeGetString('letshunt_bg_opacity');
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) ? n : 90;
  });

  useEffect(() => {
    safeSet('letshunt_bg_opacity', customBackgroundOpacity.toString());
  }, [customBackgroundOpacity]);

  const [customBackgroundBlur, setCustomBackgroundBlur] = useState<number>(() => {
    const saved = safeGetString('letshunt_bg_blur');
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) ? n : 12;
  });

  useEffect(() => {
    safeSet('letshunt_bg_blur', customBackgroundBlur.toString());
  }, [customBackgroundBlur]);

  // Persistence Effects
  // Apply theme class names to <html>: one variant class (or none for
  // standard) plus the global `dark` modifier when mode === 'dark'. The
  // `:root.dark.olive` etc. selectors in index.css then style each
  // variant × mode combination.
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'olive', 'hunting');
    if (themeVariant === 'olive') document.documentElement.classList.add('olive');
    if (themeVariant === 'hunting') document.documentElement.classList.add('hunting');
    if (themeMode === 'dark') document.documentElement.classList.add('dark');
  }, [themeVariant, themeMode]);

  useEffect(() => {
    safeSet('letshunt_theme_variant', themeVariant);
  }, [themeVariant]);

  useEffect(() => {
    safeSet('letshunt_theme_mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    safeSetJSON('letshunt_default_location', defaultLocation);
  }, [defaultLocation]);

  useEffect(() => {
    safeSetJSON('letshunt_location', currentLocation);
  }, [currentLocation]);

  useEffect(() => {
    safeSet('letshunt_units', units);
  }, [units]);

  useEffect(() => {
    safeSet('letshunt_pressure_unit', pressureUnit);
  }, [pressureUnit]);

  useEffect(() => {
    safeSetJSON('letshunt_favorites', favorites);
  }, [favorites]);

  useEffect(() => {
    safeSet('letshunt_simple_dashboard', simpleDashboard ? 'true' : 'false');
  }, [simpleDashboard]);

  // Listen for PWA beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      showToast('LetsHunt Web App installed to home screen!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const requestLocationAccess = () => {
    if (!navigator.geolocation) {
      setLocationPermissionState('unsupported');
      setIsRequestingLocation(false);
      return;
    }

    setIsRequestingLocation(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setIsRequestingLocation(false);
        setIsLocationPromptOpen(false);
        showToast('Location access enabled. You can use GPS anytime.');
      },
      (error) => {
        setIsRequestingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationPermissionState('denied');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  };

  // Ask once on startup, but only after showing a clear explanation. If the
  // browser already grants location access, no prompt is shown.
  useEffect(() => {
    // Never stack the location prompt on top of first-run onboarding. When
    // onboarding closes this effect re-runs and asks in a calm moment.
    if (isOnboardingOpen) return;

    if (!navigator.geolocation) {
      setLocationPermissionState('unsupported');
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    const checkPermission = async () => {
      try {
        if (!navigator.permissions?.query) {
          if (!cancelled) setIsLocationPromptOpen(true);
          return;
        }

        permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;

        const syncPermissionState = () => {
          const state = permissionStatus?.state;
          if (state === 'granted') {
            setIsLocationPromptOpen(false);
          } else if (state === 'denied') {
            setLocationPermissionState('denied');
            setIsLocationPromptOpen(true);
          } else {
            setLocationPermissionState('prompt');
            setIsLocationPromptOpen(true);
          }
        };

        permissionStatus.onchange = syncPermissionState;
        syncPermissionState();
      } catch {
        // Some browsers expose geolocation but not the Permissions API.
        if (!cancelled) setIsLocationPromptOpen(true);
      }
    };

    void checkPermission();
    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [isOnboardingOpen]);

  // Keep a signed-in device's active HuntClub current without making the
  // user remember to press a manual sync button. Local writes are debounced
  // so a form or photo import produces one upload instead of many.
  const autoSyncTimerRef = useRef<number | null>(null);
  const autoSyncRunningRef = useRef(false);
  const autoSyncQueuedRef = useRef(false);
  const autoPullRunningRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | null = null;
    let initialPullTimer: number | null = null;

    const scheduleAutoSync = () => {
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
      }
      autoSyncTimerRef.current = window.setTimeout(async () => {
        autoSyncTimerRef.current = null;
        if (disposed) return;

        const activeClub = getActiveClub();
        if (!activeClub) return;
        if (autoSyncRunningRef.current) {
          autoSyncQueuedRef.current = true;
          return;
        }

        autoSyncRunningRef.current = true;
        try {
          await publishClubData(activeClub.id);
        } catch (error) {
          // Local data remains safe; the next local change will retry.
          console.warn('[cloud sync] automatic sync failed:', error);
        } finally {
          autoSyncRunningRef.current = false;
          if (autoSyncQueuedRef.current && !disposed) {
            autoSyncQueuedRef.current = false;
            scheduleAutoSync();
          }
        }
      }, 1500);
    };

    const pullLatestClubData = async () => {
      if (disposed || autoPullRunningRef.current || autoSyncRunningRef.current) return;
      const activeClub = getActiveClub();
      if (!activeClub) return;

      autoPullRunningRef.current = true;
      try {
        const result = await pullClubDataIfChanged(activeClub.id);
        if (result.changed && result.summary && !disposed) {
          // MapView and the other feature pages initialize from storage. A
          // reload after a remote bundle arrives is intentional: it makes all
          // mounted pages see pins, paths, polygons, logs, and IndexedDB data
          // together instead of leaving stale React state on screen.
          sessionStorage.setItem('letshunt_backup_imported', JSON.stringify(result.summary));
          window.location.reload();
        } else if (!result.updatedAt && !disposed) {
          // A newly-created club may not have a bundle if its first publish
          // failed. Give the local device one retry without overwriting an
          // existing cloud bundle (which pullLatest handles above).
          scheduleAutoSync();
        }
      } catch (error) {
        console.warn('[cloud sync] automatic load failed:', error);
      } finally {
        autoPullRunningRef.current = false;
      }
    };

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'hidden') return;
      void pullLatestClubData();
    };

    window.addEventListener(DATA_CHANGED_EVENT, scheduleAutoSync);
    window.addEventListener('online', handleVisibilityOrOnline);
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);

    // Pull before attempting to publish startup state. The old eager publish
    // could upload an empty local bundle on a second device and make it look
    // as though the club had no pins at all.
    initialPullTimer = window.setTimeout(() => void pullLatestClubData(), 500);
    pollTimer = window.setInterval(() => void pullLatestClubData(), 15000);

    return () => {
      disposed = true;
      window.removeEventListener(DATA_CHANGED_EVENT, scheduleAutoSync);
      window.removeEventListener('online', handleVisibilityOrOnline);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
      }
      if (initialPullTimer !== null) window.clearTimeout(initialPullTimer);
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, []);

  // After a backup import (which reloads the page), surface a summary toast
  // once the app has re-initialized from the freshly restored localStorage.
  useEffect(() => {
    const raw = sessionStorage.getItem('letshunt_backup_imported');
    if (raw) {
      sessionStorage.removeItem('letshunt_backup_imported');
      try {
        const s = JSON.parse(raw);
        const parts = [
          `${s.logs ?? 0} log${s.logs === 1 ? '' : 's'}`,
          `${s.pins ?? 0} pin${s.pins === 1 ? '' : 's'}`,
          `${s.polygons ?? 0} zone${s.polygons === 1 ? '' : 's'}`,
          `${s.paths ?? 0} path${s.paths === 1 ? '' : 's'}`,
          `${s.photos ?? 0} trail photo${s.photos === 1 ? '' : 's'}`,
        ].filter((p) => !p.startsWith('0 '));
        showToast(`Backup restored — ${parts.join(', ')}`);
      } catch {
        showToast('Backup restored successfully!');
      }
    }
  }, []);

  // Sequence number for in-flight forecast loads. Rapid location / unit
  // changes can fire multiple fetches back-to-back; without this guard the
  // slowest response could land last and replace the latest one with stale
  // data (the classic fetch-race). Each call gets a unique id; only the
  // response whose id still matches the latest one survives.
  const loadSeqRef = useRef(0);
  const lastRefreshedForSeqRef = useRef(0);

  // Fetch forecast whenever location or units change. `silent` skips the full-screen
  // loading spinner and preserves the currently selected day (used by auto-refresh).
  const loadForecast = async (silent = false) => {
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const forecasts = await fetch5DayHuntingForecast(currentLocation, units, pressureUnit);
      if (loadSeqRef.current !== seq) return; // stale, a newer request superseded us
      setDailyForecast(forecasts);
      lastRefreshedForSeqRef.current = seq;
      setLastRefreshed(new Date());
      if (!silent && forecasts.length > 0) {
        setSelectedDate('');
      }
    } catch (err: any) {
      if (loadSeqRef.current !== seq) return; // stale error, ignore
      console.error('Failed to fetch forecast:', err);
      if (!silent) {
        setError('Could not load live weather data. Please check your connection and try again.');
      }
    } finally {
      if (loadSeqRef.current === seq) setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, [currentLocation, units, pressureUnit]);

  // Auto-refresh the forecast every 5 minutes while the app is open. Silent refreshes
  // avoid flashing the loading spinner; errors during a background refresh keep the
  // last good data on screen instead of replacing it with an error banner.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadForecast(true);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [currentLocation, units, pressureUnit]);

  // Pre-fetch map tiles as soon as the default location is known — even
  // before the forecast resolves — so satellite tiles land in the browser
  // HTTP cache while the user is still on other tabs. The prefetcher is
  // restartable per location, so switching the default location warms the
  // new location's tiles too.
  useEffect(() => {
    if (currentLocation) {
      prefetchMapTiles(currentLocation.latitude, currentLocation.longitude);
    }
  }, [currentLocation]);

  // Warm the trail-cam photo index while the browser is idle, so opening the
  // Trail Cams tab paints from memory instead of waiting on a fresh IndexedDB
  // read. Idle scheduling keeps this off the critical path of the first paint.
  useEffect(() => {
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      void preloadTrailCamPhotos().catch(() => { /* tab will retry on open */ });
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(warm, { timeout: 3000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(handle);
      };
    }
    const timer = window.setTimeout(warm, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleToggleTheme = () => {
    // Mobile cycle button only flips the variant — light/dark is handled
    // by the always-visible toggle in Settings, so cycling is one tap per
    // distinct visual identity instead of doubling up on near-twins.
    const cycle: ThemeVariant[] = ['standard', 'olive', 'hunting'];
    const idx = cycle.indexOf(themeVariant);
    const nextVariant = cycle[(idx < 0 ? 0 : idx + 1) % cycle.length];
    setVariant(nextVariant);
    const labelMap: Record<ThemeVariant, string> = {
      standard: 'Standard',
      olive: 'Olive',
      hunting: 'Hunter',
    };
    showToast(`Switched to ${labelMap[nextVariant]} theme`);
  };

  const handleSetDefaultLocation = (loc: Location) => {
    setDefaultLocation(loc);
    showToast(`"${loc.name}" set as default starting location!`);
    
    // Auto add to favorites if not present
    const exists = favorites.some(
      (f) => Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01
    );
    if (!exists) {
      setFavorites([...favorites, loc]);
    }
  };

  const handleToggleFavorite = (loc: Location) => {
    const exists = favorites.some(
      (f) => Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01
    );

    if (exists) {
      setFavorites(favorites.filter((f) => !(Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01)));
      showToast(`Removed "${loc.name}" from saved hunting grounds`);
    } else {
      setFavorites([...favorites, loc]);
      showToast(`Saved "${loc.name}" to favorite hunting grounds!`);
    }
  };

  const handleOnboardingComplete = (loc: Location | null) => {
    setIsOnboardingOpen(false);
    safeSet('letshunt_onboarded', 'true');
    if (loc) {
      setCurrentLocation(loc);
      setDefaultLocation(loc);
      const exists = favorites.some(
        (f) => Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01
      );
      if (!exists) {
        setFavorites([...favorites, loc]);
      }
      showToast(`Welcome! Grounds set to ${loc.name}`);
    } else {
      showToast('Welcome to LetsHunt!');
    }
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      showToast('App installed to your home screen!');
    }
    setDeferredPrompt(null);
  };

  // Reconcile selectedDate with the live forecast. If the user picked a day
  // whose date slipped out of the forecast window (refresh crossing midnight,
  // forecast trimming, etc.), reset to '' so the dashboard transparently falls
  // back to "today" via the dailyForecast[0] fallback below — never silently
  // rebinding without telling anyone.
  useEffect(() => {
    if (!selectedDate || dailyForecast.length === 0) return;
    const stillPresent = dailyForecast.some((d) => d.date === selectedDate);
    if (!stillPresent) {
      setSelectedDate('');
    }
  }, [dailyForecast, selectedDate]);

  const activeDay = dailyForecast.find((d) => d.date === selectedDate) || dailyForecast[0];

  // The extended outlook is a dashboard-owned subpage. Reset the document
  // scroll after it mounts so opening it always starts at its own heading,
  // rather than inheriting the dashboard's previous scroll position.
  useEffect(() => {
    if (activeTab !== 'dashboard' || !isFourteenDayView) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeTab, isFourteenDayView]);

  return (
    <div
      className={`font-sans antialiased flex flex-col transition-colors duration-200 ${
        activeTab === 'map'
          ? 'h-screen max-h-screen overflow-hidden'
          : 'min-h-screen pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] sm:pb-0'
      } ${customBackground ? 'has-custom-background' : ''} ${
        themeMode === 'dark'
          ? themeVariant === 'hunting'
            ? 'bg-[#201c17] text-[#e8dfd2] selection:bg-[#b66a38] selection:text-white'
            : themeVariant === 'olive'
            ? 'bg-[#1c2614] text-[#dde6cb] selection:bg-[#556b2f] selection:text-white'
            : 'bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-slate-950'
          : themeVariant === 'hunting'
          ? 'bg-[#f5f0e8] text-[#2c1810] selection:bg-[#c85a17] selection:text-white'
          : themeVariant === 'olive'
          ? 'bg-[#efebd9] text-[#1e2e1b] selection:bg-[#556b2f] selection:text-white'
          : 'bg-slate-100 text-slate-900 selection:bg-emerald-600 selection:text-white'
      }`}
      style={{
        '--card-opacity': `${customBackgroundOpacity / 100}`,
        '--card-blur': `${customBackgroundBlur}px`,
        ...(customBackground ? {
          backgroundImage: `url(${customBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        } : {})
      } as React.CSSProperties}
    >
      <style>{`
        :root {
          --card-opacity: ${customBackgroundOpacity / 100};
          --card-blur: ${customBackgroundBlur}px;
          --slider-opacity: ${Math.min(0.98, (customBackgroundOpacity / 100) + 0.15)};
        }
        .backdrop-blur-md,
        .backdrop-blur-xl,
        .backdrop-blur-sm,
        .backdrop-blur-xs,
        .backdrop-blur,
        [class*="backdrop-blur"] {
          backdrop-filter: blur(${customBackgroundBlur}px) !important;
          -webkit-backdrop-filter: blur(${customBackgroundBlur}px) !important;
        }
      `}</style>

      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-[56px] sm:bottom-5 right-5 z-50 bg-emerald-500 text-slate-950 font-extrabold text-xs px-4 py-3 rounded-2xl shadow-2xl border border-emerald-300/60 flex items-center gap-2" style={{animation: 'toastIn 0.3s ease-out'}}>
          <CheckCircle className="w-4 h-4 fill-slate-950 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop left navigation rail. Only rendered into view at >=1024px
          (see `.desktop-rail` in index.css); below that it is display:none
          and the mobile bottom nav + header tabs handle navigation exactly
          as before. #root reserves --rail-w of left padding at that width so
          this fixed rail never overlaps the content column. */}
      <DesktopRail
        activeTab={activeTab}
        theme={theme}
        isDark={isDark}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // Returning to Dashboard from any route always lands on the main
          // dashboard, not the hidden extended subpage. Mirrors the header
          // and bottom-nav handlers.
          setIsFourteenDayView(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Top Header Navigation */}
      <Header
        currentLocation={currentLocation}
        onSelectLocation={(loc) => setCurrentLocation(loc)}
        defaultLocation={defaultLocation}
        onSetDefaultLocation={handleSetDefaultLocation}
        theme={theme}
        isDark={isDark}
        hasCustomBackground={!!customBackground}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenPwaModal={() => setIsPwaModalOpen(true)}
        activeTab={activeTab}
        onToggleColorMode={() => {
          const nextMode = isDark ? 'light' : 'dark';
          setMode(nextMode);
          showToast(nextMode === 'dark' ? 'Dark mode on' : 'Light mode on');
        }}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // Returning to Dashboard from any route always lands on the main
          // dashboard, not the hidden extended subpage.
          setIsFourteenDayView(false);
        }}
      />

      {/* Main App Container */}
      <main
        className={`w-full mx-auto ${
          activeTab === 'map'
            ? 'p-0 h-[calc(100vh-64px-52px)] sm:h-[calc(100vh-64px)] overflow-hidden relative flex-1'
            : 'flex-1 max-w-7xl xl:max-w-[1500px] 2xl:max-w-[1700px] px-3 sm:px-4 lg:px-6 py-4 sm:py-6 pb-20 sm:pb-8 space-y-4 sm:space-y-6'
        }`}
      >
        {activeTab === 'settings' ? (
          <SettingsView
            currentLocation={currentLocation}
            onSelectLocation={(loc) => setCurrentLocation(loc)}
            defaultLocation={defaultLocation}
            onSetDefaultLocation={handleSetDefaultLocation}
            units={units}
            onToggleUnits={() => setUnits(units === 'imperial' ? 'metric' : 'imperial')}
            setUnits={setUnits}
            pressureUnit={pressureUnit}
            setPressureUnit={setPressureUnit}
            simpleDashboard={simpleDashboard}
            onToggleSimpleDashboard={(v) => {
              setSimpleDashboard(v);
              showToast(v ? 'Simple Dashboard enabled' : 'Advanced Dashboard enabled');
            }}
            theme={theme}
            isDark={isDark}
            themeVariant={themeVariant}
            themeMode={themeMode}
            setVariant={setVariant}
            setMode={setMode}
        hasCustomBackground={!!customBackground}
            onToggleTheme={handleToggleTheme}
            setTheme={setTheme}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenGuide={() => setIsGuideOpen(true)}
            onOpenPwaModal={() => setIsPwaModalOpen(true)}
            showToast={showToast}
            onSwitchToDashboard={() => setActiveTab('dashboard')}
            customBackground={customBackground}
            onSetCustomBackground={setCustomBackground}
            customBackgroundOpacity={customBackgroundOpacity}
            onSetCustomBackgroundOpacity={setCustomBackgroundOpacity}
            customBackgroundBlur={customBackgroundBlur}
            onSetCustomBackgroundBlur={setCustomBackgroundBlur}
          />
        ) : activeTab === 'map' ? (
          <MapView
            location={currentLocation}
            units={units}
            pressureUnit={pressureUnit}
            theme={theme}
            isDark={isDark}
        hasCustomBackground={!!customBackground}
            dailyForecast={dailyForecast}
            onSelectLocation={(loc) => setCurrentLocation(loc)}
            selectedHour={selectedHour}
            onSelectHour={setSelectedHour}
          />
        ) : activeTab === 'logs' ? (
          <LogsAndStatsView
            theme={theme}
            isDark={isDark}
            units={units}
            showToast={showToast}
            hasCustomBackground={!!customBackground}
            onNavigateToMap={() => setActiveTab('map')}
          />
        ) : activeTab === 'trailcams' ? (
          <TrailCameraView
            theme={theme}
            isDark={isDark}
            currentLocation={currentLocation}
            units={units}
            pressureUnit={pressureUnit}
            showToast={showToast}
          />
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="relative w-16 h-16">
              <div className={`absolute inset-0 rounded-full border-4 ${isDark ? 'border-slate-800' : 'border-slate-300'}`} />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <div>
              <h3 className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Checking today's hunting weather...
              </h3>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Checking the barometer, temperature changes, wind, and moon times for {currentLocation.name}.
              </p>
            </div>
          </div>
        ) : error ? (
          <div
            className={`border rounded-2xl p-6 text-center max-w-md mx-auto my-12 space-y-4 shadow-xl ${
              isDark ? 'bg-rose-950/50 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-base font-bold">Forecast Load Failure</h3>
            <p className="text-xs">{error}</p>
            <button
              onClick={loadForecast}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-colors inline-flex items-center gap-2 shadow-md"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && isFourteenDayView ? (
              /* Dashboard-owned 14-day subpage. It deliberately lives inside the
                 dashboard branch, so it gets no navbar slot of its own. */
              <div className="w-full space-y-4 sm:space-y-6">
                <div className={`rounded-2xl border px-4 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-3 shadow-lg backdrop-blur-xl ${
                  isDark
                    ? 'bg-slate-900/[var(--card-opacity)] border-slate-700 text-slate-100'
                    : theme === 'hunting'
                    ? 'bg-[#eee6d6]/[var(--card-opacity)] border-[#d4c4a8] text-[#2a1b0e]'
                    : theme === 'olive'
                    ? 'bg-[#f7f5ed]/[var(--card-opacity)] border-[#d8d2c0] text-[#1e2e1b]'
                    : 'bg-white/[var(--card-opacity)] border-slate-200 text-slate-900'
                }`}>
                  <div className="min-w-0">
                    <div className={`text-xs sm:text-[13px] font-black uppercase tracking-[0.16em] ${isDark ? 'text-emerald-400' : theme === 'hunting' ? 'text-[#c85a17]' : theme === 'olive' ? 'text-[#556b2f]' : 'text-emerald-700'}`}>
                      Dashboard · 14-Day Look Ahead
                    </div>
                    <h1 className="text-lg sm:text-2xl font-black flex items-center gap-2 mt-0.5">
                      <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                      14-Day Deer Forecast
                    </h1>
                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'opacity-70'}`}>
                      A bigger-picture look at {currentLocation.name}; later days are a rough guide.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFourteenDayView(false);
                      setSelectedDate('');
                    }}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer hover:scale-[1.02] focus:outline-none focus-visible:ring-2 ${
                      isDark
                        ? 'border-slate-600 text-slate-300 hover:bg-slate-800 focus-visible:ring-emerald-400'
                        : theme === 'hunting'
                        ? 'border-[#c85a17]/40 text-[#7a3208] hover:bg-[#c85a17]/10 focus-visible:ring-[#c85a17]'
                        : theme === 'olive'
                        ? 'border-[#556b2f]/40 text-[#3d4f21] hover:bg-[#556b2f]/10 focus-visible:ring-[#556b2f]'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-100 focus-visible:ring-emerald-600'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Back to dashboard</span>
                    <span className="sm:hidden">Back</span>
                  </button>
                </div>

                <ForecastCards
                  daily={dailyForecast}
                  dailyAll={dailyForecast}
                  isExtendedView
                  selectedDate={selectedDate}
                  onSelectDate={(date) => setSelectedDate(date)}
                  selectedHour={selectedHour}
                  units={units}
                  pressureUnit={pressureUnit}
                  theme={theme}
                  isDark={isDark}
                  hasCustomBackground={!!customBackground}
                  location={currentLocation}
                  lastRefreshed={lastRefreshed}
                  onOpenDetails={(date) => {
                    setSelectedDate(date);
                    setActiveTab('details');
                    setIsFourteenDayView(false);
                  }}
                />
              </div>
            ) : activeTab === 'details' && activeDay ? (
              /* Detailed Prediction Full View OR Main Dashboard Conditions */
              <DetailedPredictionView
                day={activeDay}
                location={currentLocation}
                units={units}
                pressureUnit={pressureUnit}
                theme={theme}
                isDark={isDark}
        hasCustomBackground={!!customBackground}
                selectedHour={selectedHour}
                onSelectHour={setSelectedHour}
                onBack={() => setActiveTab('dashboard')}
              />
            ) : activeDay && simpleDashboard && activeTab === 'dashboard' ? (
              <SimpleDashboard
                daily={dailyForecast}
                location={currentLocation}
                units={units}
                pressureUnit={pressureUnit}
                theme={theme}
                isDark={isDark}
                hasCustomBackground={!!customBackground}
                lastRefreshed={lastRefreshed}
                onSwitchToFullDashboard={() => setSimpleDashboard(false)}
                onOpenFourteenDay={() => {
                  setIsFourteenDayView(true);
                  setSelectedDate('');
                }}
              />
            ) : (
              activeDay && (
                <DayDetailView
                  day={activeDay}
                  location={currentLocation}
                  units={units}
                  pressureUnit={pressureUnit}
                  theme={theme}
                  isDark={isDark}
        hasCustomBackground={!!customBackground}
                  selectedHour={selectedHour}
                  onSelectHour={setSelectedHour}
                  isToday={activeDay?.date === dailyForecast[0]?.date}
                  onResetToToday={() => {
                    if (dailyForecast[0]) {
                      setSelectedDate(dailyForecast[0].date);
                    }
                  }}
                  onSelectLocation={setCurrentLocation}
                  forecastCards={
                    <ForecastCards
                      daily={dailyForecast.slice(0, 7)}
                      dailyAll={dailyForecast}
                      onOpenFourteenDay={() => setIsFourteenDayView(true)}
                      selectedDate={selectedDate}
                      onSelectDate={(date) => setSelectedDate(date)}
                      selectedHour={selectedHour}
                      units={units}
                      pressureUnit={pressureUnit}
                      theme={theme}
                      isDark={isDark}
        hasCustomBackground={!!customBackground}
                      location={currentLocation}
                      lastRefreshed={lastRefreshed}
                      onOpenDetails={(date) => {
                        setSelectedDate(date);
                        setActiveTab('details');
                      }}
                    />
                  }
                />
              )
            )}
          </>
        )}

        {/* Floating Ultra-Compact 24h Hourly Time Slider (Active on Dashboard and Details tabs) */}
        {!loading && !error && activeDay && (activeTab === 'details' || (activeTab === 'dashboard' && !simpleDashboard)) && (
          <FloatingHourlySlider
            selectedHour={selectedHour}
            onSelectHour={setSelectedHour}
            onResetToToday={() => {
              if (dailyForecast[0]) {
                setSelectedDate(dailyForecast[0].date);
              }
            }}
            hourly={activeDay.hourly}
            theme={theme}
            isDark={isDark}
            hasCustomBackground={!!customBackground}
          />
        )}
      </main>

      {/* Footer (Hidden on Map Plotter tab for true full-screen map) */}
      {activeTab !== 'map' && (
        <footer
          className={`border-t py-3 sm:py-4 px-4 sm:px-6 text-center text-xs transition-colors mt-auto backdrop-blur-sm ${
            isDark
              ? 'bg-slate-950/[var(--card-opacity)] border-slate-800/50 text-slate-500'
              : theme === 'hunting'
              ? 'bg-[#ede5d5]/[var(--card-opacity)] border-[#d4c5a9]/50 text-[#8b7355]'
              : (theme === 'olive')
              ? 'bg-[#e5e1d0]/[var(--card-opacity)] border-[#d4cebc]/50 text-[#6b7a45]'
              : 'bg-white/[var(--card-opacity)] border-slate-200/50 text-slate-500'
          }`}
        >
          <div className="max-w-7xl xl:max-w-[1500px] 2xl:max-w-[1700px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`font-black ${isDark ? 'text-slate-200' : theme === 'hunting' ? 'text-[#2c1810]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'}`}>LetsHunt</span>
              <span>• Deer Forecast Prediction Engine</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPwaModalOpen(true)}
                className="min-h-11 text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-xs flex items-center gap-1"
              >
                <Smartphone className="w-3.5 h-3.5" /> Turn Into Web App
              </button>
              <span className="text-slate-400">•</span>
              <span className="text-xs">
                Live weather by <span className={`font-semibold ${isDark ? 'text-slate-300' : theme === 'hunting' ? 'text-[#5c4a32]' : theme === 'olive' ? 'text-[#2e4028]' : 'text-slate-700'}`}>Open-Meteo API</span>
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        data-bottom-nav="true"
        className={`safe-bottom sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t flex items-stretch gap-0 px-1.5 py-1 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-colors duration-200 ${
          isDark
            ? themeVariant === 'hunting'
              ? 'bg-slate-950 border-slate-800/60 text-slate-100'
              : themeVariant === 'olive'
              ? 'bg-[#1c2614] border-[#2c3d1f] text-[#dde6cb]'
              : 'bg-slate-950 border-slate-800/60 text-slate-100'
            : themeVariant === 'hunting'
            ? 'bg-[#f5f0e8] border-[#d4c5a9]/70 text-[#2a1d10]'
            : themeVariant === 'olive'
            ? 'bg-[#f7f5ed] border-[#d8d2c0]/70 text-[#1e2e1b]'
            : 'bg-white border-slate-200/70 text-slate-900'
        }`}
      >
        <button
          onClick={() => {
            setActiveTab('dashboard');
            setIsFourteenDayView(false);
            setSelectedDate('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-xl transition-all duration-200 cursor-pointer relative ${
            activeTab === 'dashboard' || activeTab === 'details'
              ? isDark
                ? 'text-emerald-400 bg-emerald-400/10 scale-105'
                : (theme === 'olive' || theme === 'hunting')
                ? 'text-[#556b2f] bg-[#556b2f]/10 scale-105'
                : 'text-emerald-600 bg-emerald-50 scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 font-medium'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-[10px] tracking-wide uppercase whitespace-nowrap">Dashboard</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('map');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-xl transition-all duration-200 cursor-pointer relative ${
            activeTab === 'map'
              ? isDark
                ? 'text-emerald-400 bg-emerald-400/10 scale-105'
                : (theme === 'olive' || theme === 'hunting')
                ? 'text-[#556b2f] bg-[#556b2f]/10 scale-105'
                : 'text-emerald-600 bg-emerald-50 scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 font-medium'
          }`}
        >
          <Map className="w-4 h-4" />
          <span className="text-[10px] tracking-wide uppercase whitespace-nowrap">Map</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('logs');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-xl transition-all duration-200 cursor-pointer relative ${
            activeTab === 'logs'
              ? isDark
                ? 'text-amber-400 bg-amber-400/10 scale-105'
                : (theme === 'olive' || theme === 'hunting')
                ? 'text-amber-600 bg-amber-100/60 scale-105'
                : 'text-amber-600 bg-amber-50 scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 font-medium'
          }`}
        >
          <ScrollText className="w-4 h-4" />
          <span className="text-[10px] tracking-wide uppercase whitespace-nowrap">Logs</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('trailcams');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-xl transition-all duration-200 cursor-pointer relative ${
            activeTab === 'trailcams'
              ? isDark
                ? 'text-sky-400 bg-sky-400/10 scale-105'
                : (theme === 'olive' || theme === 'hunting')
                ? 'text-sky-600 bg-sky-100/60 scale-105'
                : 'text-sky-600 bg-sky-50 scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 font-medium'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span className="text-[10px] tracking-wide uppercase whitespace-nowrap">Trail Cams</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('settings');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-w-0 rounded-xl transition-all duration-200 cursor-pointer relative ${
            activeTab === 'settings'
              ? isDark
                ? 'text-slate-200 bg-slate-700/40 scale-105'
                : (theme === 'olive' || theme === 'hunting')
                ? 'text-[#3d4f21] bg-[#e0dcc8]/70 scale-105'
                : 'text-slate-800 bg-slate-100 scale-105'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 font-medium'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[10px] tracking-wide uppercase whitespace-nowrap">Settings</span>
        </button>
      </nav>

      {/* Location permission prompt */}
      {isLocationPromptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-3xl border shadow-2xl p-6 ${
            isDark
              ? 'bg-slate-900 border-slate-700 text-white'
              : theme === 'hunting'
              ? 'bg-[#f4eee1] border-[#d4c4a8] text-[#2a1b0e]'
              : theme === 'olive'
              ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
              : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black">Allow location access?</h2>
                <p className={`text-xs leading-relaxed mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  LetsHunt uses your location for GPS hunting grounds and map tools. It stays on this device unless an active HuntClub is syncing your app data.
                </p>
              </div>
            </div>

            {locationPermissionState === 'denied' && (
              <div className={`mt-4 rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed ${
                isDark ? 'bg-amber-950/40 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                Location access is blocked. Allow it in your browser's site settings, then try the GPS button again.
              </div>
            )}

            {locationPermissionState === 'unsupported' && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-rose-700">
                This browser does not support location access. You can still search for a hunting ground manually.
              </div>
            )}

            <div className="flex gap-2 mt-5">
              {locationPermissionState !== 'unsupported' && (
                <button
                  onClick={requestLocationAccess}
                  disabled={isRequestingLocation}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isRequestingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  {isRequestingLocation ? 'Checking...' : locationPermissionState === 'denied' ? 'Try Again' : 'Allow Location'}
                </button>
              )}
              <button
                onClick={() => setIsLocationPromptOpen(false)}
                className={`px-4 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                  isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <X className="w-3.5 h-3.5" /> Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* First-run onboarding modal (new visitors only) */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        theme={theme}
        isDark={isDark}
        onComplete={handleOnboardingComplete}
      />

      {/* Guide Modal */}
      <MeteorologyGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} theme={theme} isDark={isDark}
        hasCustomBackground={!!customBackground} />

      {/* PWA / Web App Installation Instructions Modal */}
      <PwaInstallModal
        isOpen={isPwaModalOpen}
        onClose={() => setIsPwaModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onInstallClick={handleInstallPwa}
        isInstalled={isInstalled}
        hasCustomBackground={!!customBackground}
      />
    </div>
  );
}
