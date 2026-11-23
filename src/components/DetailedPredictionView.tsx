import React, { useState, useEffect } from 'react';
import { DailyForecast, Location, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit } from '../types';
import { WindCompass } from './WindCompass';
import { PressureChart } from './PressureChart';
import { DeerIcon } from './DeerIcon';
import { RutStatusModal } from './RutStatusModal';
import { RutPhaseIcon } from './RutPhaseIcon';
import { getHour12Label, getRatingFromScore, getWeatherDetails, calculateHuntScore, celsiusToFahrenheit, getBestStandForWind, RATING_THRESHOLDS } from '../utils/huntingEngine';
import { getRutPhase } from '../utils/rutEngine';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Sunrise,
  Sunset,
  Award,
  ChevronUp,
  ChevronDown,
  Clock,
  Gauge,
  Wind,
  TrendingUp,
  Sliders,
  Calendar,
  Info,
  Star,
  BarChart3,
} from 'lucide-react';

/** Hourly-axis ticks, centered under their representative hour bar — the
    same ticks the simple dashboard's hourly chart uses. */
const HOUR_TICKS: { hour: number; label: string }[] = [
  { hour: 0, label: '12 AM' },
  { hour: 3, label: '3 AM' },
  { hour: 6, label: '6 AM' },
  { hour: 9, label: '9 AM' },
  { hour: 12, label: '12 PM' },
  { hour: 15, label: '3 PM' },
  { hour: 18, label: '6 PM' },
  { hour: 21, label: '9 PM' },
];

interface DetailedPredictionViewProps {
  day: DailyForecast;
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onBack: () => void;
}

export const DetailedPredictionView: React.FC<DetailedPredictionViewProps> = ({
  day,
  location,
  units,
  pressureUnit,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  selectedHour,
  onSelectHour,
  onBack,
}) => {
  const [showFactors, setShowFactors] = useState(true);
  const [hoveredHourIdx, setHoveredHourIdx] = useState<number | null>(null);
  const [isRutModalOpen, setIsRutModalOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Extract hour-specific weather data for the selected hour
  const hourData = day.hourly[selectedHour] || day.hourly[0] || null;

  const activeScore = hourData ? hourData.huntScore : day.huntScore;
  const isExcellentDay = activeScore >= RATING_THRESHOLDS.excellent;
  const isGoodDay = activeScore >= RATING_THRESHOLDS.good && activeScore < RATING_THRESHOLDS.excellent;
  const isModerateDay = activeScore >= RATING_THRESHOLDS.okay && activeScore < RATING_THRESHOLDS.good;
  const isSlowDay = activeScore >= RATING_THRESHOLDS.slow && activeScore < RATING_THRESHOLDS.okay;
  const isPoorDay = activeScore < RATING_THRESHOLDS.slow;

  // Compute active factors dynamically
  const activeFactors = (() => {
    if (!hourData) return day.factors;

    // Recompute factors using calculateHuntScore based on selected hour parameters
    const calcResult = calculateHuntScore({
      tempDrop24h: hourData.tempDrop24h !== undefined ? hourData.tempDrop24h : day.tempDrop24h,
      maxTempF: hourData.temp,
      minTempF: day.minTemp,
      pressureInHg: hourData.pressureInHg,
      pressureTrend: hourData.pressureTrend ?? day.pressureTrend,
      windMph: hourData.windSpeedMph,
      weatherCode: hourData.weatherCode,
      isPostStorm: day.isPostStorm && hourData.weatherDesc === 'Rain Break',
      humidity: hourData.humidity ?? null,
      cloudCover: hourData.cloudCover ?? null,
      tempDeltaF: hourData.tempDeltaF ?? null,
      windGustMph: hourData.windGustMph ?? null,
      // Use the exact per-hour rain-break signal weatherService stamped on
      // the hour so the factor panel always agrees with the dial's score.
      hasRainBreak: hourData.weatherDesc === 'Rain Break',
      solunar: day.solunar,
      solunarRating: hourData.solunarRating,
      hour: selectedHour,
      isPrimeWindow: hourData.isPrimeWindow,
      units,
      pressureUnit,
      dateStr: day.date,
      location,
    });

    return calcResult.factors;
  })();

  // Setup wind variables based on selected hour or fallback to daily average
  const currentWindDeg = hourData ? hourData.windDirectionDeg : day.windDirectionDeg;
  const currentWindSpeed = hourData
    ? units === 'imperial'
      ? hourData.windSpeedMph
      : hourData.windSpeedKmh
    : units === 'imperial'
    ? day.windSpeedMaxMph
    : day.windSpeedMaxKmh;
  const currentWindText = hourData ? hourData.windDirectionText : day.windDirectionText;

  // Weather description
  const weatherDetails = hourData ? getWeatherDetails(hourData.weatherCode) : getWeatherDetails(day.weatherCode);

  // Score gauge color helper — Backwoods gets its own palette (mirroring the
  // dashboard dial) so the ring and every center element share one exact
  // color per theme × mode. Center elements use the returned stroke hex
  // directly, avoiding theme utility overrides that could break the match.
  const getScoreColorClasses = (score: number) => {
    if (score >= RATING_THRESHOLDS.excellent) { // Great - Deep Pine Green (emerald-800)
      return {
        bg: 'bg-emerald-800/10 dark:bg-emerald-500/15',
        border: 'border-emerald-800/20 dark:border-emerald-500/30',
        ring: 'ring-emerald-800/10 dark:ring-emerald-500/10',
        stroke: theme === 'hunting' ? '#556b2f' : isDark ? '#34d399' : '#047857', // theme-aware Great score color
      };
    } else if (score >= RATING_THRESHOLDS.good) { // Good - Sage Green (emerald-500/600)
      return {
        bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        border: 'border-emerald-500/20 dark:border-emerald-500/30',
        ring: 'ring-emerald-500/10 dark:ring-emerald-500/10',
        stroke: theme === 'hunting' ? '#556b2f' : isDark ? '#10b981' : '#059669', // theme-aware Good score color
      };
    } else if (score >= RATING_THRESHOLDS.okay) { // Okay - Yellow (amber-400/500)
      return {
        bg: 'bg-yellow-500/10 dark:bg-yellow-500/15',
        border: 'border-yellow-500/20 dark:border-yellow-500/30',
        ring: 'ring-yellow-500/10 dark:ring-yellow-500/10',
        stroke: theme === 'hunting' ? (isDark ? '#d9b64a' : '#b8860b') : isDark ? '#fbbf24' : '#ca8a04', // theme-aware Okay score color
      };
    } else if (score >= RATING_THRESHOLDS.slow) { // Slow - Orangish/Amber (amber-600)
      return {
        bg: 'bg-orange-500/10 dark:bg-orange-500/15',
        border: 'border-orange-500/20 dark:border-orange-500/30',
        ring: 'ring-orange-500/10 dark:ring-orange-500/10',
        stroke: theme === 'hunting' ? (isDark ? '#d08a4d' : '#c85a17') : '#d97706', // theme-aware Slow score color
      };
    } else { // Very Slow - Dusty Terracotta/Rose (rose-500/600)
      return {
        bg: 'bg-rose-500/10 dark:bg-rose-500/15',
        border: 'border-rose-500/20 dark:border-rose-500/30',
        ring: 'ring-rose-500/10 dark:ring-rose-500/10',
        stroke: theme === 'hunting' ? (isDark ? '#c5675c' : '#8b3a3a') : '#f43f5e', // theme-aware Very Slow score color
      };
    }
  };

  const colors = getScoreColorClasses(activeScore);
  const ratingBadgeClasses = theme === 'hunting'
    ? isExcellentDay
      ? 'bg-[#556b2f] text-white ring-2 ring-[#556b2f]/40'
      : isGoodDay
      ? 'bg-[#556b2f] text-white ring-2 ring-[#556b2f]/35'
      : isModerateDay
      ? 'bg-[#b8860b] text-white ring-2 ring-[#d9b64a]/35'
      : isSlowDay
      ? 'bg-[#c85a17] text-white ring-2 ring-[#e08a5a]/35'
      : 'bg-[#8b3a3a] text-white ring-2 ring-[#b56b6b]/35'
    : isExcellentDay
    ? 'bg-emerald-800 text-white ring-2 ring-emerald-800/25'
    : isGoodDay
    ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-500/20'
    : isModerateDay
    ? 'bg-yellow-500 text-slate-950 ring-2 ring-yellow-500/20'
    : isSlowDay
    ? 'bg-orange-600 text-white ring-2 ring-orange-500/25'
    : 'bg-rose-500 text-white ring-2 ring-rose-500/20';
  const rutInfo = getRutPhase(day.date, location);

  // Score-to-bar color — the exact palette the simple dashboard's hourly and
  // daily bars use, so a score reads the same color everywhere in the app.
  const getScoreColor = (score: number): string => {
    if (score >= RATING_THRESHOLDS.excellent) return '#2f8f68';
    if (score >= RATING_THRESHOLDS.good) return '#69a86f';
    if (score >= RATING_THRESHOLDS.okay) return '#d9a92c';
    if (score >= RATING_THRESHOLDS.slow) return '#d38a3a';
    return '#c45b53';
  };

  const stroke = getScoreColor(activeScore);
  const trackColor = 'rgb(var(--ui-border-rgb) / 0.8)';

  // The hovered/selected hour drives the details card under the bars.
  const activeIdx = hoveredHourIdx !== null ? hoveredHourIdx : selectedHour;
  const activeHour = day.hourly[activeIdx] || null;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Header Back Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className={`px-4 py-2 text-xs sm:text-sm font-extrabold uppercase tracking-wider rounded-xl border flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
            isDark
              ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Calendar className="w-4 h-4" />
          <span>{day.dayName}, {day.dateFormatted} Day Details</span>
        </div>
      </div>

      {/* Hero Header Area: Overall Day Score */}
      <div
        className={`rounded-3xl border p-4 sm:p-6 shadow-xl relative overflow-hidden transition-all duration-300 ${
          // Theme-aware card surface, matching the other cards on this page
          // (no solid rating tint — the border below carries the band color).
          isDark
            ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl' : 'bg-slate-900/90'} text-slate-100`
            : theme === 'hunting'
            ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-xl text-[#2a1b0e]'
            : theme === 'olive'
            ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl text-[#1e2e1b]'
            : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-xl' : 'bg-white'} text-slate-900`
        } ${
          // Rating-tinted border keeps the score-band signal.
          isExcellentDay
            ? 'border-emerald-600/40'
            : isGoodDay
            ? 'border-emerald-500/35'
            : isModerateDay
            ? 'border-yellow-500/40'
            : isSlowDay
            ? 'border-orange-500/40'
            : 'border-rose-500/40'
        }`}
      >
        {/* Compact media-object hero: dial on the left (desktop), the plan on
            the right — it stacks tight on phones without losing anything. */}
        <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 z-10 w-full sm:w-auto sm:min-w-[280px]">
            <DeerIcon className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" style={{ color: stroke, fill: stroke }} />
            <div
              className="relative flex-1 min-w-0 h-9 sm:h-10 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={activeScore}
              aria-label={`Hunt score ${activeScore} out of 100, rated ${getRatingFromScore(activeScore)}`}
            >
              <div className="absolute inset-0" style={{ backgroundColor: trackColor }} />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out flex items-center justify-end"
                style={{ width: `${activeScore}%`, backgroundColor: stroke }}
              >
                <span className="text-white text-base sm:text-lg font-black leading-none pr-2.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                  {activeScore}
                </span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1 leading-none" style={{ color: stroke }}>
              {activeScore >= RATING_THRESHOLDS.excellent && <Star className="w-3 h-3" style={{ color: stroke, fill: stroke }} />}
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap">{getRatingFromScore(activeScore)}</span>
            </div>
          </div>

          <div className="w-full min-w-0 flex-1 flex flex-col items-center sm:items-start text-center sm:text-left gap-2.5 z-10">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Today's Hunting Plan
              </span>
              <div className={`text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs transition-all flex items-center gap-1 ${
                ratingBadgeClasses
              }`}>
                {isExcellentDay && <Star className="w-3 h-3 fill-current text-amber-300" />}
                <span>{getRatingFromScore(activeScore)} {selectedHour !== undefined ? `at ${getHour12Label(selectedHour)}` : 'Day'}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRutModalOpen(true)}
                className={`inline-flex items-center gap-1 text-xs sm:text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider border cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xs ring-2 ring-transparent hover:ring-amber-500/40 ${rutInfo.badgeStyle}`}
                title="Click for Rut Phase Breakdown & Hunter Tips"
              >
                <RutPhaseIcon iconName={rutInfo.iconName} className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{rutInfo.name}</span>
                <Info className="w-3 h-3 ml-0.5 opacity-80" />
              </button>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight">
              {day.dayName === 'Today' ? 'Today\'s' : `${day.dayName}'s`} Hunting Guide
            </h1>

            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {day.verdict}
            </p>

            <div className="flex flex-wrap gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-100/[var(--card-opacity)] border-slate-200 text-slate-700'}`}>
                <Sunrise className="w-3.5 h-3.5" /> Sunrise: {day.solunar?.sunrise || '6:30 AM'}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-100/[var(--card-opacity)] border-slate-200 text-slate-700'}`}>
                <Sunset className="w-3.5 h-3.5" /> Sunset: {day.solunar?.sunset || '6:45 PM'}
              </span>
            </div>

            <div className={`w-full p-2.5 sm:p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800/85 text-slate-100' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 shadow-xs'
            }`}>
              <RutPhaseIcon iconName={rutInfo.iconName} className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-extrabold text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Rut: {rutInfo.name} ({rutInfo.description})
                </div>
                <p className={`mt-0.5 font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {rutInfo.hunterTip}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Center Column: Interactive Score Graph & Factor Breakdown */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* 24-Hour Deer Movement Score Graph — a compact bar row matching the
              simple dashboard's hourly hunt score, so the palette, shape, and
              tap-to-preview behavior feel identical. Always fits its card —
              no horizontal scroll. */}
          <div className="order-1">
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800 text-slate-100' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-flex items-center gap-2"><TrendingUp className="w-4 h-4" /> When Deer May Move</span>
                </h3>
                <p className={`text-xs sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  A simple 0–100 guide to when deer may move. Tap a bar to preview that hour.
                </p>
              </div>

              {/* Same score-color legend as the simple dashboard's hourly chart */}
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-bold flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreColor(90) }} /> Great</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreColor(80) }} /> Good</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreColor(50) }} /> Okay</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreColor(33) }} /> Slow</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: getScoreColor(15) }} /> Very Slow</span>
              </div>
            </div>

            {/* Hourly bars — bar height is the movement score, colored with
                the same palette as the rest of the app. The selected/hovered
                bar glows so the active hour reads instantly. */}
            <div className="flex items-end gap-[2px] h-20 sm:h-24">
              {day.hourly.slice(0, 24).map((h, i) => {
                const isActive = selectedHour === i || hoveredHourIdx === i;
                return (
                  <div
                    key={`${h.time}-${i}`}
                    title={`${h.time} · ${h.huntScore}/100 (${getRatingFromScore(h.huntScore)}) — tap to preview this hour`}
                    onClick={() => onSelectHour(i)}
                    onMouseEnter={() => setHoveredHourIdx(i)}
                    onMouseLeave={() => setHoveredHourIdx(null)}
                    role="button"
                    tabIndex={-1}
                    aria-label={`${h.time} — hunt score ${h.huntScore}, ${getRatingFromScore(h.huntScore)}. Tap to preview this hour.`}
                    className="flex-1 rounded-t-sm min-w-0 cursor-pointer transition-all"
                    style={{
                      height: `${Math.max(6, h.huntScore)}%`,
                      backgroundColor: getScoreColor(h.huntScore),
                      boxShadow: isActive ? `0 0 10px 2px ${getScoreColor(h.huntScore)}cc` : 'none',
                    }}
                  />
                );
              })}
            </div>

            {/* Hour ticks — same as the simple dashboard's hourly chart */}
            <div className="flex gap-[2px] mt-1.5 leading-none select-none" aria-hidden="true">
              {day.hourly.slice(0, 24).map((h, i) => {
                const tick = HOUR_TICKS.find((t) => t.hour === i);
                return (
                  <div key={`tick-${h.time}-${i}`} className="flex-1 min-w-0 relative h-3">
                    {tick && (
                      <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {tick.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selected hour details card directly below the bars */}
            {activeHour && (
              <div
                className={`mt-4 p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn ${
                  isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-500 font-extrabold rounded-lg border border-blue-500/30 text-xs">
                    ⏰ {activeHour.time} Details
                  </span>
                  <div>
                    <div className={`font-black text-sm flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      <span>Movement: {activeHour.huntScore}/100</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        activeHour.huntScore >= 86 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                        activeHour.huntScore >= 61 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                        activeHour.huntScore >= 41 ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' :
                        activeHour.huntScore >= 26 ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' :
                        'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {getRatingFromScore(activeHour.huntScore)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                  <div>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Temp: </span>
                    <span className={`font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{activeHour.temp}°{units === 'imperial' ? 'F' : 'C'}</span>
                  </div>
                  <div>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Wind: </span>
                    <span className={`font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {activeHour.windDirectionText} {units === 'metric' ? `${activeHour.windSpeedKmh} km/h` : `${activeHour.windSpeedMph} mph`}
                    </span>
                  </div>
                  <div>
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Precip: </span>
                    <span className={`font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{activeHour.precipProbability}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          </div>

          {/* 24-Hour Precipitation & Barometric Pressure Chart */}
          <div className="order-3">
          <PressureChart
            hourly={day.hourly}
            units={units}
            pressureUnit={pressureUnit}
            theme={theme}
            isDark={isDark}
            hasCustomBackground={hasCustomBackground}
            selectedHour={selectedHour}
            onSelectHour={onSelectHour}
            selectedDayName={day.dayName}
            selectedDateFormatted={day.dateFormatted}
          />
          </div>

          {/* Factor Breakdown Section */}
          <div className="order-2">
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'
            }`}
          >
            <div
              className="flex items-center justify-between cursor-pointer select-none mb-3"
              onClick={() => setShowFactors(!showFactors)}
            >
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-flex items-center gap-2"><BarChart3 className="w-4 h-4" /> What may get deer moving</span>
                </h3>
                <p className={`text-xs sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {selectedHour !== undefined
                    ? `Weather, moon, wind, and local details behind this ${getHour12Label(selectedHour)} hunt score`
                    : 'Weather, moon, wind, and local details behind this hunt score'}
                </p>
              </div>

              <button className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                {showFactors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>

            {showFactors && (
              <div className={`space-y-3.5 mt-3 divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {activeFactors.map((factor, idx) => {
                  const isPositive = factor.score > 0;
                  return (
                    <div key={idx} className="pt-3.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{factor.name}</span>
                          <span
                            className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                              factor.status === 'optimal'
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                                : factor.status === 'good'
                                ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/40'
                                : factor.status === 'poor'
                                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {factor.status === 'optimal' ? 'Best' : factor.status === 'good' ? 'Good' : factor.status === 'poor' ? 'Tough' : 'Normal'}
                          </span>
                        </div>
                        <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{factor.description}</p>
                      </div>

                      <div className="flex-shrink-0 self-end sm:self-center font-extrabold text-right">
                        <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : factor.score < 0 ? 'text-rose-500' : 'text-slate-400'}>
                          {isPositive ? `+${factor.score}` : factor.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Right Column: Scent Compass, Solunar times, and hourly controls */}
        <div className="space-y-6">
          {/* Active Day Scent Vector Label */}
          <div className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 px-3 py-2.5 rounded-2xl border ${
            isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-700 shadow-xs'
          }`}>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span className="leading-normal">
              Wind & Scent: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted}){selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}</span>
            </span>
          </div>
          
          {/* Scent & Wind Direction Compass */}
          <WindCompass
            deg={currentWindDeg}
            speedMph={hourData ? hourData.windSpeedMph : day.windSpeedMaxMph}
            speedKmh={hourData ? hourData.windSpeedKmh : day.windSpeedMaxKmh}
            directionText={currentWindText}
            units={units}
            theme={theme}
            isDark={isDark}
          hasCustomBackground={hasCustomBackground}
            location={location}
          />

          {/* Quick Metrics Panel */}
          <div
            className={`rounded-2xl p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800 text-slate-100' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
            }`}
          >
            <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-4">
              ⏱️ Moon & Best Activity Times
            </h4>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-500/10">
                <span className="font-semibold text-slate-400">Moon:</span>
                <span className="font-black text-right">{day.solunar?.moonPhaseName} ({Math.round(day.solunar?.moonIllumination || 0)}%)</span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-500/10">
                <span className="font-semibold text-slate-400">Morning Hunt:</span>
                <span className="font-black text-emerald-500">{day.morningPrime}</span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-500/10">
                <span className="font-semibold text-slate-400">Evening Hunt:</span>
                <span className="font-black text-amber-500">{day.eveningPrime}</span>
              </div>

              {day.solunar?.major1 && (
                <div className="flex flex-col gap-1 pb-3 border-b border-slate-500/10">
                  <span className="font-semibold text-slate-400">Best Moon Window:</span>
                  <span className="font-bold text-slate-300">{day.solunar.major1}</span>
                </div>
              )}

              {day.solunar?.minor1 && (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-400">Other Moon Window:</span>
                  <span className="font-bold text-slate-400">{day.solunar.minor1}</span>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>

      {/* Rut Phase Modal Breakdown */}
      <RutStatusModal
        isOpen={isRutModalOpen}
        onClose={() => setIsRutModalOpen(false)}
        rutInfo={rutInfo}
        location={location}
        dateFormatted={`${day.dayName}, ${day.dateFormatted}`}
        theme={theme}
        isDark={isDark}
          hasCustomBackground={hasCustomBackground}
      />
    </div>
  );
};
