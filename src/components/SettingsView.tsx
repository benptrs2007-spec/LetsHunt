import React, { useState, useEffect, useRef } from 'react';
import { Location, UnitSystem, ThemeMode, ThemeVariant, ThemeVariantMode, PressureUnit } from '../types';
import { searchLocations } from '../services/weatherService';
import {
  Settings,
  MapPin,
  Home,
  Star,
  Trash2,
  Plus,
  Search,
  Compass,
  Thermometer,
  Moon,
  Sun,
  BookOpen,
  Smartphone,
  Check,
  ShieldCheck,
  Globe,
  Radio,
  Gauge,
  Image as ImageIcon,
  Database,
  Download,
  Upload,
  Loader2,
  Trees,
  LayoutDashboard,
} from 'lucide-react';
import { DeerIcon } from './DeerIcon';
import { exportBackupData, importBackupData, downloadJson, defaultBackupFilename } from '../services/dataBackupService';
import { PaperTexture } from './PaperTexture';
import { AccountSettingsCard } from './AccountSettingsCard';

// Downscale a user-provided background photo before persisting as a base64
// data URL. The raw 4-MP+ photo would otherwise blow past the ~5 MB
// localStorage quota on save. Returns a Promise resolving to a JPEG
// data URL — iteratively halving until it fits under `hardMaxBytes`. Rejects
// only if the source image itself can't be decoded.
async function compressImage(file: File, hardMaxBytes = 4 * 1024 * 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = url;
    });
    // Cover all reasonable source sizes: 4 K screenshot → phone photo → panorama.
    const attempts: Array<[number, number]> = [
      [1920, 0.85],
      [1280, 0.8],
      [960, 0.75],
      [720, 0.7],
    ];
    let bestDataUrl = '';
    for (const [maxDim, quality] of attempts) {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      bestDataUrl = dataUrl;
      // Base64 length × 0.75 approximates the underlying JPEG byte count.
      if (dataUrl.length * 0.75 < hardMaxBytes) return dataUrl;
    }
    // Even the smallest attempt didn't fit; surface the best we have.
    // Caller's `safeSet` will silently drop it if it still exceeds the quota.
    return bestDataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface SettingsViewProps {
  currentLocation: Location;
  onSelectLocation: (loc: Location) => void;
  defaultLocation: Location;
  onSetDefaultLocation: (loc: Location) => void;
  units: UnitSystem;
  onToggleUnits: () => void;
  setUnits: (u: UnitSystem) => void;
  pressureUnit: PressureUnit;
  setPressureUnit: (p: PressureUnit) => void;
  // Composite theme (variant × mode). Use isDark = ThemeMode-based check
  // elsewhere if you only care about light/dark; `theme` picks the variant.
  theme: ThemeVariantMode;
  hasCustomBackground?: boolean;
  onToggleTheme: () => void;
  setTheme: (t: ThemeVariantMode) => void;
  // Split state setters (preferred for new code):
  themeVariant: ThemeVariant;
  themeMode: ThemeMode;
  setVariant: (v: ThemeVariant) => void;
  setMode: (m: ThemeMode) => void;
  favorites: Location[];
  onToggleFavorite: (loc: Location) => void;
  onOpenGuide: () => void;
  onOpenPwaModal: () => void;
  showToast: (msg: string) => void;
  onSwitchToDashboard: () => void;
  customBackground: string | null;
  onSetCustomBackground: (url: string | null) => void;
  customBackgroundOpacity?: number;
  onSetCustomBackgroundOpacity?: (opacity: number) => void;
  customBackgroundBlur?: number;
  onSetCustomBackgroundBlur?: (blur: number) => void;
  simpleDashboard?: boolean;
  onToggleSimpleDashboard?: (v: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentLocation,
  onSelectLocation,
  defaultLocation,
  onSetDefaultLocation,
  units,
  setUnits,
  pressureUnit,
  setPressureUnit,
  theme,
  hasCustomBackground = false,
  setTheme,
  themeVariant,
  themeMode,
  setVariant,
  setMode,
  favorites,
  onToggleFavorite,
  onOpenGuide,
  onOpenPwaModal,
  showToast,
  onSwitchToDashboard,
  customBackground,
  onSetCustomBackground,
  customBackgroundOpacity = 90,
  onSetCustomBackgroundOpacity,
  customBackgroundBlur = 12,
  onSetCustomBackgroundBlur,
  simpleDashboard = false,
  onToggleSimpleDashboard,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  // isDark comes from the orthogonal themeMode prop (not the composite
  // `theme` string, which collapses to the variant name for olive/hunting/
  // (standard / olive / hunting) so the whole Settings view flips correctly in dark mode.
  const isDark = themeMode === 'dark';
  const isHunterDark = themeVariant === 'hunting' && isDark;

  // Search debounced
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
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
  }, [searchQuery]);

  // Click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: 'My GPS Location',
          admin1: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          country: 'Current Position',
          latitude,
          longitude,
        };
        onSelectLocation(gpsLocation);
        setIsLocating(false);
        showToast('Updated location using GPS coordinates');
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
        showToast('Could not access GPS position. Please select manually.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const renderToggle = (checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked ? 'bg-emerald-500' : disabled ? (isDark ? 'bg-slate-800' : 'bg-slate-200') : isDark ? 'bg-slate-700' : 'bg-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { json, summary } = await exportBackupData();
      downloadJson(json, defaultBackupFilename());
      const parts = [
        `${summary.logs} log${summary.logs === 1 ? '' : 's'}`,
        `${summary.pins} pin${summary.pins === 1 ? '' : 's'}`,
        `${summary.polygons} zone${summary.polygons === 1 ? '' : 's'}`,
        `${summary.paths} path${summary.paths === 1 ? '' : 's'}`,
        `${summary.photos} trail photo${summary.photos === 1 ? '' : 's'}`,
      ].filter((s) => !s.startsWith('0 '));
      showToast(`Backup downloaded — ${parts.join(', ')}`);
    } catch (err: any) {
      console.error('Export failed:', err);
      showToast('Export failed — please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File | null | undefined) => {
    if (!file) return;
    const ok = window.confirm(
      'Restore this backup?\n\nThis overwrites current settings, harvest logs & map data, and merges trail cam photos (matched by ID). The app will reload afterwards.'
    );
    if (!ok) {
      if (importInputRef.current) importInputRef.current.value = '';
      return;
    }
    setIsImporting(true);
    try {
      const text = await file.text();
      const summary = await importBackupData(text);
      // Signal App to show a toast after the reload (so all stores re-read fresh).
      sessionStorage.setItem('letshunt_backup_imported', JSON.stringify(summary));
      window.location.reload();
    } catch (err: any) {
      console.error('Import failed:', err);
      setIsImporting(false);
      showToast(`Import failed — ${err?.message || 'invalid file'}`);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };


  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Top Banner Header */}
      <div
        className={`relative overflow-hidden p-5 sm:p-6 rounded-3xl border shadow-lg ${
          isDark
            ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
            : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'
        }`}
      >
        {/* Wash gradient overlay so the settings panel still feels layered. */}
        <PaperTexture
          variant="wash"
          opacity={0.06}
          blendMode="soft-light"
          tone={isDark ? '#94a3b8' : '#94a3b8'}
          className="absolute inset-x-0 top-0 h-12"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0 ${
                'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500'
              }`}
            >
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1
                className={`text-xl sm:text-2xl font-black tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                App Settings
              </h1>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Manage hunting grounds, default location, unit preferences, and forecast preferences.
              </p>
            </div>
          </div>

          <button
            onClick={onSwitchToDashboard}
            className={`min-h-11 px-4 py-2.5 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 self-start sm:self-auto ${
              'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <span>Back to Dashboard</span>
          </button>
            </div>
      </div>

      {/* Account & HuntClub (Supabase + Backblaze B2) */}
      <AccountSettingsCard
        theme={theme}
        isDark={isDark}
        showToast={showToast}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Location & Hunting Grounds Management */}
        <div className={`p-5 sm:p-6 rounded-3xl border space-y-5 ${
          isDark
            ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
              : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
            <MapPin className="w-5 h-5 text-emerald-500" />
            <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Hunting Grounds & Default Location
            </h2>
          </div>

          {/* Active & Default Location Card */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDark
              ? 'bg-slate-950/60 border-slate-800'
                : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-emerald-500" />
              Default Starting Ground
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {defaultLocation.name}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {defaultLocation.admin1 ? `${defaultLocation.admin1}, ` : ''}{defaultLocation.country}
                </div>
              </div>

              <span className={`px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-xs font-black uppercase tracking-wider ${isHunterDark ? 'text-white' : 'text-emerald-400'}`}>
                Default
              </span>
            </div>
          </div>

          {/* Add / Search New Location */}
          <div className="space-y-2">
            <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Search & Add New Hunting Location
            </label>

            <div className="relative" ref={searchContainerRef}>
              <div
                className={`flex items-center border rounded-xl px-3.5 py-2.5 transition-all ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 focus-within:border-emerald-500'
                    : 'bg-slate-100 border-slate-200 focus-within:border-emerald-600'
                }`}
              >
                <Search className={`w-4 h-4 mr-2 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type city, county, or zip code..."
                  className={`w-full bg-transparent text-xs focus:outline-none ${
                    isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isSearching ? (
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-2 flex-shrink-0" />
                ) : (
                  <button
                    onClick={handleGetCurrentLocation}
                    disabled={isLocating}
                    className={`min-h-11 ml-1 px-2.5 py-2.5 rounded-lg flex items-center gap-1 text-xs font-bold uppercase transition-colors ${
                      isDark
                        ? `bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 ${isHunterDark ? 'text-white' : 'text-emerald-400'}`
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                    }`}
                  >
                    <Compass className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-emerald-500' : ''}`} />
                    <span>GPS</span>
                  </button>
                )}
              </div>

              {/* Search Dropdown Results */}
              {showDropdown && searchResults.length > 0 && (
                <div
                  className={`absolute top-full left-0 right-0 mt-1.5 border rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y ${
                    isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-700 divide-slate-800 text-slate-200' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 divide-slate-100 text-slate-800'
                  }`}
                >
                  {searchResults.map((loc, idx) => (
                    <div
                      key={idx}
                      className={`px-3.5 py-2.5 transition-colors flex items-center justify-between text-xs ${
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold">{loc.name}</div>
                        <div className="text-xs text-slate-400">
                          {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            onSelectLocation(loc);
                            setShowDropdown(false);
                            setSearchQuery('');
                            showToast(`Selected ${loc.name}`);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-wider"
                        >
                          Select
                        </button>
                        <button
                          onClick={() => {
                            onToggleFavorite(loc);
                            setShowDropdown(false);
                            setSearchQuery('');
                          }}
                          className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                          title="Save to Favorites"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Saved Grounds List */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Saved Hunting Grounds ({favorites.length})</span>
            </div>

            {favorites.length === 0 ? (
              <div className="py-3">
                <p className="text-xs text-slate-500">No saved hunting grounds yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Search above, then tap <strong>Select</strong> to set an active ground or the{' '}
                  <Star className="w-3 h-3 inline text-amber-400 -mt-0.5" /> star to save it here for quick switching.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {favorites.map((fav, i) => {
                  const isCurrentActive =
                    Math.abs(fav.latitude - currentLocation.latitude) < 0.01 &&
                    Math.abs(fav.longitude - currentLocation.longitude) < 0.01;

                  const isCurrentDefault =
                    Math.abs(fav.latitude - defaultLocation.latitude) < 0.01 &&
                    Math.abs(fav.longitude - defaultLocation.longitude) < 0.01;

                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                        isCurrentActive
                          ? isDark
                            ? 'bg-emerald-950/40 border-emerald-500/40'
                            : 'bg-emerald-50 border-emerald-300'
                          : isDark
                          ? 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-extrabold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {fav.name}
                          </span>
                          {isCurrentActive && (
                            <span className={`px-1.5 py-0.2 bg-emerald-500 rounded font-black text-[11px] uppercase ${isHunterDark ? 'text-white' : 'text-slate-950'}`}>
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {fav.admin1 ? `${fav.admin1}, ` : ''}{fav.country}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Select as active */}
                        <button
                          onClick={() => {
                            onSelectLocation(fav);
                            showToast(`Switched active location to "${fav.name}"`);
                          }}
                          className={`min-h-11 px-2.5 py-2.5 rounded-lg text-xs font-extrabold uppercase transition-all ${
                            isCurrentActive
                              ? `bg-emerald-500 ${isHunterDark ? 'text-white' : 'text-slate-950'}`
                              : isDark
                              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                              : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                          }`}
                        >
                          {isCurrentActive ? 'Active' : 'Load'}
                        </button>

                        {/* Set as Default */}
                        <button
                          onClick={() => onSetDefaultLocation(fav)}
                          className={`w-11 h-11 p-0 rounded-lg border flex items-center justify-center transition-all ${
                            isCurrentDefault
                              ? `bg-emerald-500/20 border-emerald-500/40 ${isHunterDark ? 'text-white' : 'text-emerald-400'}`
                              : isDark
                              ? 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
                              : 'bg-slate-100 text-slate-500 hover:text-slate-900 border-slate-200'
                          }`}
                          title={isCurrentDefault ? 'Default Starting Location' : 'Set as Default'}
                        >
                          <Home className={`w-3.5 h-3.5 ${isCurrentDefault ? 'fill-current' : ''}`} />
                        </button>

                        {/* Delete from Saved */}
                        <button
                          onClick={() => onToggleFavorite(fav)}
                          className={`w-11 h-11 p-0 rounded-lg border flex items-center justify-center transition-all ${
                            isDark
                              ? 'bg-slate-900 text-rose-400 hover:bg-rose-950/50 border-slate-800'
                              : 'bg-slate-100 text-rose-600 hover:bg-rose-50 border-slate-200'
                          }`}
                          title="Remove from saved grounds"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Preferences & Units */}
        <div className="space-y-6">

          {/* Unit System Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Thermometer className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Unit System
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setUnits('imperial');
                  showToast('Switched to Imperial (°F, mph)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  units === 'imperial'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">Imperial</div>
                  <div className="text-xs text-slate-500 mt-0.5">°F • mph</div>
                </div>
                {units === 'imperial' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>

              <button
                onClick={() => {
                  setUnits('metric');
                  showToast('Switched to Metric (°C, km/h)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  units === 'metric'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">Metric</div>
                  <div className="text-xs text-slate-500 mt-0.5">°C • km/h</div>
                </div>
                {units === 'metric' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>
            </div>
          </div>

          {/* Barometer Unit Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Gauge className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Barometer Unit
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setPressureUnit('inHg');
                  showToast('Switched pressure unit to Inches of Mercury (inHg)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  pressureUnit === 'inHg'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">inHg</div>
                  <div className="text-xs text-slate-500 mt-0.5">Inches of Mercury</div>
                </div>
                {pressureUnit === 'inHg' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>

              <button
                onClick={() => {
                  setPressureUnit('hPa');
                  showToast('Switched pressure unit to Hectopascals (hPa)');
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                  pressureUnit === 'hPa'
                    ? isDark
                      ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                      : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                    : isDark
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <div>
                  <div className="font-black text-sm">hPa</div>
                  <div className="text-xs text-slate-500 mt-0.5">Hectopascals / Millibars</div>
                </div>
                {pressureUnit === 'hPa' && <Check className="w-4 h-4 text-emerald-500" />}
              </button>
            </div>
          </div>

          {/* Appearance & Dashboard Card — one compact place for the two
              display choices hunters actually change in the field. */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Sun className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Appearance &amp; Dashboard
              </h2>
            </div>

            {/* Dashboard style, folded into Appearance so Settings stops
                reading like a preference dump. */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  !simpleDashboard
                    ? isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-500/15 text-emerald-700'
                    : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-500'
                }`}>
                  <LayoutDashboard className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Advanced Dashboard
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Full factor breakdowns and the 14-day forecast. Simple is the default.
                  </div>
                </div>
              </div>
              {renderToggle(!simpleDashboard, (v) => onToggleSimpleDashboard?.(!v))}
            </div>

            {/* Variant picker — 4 orthogonal visual identities. Light/Dark
                is handled by the toggle underneath, so cycling variants here
                keeps your preferred brightness. */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Theme Variant
              </label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <button
                  onClick={() => {
                    setVariant('standard');
                    showToast('Standard Theme Activated');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    themeVariant === 'standard'
                      ? themeMode === 'dark'
                        ? 'bg-emerald-950/50 border-emerald-500/60 ring-2 ring-emerald-500/30 text-white'
                        : 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20 text-slate-900'
                      : isDark
                      ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-sm bg-slate-900 border border-slate-700" />
                      <span className="w-3 h-3 rounded-sm bg-white border border-slate-300" />
                    </div>
                    {themeVariant === 'standard' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">Standard</div>
                    <div className="text-[11px] text-slate-500">Clean &amp; Modern</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setVariant('olive');
                    showToast('Olive Theme Activated');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    themeVariant === 'olive'
                      ? 'bg-[#556b2f]/20 border-[#556b2f] ring-2 ring-[#556b2f]/30 text-[#1e2e1b]'
                      : isDark
                      ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-sm bg-[#1c2614] border border-[#556b2f]/60" />
                      <span className="w-3 h-3 rounded-sm bg-[#efebd9] border border-[#d8d2c0]" />
                    </div>
                    {themeVariant === 'olive' && <Check className="w-3.5 h-3.5 text-[#556b2f]" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">Olive</div>
                    <div className="text-[11px] text-[#556b2f]">Beige &amp; Earthy</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setVariant('hunting');
                    showToast('Hunter Theme Activated');
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    themeVariant === 'hunting'
                      ? 'bg-[#c85a17]/20 border-[#c85a17] ring-2 ring-[#c85a17]/30 text-[#2c1810]'
                      : isDark
                      ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-sm bg-[#221610] border border-[#5c4a32]/60" />
                      <span className="w-3 h-3 rounded-sm bg-[#f5f0e8] border border-[#d4c5a9]" />
                    </div>
                    {themeVariant === 'hunting' && <Check className="w-3.5 h-3.5 text-[#c85a17]" />}
                  </div>
                  <div>
                    <div className="font-black text-xs">Hunter</div>
                    <div className="text-[11px] text-[#c85a17]">Rustic Autumn</div>
                  </div>
                </button>

              </div>
            </div>

            {/* Universal Light/Dark toggle — applies on top of whichever
                variant is selected above. Two-Finger tap of an in-app variant
                keeps its brightness preference. */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  themeMode === 'dark'
                    ? themeVariant === 'hunting'
                      ? 'bg-[#c85a17]/15 text-[#c85a17]'
                      : themeVariant === 'olive'
                      ? 'bg-[#556b2f]/20 text-[#556b2f]'
                      : 'bg-emerald-500/15 text-emerald-400'
                    : themeVariant === 'hunting'
                    ? 'bg-[#c85a17]/15 text-[#c85a17]'
                    : themeVariant === 'olive'
                    ? 'bg-[#556b2f]/20 text-[#556b2f]'
                    : 'bg-amber-500/15 text-amber-500'
                }`}>
                  {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {themeMode === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Applies to <strong>{
                      themeVariant === 'standard' ? 'Standard' :
                      themeVariant === 'olive' ? 'Olive' :
                      'Hunter'
                    }</strong> — flip anytime.
                  </div>
                </div>
              </div>
              {renderToggle(themeMode === 'dark', (v) => {
                setMode(v ? 'dark' : 'light');
                showToast(v ? 'Dark mode on' : 'Light mode on');
              })}
            </div>

            <details className="pt-2" open={!!customBackground}>
              <summary className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2 py-2 text-xs font-bold uppercase tracking-wider ${
                isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}>
                <span>Custom background (optional)</span>
                <span className="text-[10px] font-black opacity-60">Photo · opacity · blur</span>
              </summary>
              <div className="mt-2 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  id="custom-bg-upload"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // Reset the input so the same file can be re-selected later.
                    e.target.value = '';
                    try {
                      const compressed = await compressImage(file);
                      onSetCustomBackground(compressed);
                      if (compressed.length * 0.75 < 4 * 1024 * 1024) {
                        showToast('Custom background set');
                      } else {
                        showToast('Background compressed to ~720px — may not persist after reload');
                      }
                    } catch (err) {
                      console.error('Failed to process background photo:', err);
                      showToast('Could not load that photo. Try JPG or PNG under ~10 MB.');
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById('custom-bg-upload')?.click()}
                  className={`min-h-11 flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                    isDark ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                  {customBackground ? 'Change Photo' : 'Upload Photo'}
                </button>
                {customBackground && (
                  <button
                    onClick={() => {
                      onSetCustomBackground(null);
                      showToast('Custom background removed');
                    }}
                    className={`min-h-11 py-2.5 px-3 rounded-xl border flex items-center justify-center text-xs font-bold transition-all text-rose-500 ${
                      isDark ? 'bg-slate-950/60 border-slate-800 hover:bg-rose-950/30 hover:border-rose-900/50' : 'bg-slate-50 border-slate-200 hover:bg-rose-50 hover:border-rose-200'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

            {onSetCustomBackgroundOpacity && (
              <div className="space-y-4 pt-2 animate-fadeIn">
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Card Opacity</span>
                    <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{customBackgroundOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={customBackgroundOpacity}
                    onChange={(e) => onSetCustomBackgroundOpacity(parseInt(e.target.value, 10))}
                    className={`w-full h-2.5 rounded-lg cursor-pointer accent-emerald-500 border ${
                      isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                    }`}
                  />
                </div>

                {onSetCustomBackgroundBlur && (
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Panel Blur Adjustment</span>
                      <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{customBackgroundBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="1"
                      value={customBackgroundBlur}
                      onChange={(e) => onSetCustomBackgroundBlur(parseInt(e.target.value, 10))}
                      className={`w-full h-2.5 rounded-lg cursor-pointer accent-emerald-500 border ${
                        isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
                      }`}
                    />
                  </div>
                )}
              </div>
            )}
              </div>
            </details>
          </div>

          {/* Quick Guides & Web App Tool Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-3 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <h2 className={`text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Help & Resources
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={onOpenGuide}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all text-xs font-bold ${
                  isDark ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <BookOpen className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Weather & Moon Guide</span>
              </button>

              <button
                onClick={onOpenPwaModal}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all text-xs font-bold ${
                  isDark ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Web App Installation</span>
              </button>
            </div>
          </div>

          {/* Backup & Restore (JSON) Card */}
          <div className={`p-5 sm:p-6 rounded-3xl border space-y-4 ${isDark
          ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm'}`}>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/30">
              <Database className="w-5 h-5 text-emerald-500" />
              <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Backup & Restore (JSON)
              </h2>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Export all your LetsHunt data — hunting grounds, harvest logs, map pins, zones, paths,
              trail cam targets & locations, and photo metadata (with thumbnails) — to a single JSON
              file, then restore it here or on another device.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black transition-all ${
                  isDark
                    ? `bg-emerald-950/50 border-emerald-500/60 hover:bg-emerald-900 ${isHunterDark ? 'text-white' : 'text-emerald-300'}`
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                } ${isExporting ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? 'Exporting…' : 'Export JSON Backup'}
              </button>

              <button
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
                className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-slate-700'
                    : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                } ${isImporting ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isImporting ? 'Restoring…' : 'Restore from Backup'}
              </button>
            </div>

            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />

            <div className={`rounded-2xl border p-3.5 space-y-2 ${isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                What's included
              </div>
              <ul className={`text-xs leading-relaxed space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <li>• Hunting grounds, default location & all app settings (theme, units, pressure, alerts, map style & layers)</li>
                <li>• Harvest logs with photos & weather conditions</li>
                <li>• Map pins (stands, bedding, food plots), zones & paths</li>
                <li>• Trail cam targets, locations & photo metadata with thumbnails</li>
              </ul>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Note: full-resolution trail cam images live in local storage and aren't part of the JSON file —
                re-import them from your SD card if needed. Restoring overwrites saved settings, logs & map data,
                merges trail cam photos (matched by ID), and reloads the app. Your custom background photo is
                included in the file.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
