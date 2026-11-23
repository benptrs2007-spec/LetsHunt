/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';
import {              Compass,
              MapPin,
              Search,
              Star,
              Settings,
              LayoutDashboard,
              Home,
              Map,
              ScrollText,
              Camera,
              Sun,
              Moon,
            } from 'lucide-react';
import { Location, ThemeVariantMode } from '../types';
import { searchLocations } from '../services/weatherService';
import { buildThemedLogo } from '../utils/themedLogo';

interface HeaderProps {
  currentLocation: Location;
  onSelectLocation: (loc: Location) => void;
  defaultLocation: Location;
  onSetDefaultLocation: (loc: Location) => void;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  favorites: Location[];
  onToggleFavorite: (loc: Location) => void;
  onOpenGuide: () => void;
  onOpenPwaModal: () => void;
  activeTab: 'dashboard' | 'settings' | 'map' | 'details' | 'logs' | 'trailcams';
  onToggleColorMode: () => void;
  onTabChange: (tab: 'dashboard' | 'settings' | 'map' | 'logs' | 'trailcams') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLocation,
  onSelectLocation,
  defaultLocation,
  onSetDefaultLocation,
  theme,
  isDark = theme === 'dark',
  hasCustomBackground = false,
  favorites,
  onToggleFavorite,
  activeTab,
  onToggleColorMode,
  onTabChange,
}) => {
  // Header brand mark: inline the horizontal LetsHunt logo
  // (letshunthorizontallogo.svg) and recolor it per theme, so the header
  // stays theme-aware like the old hand-built inline SVG while the file
  // remains the single source of truth. The HUNT photo is the app icon
  // everywhere else (PWA icons, favicon, and splash screen).
  //
  // The recoloring itself now lives in buildThemedLogo so the desktop
  // navigation rail renders the exact same artwork from the exact same
  // source, and the two cannot drift apart.
  const themedLogo = buildThemedLogo(theme, isDark, 'h-12 sm:h-14 w-auto -my-3');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Handle location search debounced
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

  // Click outside listener for search dropdown
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
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: 'My GPS Location',
          admin1: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          country: 'GPS Location',
          latitude,
          longitude,
        };
        onSelectLocation(gpsLocation);
        setIsLocating(false);
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const isCurrentFav = favorites.some(
    (f) => Math.abs(f.latitude - currentLocation.latitude) < 0.01 && Math.abs(f.longitude - currentLocation.longitude) < 0.01
  );

  const isCurrentDefault =
    Math.abs(defaultLocation.latitude - currentLocation.latitude) < 0.01 &&
    Math.abs(defaultLocation.longitude - currentLocation.longitude) < 0.01;


  return (
    <header
      className={`safe-top sticky top-0 z-50 px-3 sm:px-6 lg:px-8 py-1 transition-colors duration-200 border-b ${
        isDark
          ? 'bg-slate-950/[var(--card-opacity)] backdrop-blur-md border-slate-800/80 shadow-lg text-slate-100'
          : theme === 'hunting'
          ? 'bg-[#f4eee1]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] shadow-xs text-[#2a1b0e]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] shadow-xs text-[#1e2e1b]'
          : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 shadow-sm text-slate-900'
      }`}
    >
      <div className="max-w-7xl xl:max-w-[1500px] 2xl:max-w-[1700px] mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap md:flex-nowrap">
          {/* Left: Brand Logo, GPS, Search Box, and Active Location Badge */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Logo — lelshunthorizontallogo.svg inlined & recolored per theme */}
            <div
              className="flex items-center cursor-pointer flex-shrink-0"
              onClick={() => {
                onTabChange('dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              dangerouslySetInnerHTML={{ __html: themedLogo }}
              aria-label="LetsHunt"
            />

            {/* GPS / Locate Button */}
            <button
              onClick={handleGetCurrentLocation}
              disabled={isLocating}
              aria-label={isLocating ? 'Locating…' : 'Locate my position via GPS'}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 border ${
                isDark
                  ? 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-emerald-400'
                  : theme === 'hunting'
                  ? 'bg-[#eae1cf] border-[#d4c4a8] hover:bg-[#e0d6c0] text-[#c85a17]'
                  : (theme === 'olive' || theme === 'hunting')
                  ? 'bg-[#efebd9] border-[#d8d2c0] hover:bg-[#e8e4d2] text-[#556b2f]'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-emerald-600'
              }`}
              title="Locate via GPS"
            >
              <Compass className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ${isLocating ? 'animate-spin' : ''}`} />
            </button>

            {/* Quick Search Box */}
            <div className="relative flex-1 max-w-[160px] sm:max-w-[240px] lg:max-w-[300px] xl:max-w-[380px]" ref={searchContainerRef}>
              <div
                className={`flex items-center border rounded-xl px-2.5 py-2.5 sm:py-2 transition-all ${
                  isDark
                    ? 'bg-slate-900/[var(--card-opacity)] border-slate-800 focus-within:border-emerald-500'
: theme === 'hunting'
? 'bg-[#eae1cf] border-[#d4c4a8] focus-within:border-[#c85a17]'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'bg-[#efebd9] border-[#d8d2c0] focus-within:border-[#556b2f]'
                    : 'bg-slate-50 border-slate-200 focus-within:border-emerald-600'
                }`}
              >
                <Search className={`w-4 h-4 mr-1.5 flex-shrink-0 ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#6e6a5e]' : 'text-slate-500'}`} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search location..."
                  aria-label="Search for a location"
                  className={`w-full bg-transparent text-xs sm:text-[13px] focus:outline-none ${
                    isDark
                      ? 'text-white placeholder-slate-500'
                      : theme === 'hunting'
                      ? 'text-[#2a1b0e] placeholder-[#8b7355]'
                      : (theme === 'olive' || theme === 'hunting')
                      ? 'text-[#1e2e1b] placeholder-[#8c8675]'
                      : 'text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isSearching && (
                  <div className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin ml-1 flex-shrink-0 ${theme === 'hunting' ? 'border-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'border-[#556b2f]' : 'border-emerald-500'}`} />
                )}
              </div>

              {/* Search Dropdown Results */}
              {showDropdown && searchResults.length > 0 && (
                <div
                  className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto divide-y ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-200'
                      : theme === 'hunting'
                      ? 'bg-[#f4eee1] border-[#d4c4a8] divide-[#e5dcc8] text-[#2a1b0e]'
                      : (theme === 'olive' || theme === 'hunting')
                      ? 'bg-[#f7f5ed] border-[#d8d2c0] divide-[#e5e0cf] text-[#1e2e1b]'
                      : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                  }`}
                >
                  {searchResults.map((loc, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onSelectLocation(loc);
                        setShowDropdown(false);
                        setSearchQuery('');
                      }}
                      className={`w-full text-left px-3 py-2 transition-colors flex items-center gap-2 text-xs ${
                        isDark
                          ? 'hover:bg-emerald-950/50 hover:text-emerald-300'
                          : theme === 'hunting'
                          ? 'hover:bg-[#e8ddca] hover:text-[#c85a17]'
                          : (theme === 'olive' || theme === 'hunting')
                          ? 'hover:bg-[#e8e3d3] hover:text-[#2d4a27]'
                          : 'hover:bg-emerald-50 hover:text-emerald-800'
                      }`}
                    >
<MapPin className={`w-3 h-3 flex-shrink-0 ${theme === 'hunting' ? 'text-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : 'text-emerald-500'}`} />
                      <div className="truncate">
                        <span className="font-semibold">{loc.name}</span>
                        <span className={`ml-1 text-[11px] ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#6e6a5e]' : 'text-slate-500'}`}>
                          {loc.admin1 ? `${loc.admin1}, ` : ''}{loc.country}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Light / dark mode toggle stays beside location search for quick field adjustments. */}
            <button
              type="button"
              onClick={onToggleColorMode}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`header-color-mode-toggle w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 transition-all hover:-translate-y-0.5 active:translate-y-0 ${
                isDark
                  ? theme === 'hunting'
                    ? 'bg-[#3a332a] border-[#655745] text-[#f0ba7a] hover:bg-[#4a3b2c]'
                    : theme === 'olive'
                    ? 'bg-[#26351b] border-[#465b2d] text-[#c0d094] hover:bg-[#304522]'
                    : 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                  : theme === 'hunting'
                  ? 'bg-[#f0d7b5] border-[#c85a17] text-[#a34610] hover:bg-[#e6c298]'
                  : theme === 'olive'
                  ? 'bg-[#e1e5c7] border-[#8a9a5b] text-[#556b2f] hover:bg-[#d2d9ad]'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Active Location Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-xl border max-w-[130px] md:max-w-[180px] lg:max-w-[220px] flex-shrink-0 ${
              theme === 'hunting'
                ? 'bg-[#c85a17]/10 border-[#c85a17]/25'
                : (theme === 'olive' || theme === 'hunting')
                ? 'bg-[#556b2f]/10 border-[#556b2f]/25'
                : 'bg-emerald-500/10 border-emerald-500/20'
            }`}>
              <MapPin className={`w-3 h-3 flex-shrink-0 ${theme === 'hunting' ? 'text-[#c85a17]' : (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : 'text-emerald-500'}`} />
              <span className={`text-xs font-bold truncate ${(theme === 'olive' || theme === 'hunting') ? 'text-[#2d4a27]' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {currentLocation.name}
              </span>

              {/* Set Default Button */}
              <button
                onClick={() => onSetDefaultLocation(currentLocation)}
                aria-label={isCurrentDefault ? 'Default starting location' : 'Set as default starting location'}
                className={`p-2 rounded-lg transition-colors ml-0.5 ${
                  isCurrentDefault
                    ? (theme === 'olive' || theme === 'hunting') ? 'text-[#556b2f]' : 'text-emerald-500'
                    : isDark
                    ? 'text-slate-500 hover:text-slate-300'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#8c8675] hover:text-[#1e2e1b]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={isCurrentDefault ? 'Default Starting Location' : 'Set as Default Location'}
              >
                <Home className={`w-4 h-4 ${isCurrentDefault ? 'fill-current' : ''}`} />
              </button>

              {/* Save Location Star */}
              <button
                onClick={() => onToggleFavorite(currentLocation)}
                aria-label={isCurrentFav ? 'Remove from saved hunting grounds' : 'Save this location'}
                className={`p-2 rounded-lg transition-colors ${
                  isCurrentFav
                    ? 'text-amber-500'
                    : isDark
                    ? 'text-slate-500 hover:text-slate-300'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#8c8675] hover:text-[#1e2e1b]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title={isCurrentFav ? 'Saved in Ground List' : 'Save Location'}
              >
                <Star className={`w-4 h-4 ${isCurrentFav ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Desktop separator between left controls and nav tabs. Hidden at
              lg+ where the left navigation rail owns navigation and this
              header reduces to search + location controls. */}
          <div className="hidden sm:block lg:hidden w-px self-stretch my-1.5 flex-shrink-0" style={{
            backgroundColor: isDark
              ? 'rgba(148,163,184,0.15)'
              : theme === 'hunting'
              ? 'rgba(42,27,14,0.1)'
              : theme === 'olive'
              ? 'rgba(30,46,27,0.1)'
              : 'rgba(148,163,184,0.2)',
          }} />

          {/* Right: Navigation Tabs (visible from sm / 640px+).
              Hidden at lg+ (1024px+) where DesktopRail provides the same five
              destinations in a persistent left rail — keeping both would
              duplicate navigation and squeeze the header row. The 640-1023px
              tablet range keeps these tabs, unchanged. */}
          <div className="hidden sm:flex lg:hidden items-center gap-1 flex-shrink-0 min-w-0">
            <nav className={`flex items-center gap-1 p-0.5 rounded-2xl border flex-shrink-0 ${
              isDark
                ? 'bg-slate-900/[var(--card-opacity)] border-slate-800'
                : (theme === 'olive' || theme === 'hunting')
                ? 'bg-[#e8e4d5] border-[#d4cebc]'
                : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => onTabChange('dashboard')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'dashboard' || activeTab === 'details'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#556b2f] text-white shadow-md scale-105' : 'bg-emerald-600 text-white shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
                    : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>

              <button
                onClick={() => onTabChange('map')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'map'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#556b2f] text-white shadow-md scale-105' : 'bg-emerald-600 text-white shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#556b2f] hover:bg-[#e0dcc8]/50'
                    : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                <Map className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Map</span>
              </button>

              <button
                onClick={() => onTabChange('logs')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'logs'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#b87333] text-white shadow-md scale-105' : 'bg-amber-500 text-slate-950 shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#8b6914] hover:bg-[#f5eedb]/60'
                    : 'text-slate-600 hover:text-amber-600 hover:bg-amber-50/50'
                }`}
              >
                <ScrollText className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Logs</span>
              </button>

              <button
                onClick={() => onTabChange('trailcams')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'trailcams'
                    ? (theme === 'olive' || theme === 'hunting') ? 'bg-[#4a7fb5] text-white shadow-md scale-105' : 'bg-sky-500 text-white shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-sky-400 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#3b6fa0] hover:bg-[#e8f0f8]/60'
                    : 'text-slate-600 hover:text-sky-600 hover:bg-sky-50/50'
                }`}
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Trail Cams</span>
              </button>

              <button
                onClick={() => onTabChange('settings')}
                className={`whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 flex-1 min-w-0 ${
                  activeTab === 'settings'
                    ? isDark
                      ? 'bg-slate-700 text-slate-200 shadow-md scale-105'
                      : (theme === 'olive' || theme === 'hunting')
                      ? 'bg-[#d4cebc] text-[#2d4a27] shadow-md scale-105'
                      : 'bg-slate-200 text-slate-800 shadow-md scale-105'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    : (theme === 'olive' || theme === 'hunting')
                    ? 'text-[#3d4f21] hover:text-[#1e2e1b] hover:bg-[#e0dcc8]/50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Phone location chip — a forecast is meaningless if a hunter
            can't see which ground it belongs to. Tapping it jumps to the
            search field so switching spots is one action. */}
        <div className="sm:hidden mt-1.5 px-0.5">
          <button
            type="button"
            onClick={() => searchInputRef.current?.focus()}
            aria-label={`Change forecast location, currently ${currentLocation.name}`}
            className={`w-full min-h-11 flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
              isDark
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                : theme === 'hunting'
                ? 'bg-[#c85a17]/10 border-[#c85a17]/30 text-[#7a3208]'
                : theme === 'olive'
                ? 'bg-[#556b2f]/10 border-[#556b2f]/30 text-[#3d4f21]'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider shrink-0 opacity-70">Forecasting</span>
            <span className="text-xs font-black truncate">
              {currentLocation.name}{currentLocation.admin1 ? `, ${currentLocation.admin1}` : ''}
            </span>
            <Search className="w-3.5 h-3.5 ml-auto shrink-0 opacity-70" />
          </button>
        </div>
      </div>
    </header>
  );
};

