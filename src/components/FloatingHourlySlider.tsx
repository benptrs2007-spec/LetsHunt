import React, { useState, useEffect, useRef } from 'react';
import { Clock, Zap, RotateCcw, MapPin } from 'lucide-react';
import { getHour12Label, RATING_THRESHOLDS } from '../utils/huntingEngine';
import { ThemeVariantMode, HourlyForecast } from '../types';

interface FloatingHourlySliderProps {
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onResetToToday?: () => void;
  hourly?: HourlyForecast[];
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
}

export const FloatingHourlySlider: React.FC<FloatingHourlySliderProps> = ({
  selectedHour,
  onSelectHour,
  onResetToToday,
  hourly,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
}) => {
  // Instant local state for lag-free 60fps scrubbing
  const [localHour, setLocalHour] = useState(selectedHour);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // Sync prop changes when not actively dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalHour(selectedHour);
    }
  }, [selectedHour]);

  // Global event listeners to guarantee drag state release
  useEffect(() => {
    const handleEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);

    return () => {
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, []);

  const handleStartDrag = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleHourChange = (newVal: number) => {
    setLocalHour(newVal);
    onSelectHour(newVal);
  };

  const currentHourData = hourly && hourly[localHour] ? hourly[localHour] : null;
  // Track the current wall-clock hour so the "NOW" badge flips back when
  // the app stays open across midnight (or the user changes device clock).
  // Without this, `new Date().getHours()` is only sampled per-render and
  // would keep showing "NOW" on hour 23 forever after midnight rolled over.
  const [currentLocalHour, setCurrentLocalHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const tick = () => setCurrentLocalHour(new Date().getHours());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  const isNow = localHour === currentLocalHour;

  // Calculate percentage along the track for thumb position (0 to 100%)
  const handlePercent = (localHour / 23) * 100;

  const getHourlyScoreColor = (score: number) => {
    if (score >= RATING_THRESHOLDS.excellent) return '#2f8f68';
    if (score >= RATING_THRESHOLDS.good) return '#69a86f';
    if (score >= RATING_THRESHOLDS.okay) return '#d9a92c';
    if (score >= RATING_THRESHOLDS.slow) return '#d38a3a';
    return '#c45b53';
  };

  const sliderTrackClass = isDark
    ? theme === 'hunting' ? 'bg-[#3a332a] border-[#655745]'
    : theme === 'olive' ? 'bg-[#26351b] border-[#465b2d]'
    : 'bg-slate-800 border-slate-700'
    : theme === 'hunting' ? 'bg-[#d6b98f] border-[#a47b4e]'
    : theme === 'olive' ? 'bg-[#cbd5a8] border-[#7d8d55]'
    : 'bg-slate-200 border-slate-400';

  const sliderTrackStyle = {
    backgroundColor: 'rgb(var(--ui-surface-soft-rgb))',
    borderColor: 'rgb(var(--ui-border-rgb))',
  };

  const sliderAccentTextClass = isDark
    ? theme === 'hunting' ? 'text-[#e08a5a]' : theme === 'olive' ? 'text-[#a8c078]' : 'text-emerald-400'
    : theme === 'hunting' ? 'text-[#a34610]' : theme === 'olive' ? 'text-[#556b2f]' : 'text-emerald-600';
  const sliderAccentSurfaceClass = theme === 'hunting'
    ? 'bg-[#c85a17] border-[#e08a5a]'
    : theme === 'olive'
    ? 'bg-[#556b2f] border-[#8a9a5b]'
    : 'bg-emerald-600 border-emerald-300';

  const sliderThumbClass = isNow
    ? isDark
      ? theme === 'hunting' ? 'bg-[#e08a5a] text-[#24150e] border-[#f0ba7a] ring-[#e08a5a]/30' : theme === 'olive' ? 'bg-[#a8c078] text-[#1c2614] border-[#d0dc9e] ring-[#a8c078]/30' : 'bg-amber-400 text-slate-950 border-amber-200 ring-amber-400/30'
      : theme === 'hunting' ? 'bg-[#c85a17] text-white border-[#e08a5a] ring-[#c85a17]/30' : theme === 'olive' ? 'bg-[#8a9a5b] text-white border-[#c0ca91] ring-[#8a9a5b]/30' : 'bg-amber-500 text-slate-950 border-amber-300 ring-amber-500/30'
    : isDark
    ? theme === 'hunting' ? 'bg-[#c85a17] text-white border-[#e08a5a] ring-[#c85a17]/30' : theme === 'olive' ? 'bg-[#6f8f45] text-[#10180b] border-[#a8c078] ring-[#6f8f45]/30' : 'bg-emerald-500 text-slate-950 border-emerald-300 ring-emerald-500/30'
    : theme === 'hunting' ? 'bg-[#a34610] text-white border-[#d97642] ring-[#a34610]/30' : theme === 'olive' ? 'bg-[#556b2f] text-white border-[#8a9a5b] ring-[#556b2f]/30' : 'bg-emerald-500 text-slate-950 border-emerald-300 ring-emerald-500/30';

  return (
    <div className="hourly-slider-shell fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] sm:w-[95%] max-w-xl animate-fadeIn pointer-events-auto">
      <div
        style={{
          backgroundColor: isDark
            ? theme === 'hunting'
              ? 'rgba(32, 28, 23, var(--slider-opacity, 0.98))'
              : theme === 'olive'
              ? 'rgba(28, 38, 20, var(--slider-opacity, 0.98))'
              : 'rgba(2, 6, 23, var(--slider-opacity, 0.98))'
            : theme === 'hunting'
            ? 'rgba(234, 225, 207, var(--slider-opacity, 0.98))'
            : theme === 'olive'
            ? 'rgba(247, 245, 237, var(--slider-opacity, 0.98))'
            : 'rgba(255, 255, 255, var(--slider-opacity, 0.98))'
        }}
        className={`hourly-slider-card rounded-2xl backdrop-blur-xl border shadow-2xl p-2 sm:p-2.5 transition-all ${
          isDark
            ? theme === 'hunting'
              ? 'border-[#4a3320] text-[#f5e9d6] shadow-black/30'
              : theme === 'olive'
              ? 'border-[#2c3d1f] text-[#dde6cb] shadow-black/30'
              : 'border-slate-700/80 text-slate-100 shadow-emerald-950/30'
            : theme === 'hunting'
            ? 'border-[#d4c4a8] text-[#2a1b0e]'
            : theme === 'olive'
            ? 'border-[#d8d2c0] text-[#1e2e1b] shadow-[#556b2f]/10'
            : 'border-slate-300 text-slate-900 shadow-slate-500/20'
        }`}
      >
        {/* Compact Header Row */}
        <div className="hourly-slider-header flex items-center justify-between gap-2 mb-1">
          <div className="flex flex-1 items-center gap-1.5 min-w-0">
            <div className={`hourly-slider-icon w-5 h-5 sm:w-6 sm:h-6 rounded-lg border flex items-center justify-center flex-shrink-0 ${sliderAccentTextClass}`}>
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </div>
            <div className="hourly-slider-title-wrap min-w-0">
              <span className={`text-xs font-black uppercase tracking-wider truncate ${sliderAccentTextClass}`}>
                Hourly Hunt
              </span>
              <small>Movement by hour</small>
            </div>
            {currentHourData?.isPrimeWindow && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-white font-black rounded-full text-[11px] uppercase tracking-wider flex-shrink-0 animate-pulse shadow-xs ${sliderAccentSurfaceClass}`}>
                <Zap className="w-2.5 h-2.5" /> Best Hunt
              </span>
            )}
          </div>

          <div className="hourly-slider-header-actions flex items-center gap-1.5 shrink-0">
          {!isNow && (
            <button
              onClick={() => { handleHourChange(currentLocalHour); onResetToToday?.(); }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black transition-all border flex-shrink-0 ${
                isDark
                  ? theme === 'hunting' ? 'bg-[#4a2b1b] hover:bg-[#613620] text-[#f0ba7a] border-[#8a5536]'
                  : theme === 'olive' ? 'bg-[#2e3b20] hover:bg-[#3c4d28] text-[#c0d094] border-[#556b2f]'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-amber-500/40'
                  : theme === 'hunting' ? 'bg-[#f0d7b5] hover:bg-[#e6c298] text-[#7a3415] border-[#c85a17]'
                  : theme === 'olive' ? 'bg-[#e1e5c7] hover:bg-[#d2d9ad] text-[#3d5a2a] border-[#8a9a5b]'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 border-amber-500/40'
              }`}

            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset to Live
            </button>
          )}
          </div>
        </div>

        {/* Custom Interactive Track with Pop-Up Time Indicator on Drag */}
        <div className="relative pt-3 pb-0 select-none">
          {/* Track Bar & Thumb Wrapper */}
          <div className="relative w-full h-6 sm:h-6">
            {/* Visual Track Line */}
            <div
              className={`hourly-slider-track w-full h-full ${sliderTrackClass} rounded-full shadow-inner overflow-hidden border flex items-center`}
              style={sliderTrackStyle}
            >
              {/* One colored section per forecast hour. The transparent range input
                  below still owns interaction; these segments make the movement
                  quality visible before the user scrubs. */}
              {hourly && hourly.length > 0 ? (
                <div className="hourly-slider-segments" aria-hidden="true">
                  {hourly.slice(0, 24).map((item, index) => (
                    <span
                      key={`${item.time}-${index}`}
                      className={index === localHour ? 'selected' : ''}
                      style={{ backgroundColor: getHourlyScoreColor(item.huntScore) }}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-full bg-emerald-500/70" style={{ width: `${handlePercent}%` }} />
              )}
            </div>

            {/* Time Indicator Badge (Thumb) */}
            <div
              className={`absolute pointer-events-none flex flex-col items-center z-10 ${
                isDragging
                  ? 'transition-[top,scale] duration-150 ease-out -top-9 scale-105'
                  : 'transition-all duration-200 ease-out top-1/2 scale-100'
              }`}
              style={{
                left: `${handlePercent}%`,
                transform: `translateX(-50%) ${isDragging ? 'translateY(0)' : 'translateY(-50%)'}`,
              }}
            >
              <div
                className={`h-[34px] px-3.5 rounded-xl font-black text-xs shadow-md border-2 flex items-center justify-center gap-1 whitespace-nowrap transition-colors ring-2 ${sliderThumbClass}`}
              >
                {isNow ? <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> NOW ({getHour12Label(localHour)})</span> : getHour12Label(localHour)}
              </div>

              {/* Pointer Pin Arrow (visible when popped up above thumb) */}
              {isDragging && (
                <div
                  className={`w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-[6px] -mt-0.5 ${
                    isNow
                      ? theme === 'hunting' ? 'border-t-[#e08a5a]' : theme === 'olive' ? 'border-t-[#a8c078]' : 'border-t-amber-500'
                      : theme === 'hunting' ? 'border-t-[#c85a17]' : theme === 'olive' ? 'border-t-[#6f8f45]' : 'border-t-emerald-500'
                  }`}
                />
              )}
            </div>

            {/* Transparent Range Input Overlay for Dragging */}
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={localHour}
              onPointerDown={handleStartDrag}
              onTouchStart={handleStartDrag}
              onMouseDown={handleStartDrag}
              onPointerUp={() => {
                isDraggingRef.current = false;
                setIsDragging(false);
              }}
              onTouchEnd={() => {
                isDraggingRef.current = false;
                setIsDragging(false);
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
                setIsDragging(false);
              }}
              onChange={(e) => handleHourChange(parseInt(e.target.value, 10))}
              className="absolute inset-0 w-full h-full appearance-none opacity-0 cursor-pointer z-20"
              aria-label="Hourly time slider"
            />
          </div>
        </div>

        {/* Time Scale Ticks */}
        <div className="flex justify-between text-[11px] sm:text-xs font-black text-slate-400 px-1 mt-0.5 leading-none select-none">
          <span>12 AM</span>
          <span>3 AM</span>
          <span className="text-emerald-600 dark:text-emerald-400">6 AM Dawn</span>
          <span>9 AM</span>
          <span>12 PM</span>
          <span>3 PM</span>
          <span className="text-emerald-600 dark:text-emerald-400">6 PM Dusk</span>
          <span>9 PM</span>
        </div>
      </div>
    </div>
  );
};


