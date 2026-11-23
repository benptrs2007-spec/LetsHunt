import React, { useState, useEffect } from 'react';
import { DailyForecast, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit, Location } from '../types';
import { DeerIcon } from './DeerIcon';
import { getHour12Label, getRatingFromScore, getWeatherDetails, getBestHuntTime, getBestStandForWind, getPeakHuntScore, isPrimeDay, isSignificantColdFront, RATING_THRESHOLDS } from '../utils/huntingEngine';
import { getRutPhase } from '../utils/rutEngine';
import { motion } from 'motion/react';
import { PaperTexture } from './PaperTexture';
import {
  Sun,
  SunMedium,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  Snowflake,
  CloudLightning,
  TrendingDown,
  TrendingUp,
  Minus,
  ArrowDownRight,
  ArrowUpRight,
  Wind,
  Gauge,
  Sunrise,
  Sunset,
  Clock,
  Award,
  ChevronDown,
  Droplets,
  Calendar,
  Target,
  Zap,
  RefreshCw,
  Trees,
  Compass,
  Sparkles,
  Flame,
  Lock,
  ShieldCheck,
  Moon,
  Star,
  Maximize2,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';

interface ForecastCardsProps {
  daily: DailyForecast[];
  /**
   * Optional extended forecast (e.g. all 14 days from the API). When supplied,
   * a "View 14-day forecast" button is rendered below the 7-day cards that
   * opens a modal listing every day beyond the default 7 — the dashboard
   * stays unchanged. Defaults to `daily` so callers that don't pass it keep
   * working unchanged.
   */
  dailyAll?: DailyForecast[];
  /** Opens the dashboard-owned 14-day subpage instead of a local overlay. */
  onOpenFourteenDay?: () => void;
  /** When true, render every supplied day and label the heading accordingly. */
  isExtendedView?: boolean;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  units: UnitSystem;
  pressureUnit?: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  selectedHour?: number;
  onOpenDetails?: (dateStr: string) => void;
  location?: Location;
  hasCustomBackground?: boolean;
  lastRefreshed?: Date | null;
}

export const ForecastCards: React.FC<ForecastCardsProps> = ({
  daily,
  dailyAll,
  onOpenFourteenDay,
  isExtendedView = false,
  selectedDate,
  onSelectDate,
  units,
  pressureUnit = 'inHg',
  theme,
  isDark = theme === 'dark',
  selectedHour,
  onOpenDetails,
  location,
  hasCustomBackground = false,
  lastRefreshed,
}) => {
  // Which 7-day card the Best Day banner auto-expanded — kept separate from the
  // real selection so tapping the banner never swaps the top forecast card.
  const [autoExpandedDate, setAutoExpandedDate] = useState<string | null>(null);
  const [bestDayScrollRequest, setBestDayScrollRequest] = useState(0);
  // Prime explanations are intentionally opt-in: a badge click opens one
  // explanation, while expanding a card or changing the selected day does not.
  const [expandedPrimeDate, setExpandedPrimeDate] = useState<string | null>(null);
  // Extended-foresight modal: only opens when the user explicitly taps the
  // "View 14-day forecast" button below the 7-day cards. We default to the
  // supplied `daily` array if the parent didn't pass `dailyAll`, so the button
  // gracefully no-ops when extra forecast data isn't available.
  const [showFourteenDay, setShowFourteenDay] = useState(false);

  // Days covered by the 7-day cards. Anything past this index lives only in
  // `dailyAll` and is reachable via the extended-view modal below. Falls back
  // gracefully if the parent passed a shorter dashboard list.
  const extendedDays = (dailyAll && dailyAll.length > 7 ? dailyAll : daily).slice(7);
  const hasExtendedForecast = extendedDays.length > 0;

  // ESC closes the 14-day modal. We don't fight the rest of the app for this
  // key because the modal is a full-screen overlay that captures focus when
  // open, and once closed focus returns to whatever the user was looking at.
  useEffect(() => {
    if (!showFourteenDay) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFourteenDay(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showFourteenDay]);

  // Lock body scroll while the modal is open so swiping the page behind it
  // can't escape the overlay on iOS Safari.
  useEffect(() => {
    if (!showFourteenDay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showFourteenDay]);

  // Scroll only after the auto-expanded card has rendered. Scrolling in the
  // button's click handler raced the state update, making the first tap expand
  // the card and the second tap appear to be what performed the scroll.
  useEffect(() => {
    if (!autoExpandedDate) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById(`forecast-card-${autoExpandedDate}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => window.clearTimeout(timeoutId);
  }, [autoExpandedDate, bestDayScrollRequest]);

  if (!daily || daily.length === 0) return null;

  // Heading text color is always theme-driven so it pops against the heading's
  // theme-aware card: dark theme → light text, light/olive/hunting → dark ink.
  const headerLightOnDark = isDark;

  const headerTextColor = headerLightOnDark
    ? 'text-white'
    : theme === 'hunting'
    ? 'text-[#2a1b0e]'
    : theme === 'olive'
    ? 'text-[#1e2e1b]'
    : 'text-slate-900';

  const headerIconColor = headerLightOnDark ? 'text-emerald-400' : 'text-emerald-600';

  // Soft drop shadow behind the header text whenever a photo is present — keeps
  // it legible even over busy sections of the image (and covers the unmeasured
  // fallback case too). Dark text themes get a much subtler shadow so it doesn't
  // muddy the heading in light/olive/hunting.
  const headerShadow = hasCustomBackground
    ? isDark
      ? 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]'
      : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]'
    : '';

  // Best Day and Prime use the same strongest-opportunity score. This means
  // the banner cannot select one day while the Prime badge identifies another.
  const bestDay = daily.reduce((best, candidate) =>
    getPeakHuntScore(candidate) > getPeakHuntScore(best) ? candidate : best,
    daily[0]
  );
  const bestDayScore = getPeakHuntScore(bestDay);

  // Prefer the exact peak hour for the banner, but fall back to the daily
  // summary when it is stronger than every hourly sample.
  const bestDayPeak = (() => {
    if (!bestDay.hourly || bestDay.hourly.length === 0) {
      return { score: bestDay.huntScore, label: '', isHourly: false };
    }
    let peak = bestDay.hourly[0];
    for (const h of bestDay.hourly) {
      if (h.huntScore > peak.huntScore) peak = h;
    }
    if (peak.huntScore >= bestDay.huntScore) {
      return {
        score: peak.huntScore,
        label: getHour12Label(new Date(peak.timestamp).getHours()).replace(':00 ', ' '),
        isHourly: true,
      };
    }
    return { score: bestDay.huntScore, label: '', isHourly: false };
  })();

  const renderWeatherIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sun':
        return <Sun className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
      case 'SunMedium':
        return <SunMedium className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
      case 'CloudSun':
        return <CloudSun className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
      case 'Cloud':
        return <Cloud className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />;
      case 'CloudFog':
        return <CloudFog className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />;
      case 'CloudDrizzle':
        return <CloudDrizzle className="w-7 h-7 sm:w-8 sm:h-8 text-sky-500" />;
      case 'CloudRain':
        return <CloudRain className="w-7 h-7 sm:w-8 sm:h-8 text-sky-600" />;
      case 'CloudRainWind':
        return <CloudRainWind className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />;
      case 'Snowflake':
        return <Snowflake className="w-7 h-7 sm:w-8 sm:h-8 text-sky-400" />;
      case 'CloudLightning':
        return <CloudLightning className="w-7 h-7 sm:w-8 sm:h-8 text-amber-600" />;
      default:
        return <CloudSun className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />;
    }
  };

  // 16px, muted slate icon — used in the bottom-of-card "Now" chip so the
  // glance signal defers visually to the big amber icon in the card header.
  // Mirrors renderWeatherIcon's icon registry; size & color are the only diffs.
  const renderSmallWeatherIcon = (iconName: string) => {
    const cls = 'w-4 h-4 text-slate-400 dark:text-slate-500';
    switch (iconName) {
      case 'Sun':
        return <Sun className={cls} />;
      case 'SunMedium':
        return <SunMedium className={cls} />;
      case 'CloudSun':
        return <CloudSun className={cls} />;
      case 'Cloud':
        return <Cloud className={cls} />;
      case 'CloudFog':
        return <CloudFog className={cls} />;
      case 'CloudDrizzle':
        return <CloudDrizzle className={cls} />;
      case 'CloudRain':
        return <CloudRain className={cls} />;
      case 'CloudRainWind':
        return <CloudRainWind className={cls} />;
      case 'Snowflake':
        return <Snowflake className={cls} />;
      case 'CloudLightning':
        return <CloudLightning className={cls} />;
      default:
        return <CloudSun className={cls} />;
    }
  };

  const getPressureTrendIcon = (trend: DailyForecast['pressureTrend']) => {
    switch (trend) {
      case 'rapid_drop':
        return <ArrowDownRight className="w-4 h-4 text-emerald-500" title="Barometer falling fast" />;
      case 'rapid_rise':
        return <ArrowUpRight className="w-4 h-4 text-emerald-500" title="Barometer rising after a front" />;
      case 'rising':
        return <TrendingUp className="w-4 h-4 text-sky-500" title="Barometer Rising" />;
      case 'falling':
        return <TrendingDown className="w-4 h-4 text-amber-500" title="Barometer Falling" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400" title="Barometer Steady" />;
    }
  };

  const renderRutIcon = (iconName: string, className = "w-3 h-3 shrink-0") => {
    switch (iconName) {
      case 'Trees':
        return <Trees className={className} />;
      case 'Compass':
        return <Compass className={className} />;
      case 'Sparkles':
        return <Sparkles className={className} />;
      case 'Flame':
        return <Flame className={className} />;
      case 'Lock':
        return <Lock className={className} />;
      case 'ShieldCheck':
        return <ShieldCheck className={className} />;
      case 'Snowflake':
        return <Snowflake className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

const getScoreBadgeColor = (score: number) => {
    if (theme === 'hunting') {
      if (score >= RATING_THRESHOLDS.excellent) return 'bg-[#556b2f] text-white border-[#556b2f] shadow-sm';
      if (score >= RATING_THRESHOLDS.good) return 'bg-[#556b2f] text-white border-[#556b2f] shadow-sm';
      if (score >= RATING_THRESHOLDS.okay) return 'bg-[#b8860b] text-white border-[#d9b64a] shadow-sm';
      if (score >= RATING_THRESHOLDS.slow) return 'bg-[#c85a17] text-white border-[#c85a17] shadow-sm';
      return 'bg-[#8b3a3a] text-white border-[#a85a5a] shadow-sm';
    } else if (theme === 'olive') {
      if (score >= RATING_THRESHOLDS.excellent) return 'bg-[#2d4a27] text-white border-[#556b2f] shadow-sm';
      if (score >= RATING_THRESHOLDS.good) return 'bg-[#556b2f] text-white border-[#8a9a5b] shadow-sm';
      if (score >= RATING_THRESHOLDS.okay) return 'bg-[#a08a2e] text-white border-[#c9b458] shadow-sm';
      if (score >= RATING_THRESHOLDS.slow) return 'bg-[#b87333] text-white border-[#d4a373] shadow-sm';
      return 'bg-[#8b3a3a] text-white border-[#a85a5a] shadow-sm';
    }
    if (score >= RATING_THRESHOLDS.excellent) return 'bg-emerald-800 text-white border-emerald-600 shadow-emerald-950/30';
    if (score >= RATING_THRESHOLDS.good) return 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-emerald-900/10';
    if (score >= RATING_THRESHOLDS.okay) return 'bg-yellow-500 text-slate-950 border-yellow-300 shadow-yellow-900/20';
    if (score >= RATING_THRESHOLDS.slow) return 'bg-orange-600 text-white border-orange-400 shadow-orange-900/20';
    return 'bg-rose-500 text-white border-rose-400 shadow-rose-900/20';
  };

  const getCardHueClasses = (score: number, isSelected: boolean) => {
    const glass = 'backdrop-blur-md';
    // Backwoods badge palette (excellent / good / fair / poor) — used both
    // for the score chip and to tone the surrounding card border. Keeping
    // these in lock-step with getScoreBadgeColor ensures the visual cue
    // reads consistently across the dashboard.
    const pbExcellent = '#1f3a1c';
    const pbGood = '#3d5a2a';
    const pbFair = '#c44a17';
    const pbPoor = '#7a2f1a';

    if (score >= RATING_THRESHOLDS.excellent) { // Excellent - Dark green
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-emerald-700 ring-2 ring-emerald-700/40 shadow-lg shadow-emerald-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#556b2f] ring-2 ring-[#556b2f]/40 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#2d4a27] ring-2 ring-[#556b2f]/40 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-emerald-600 ring-2 ring-emerald-600/30 shadow-md shadow-emerald-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-emerald-700/30 hover:border-emerald-700/60 shadow-md shadow-emerald-950/20 hover:shadow-emerald-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/35 hover:border-[#d4c4a8]/60 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#556b2f]/35 hover:border-[#556b2f]/60 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-emerald-600/25 hover:border-emerald-600/50 shadow-sm hover:shadow-md hover:shadow-emerald-500/5 transition-all ${glass}`;
    }

    if (score >= RATING_THRESHOLDS.good) { // Good - Sage green
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#556b2f] ring-2 ring-[#556b2f]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#556b2f] ring-2 ring-[#556b2f]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-emerald-500 ring-2 ring-emerald-500/30 shadow-md shadow-emerald-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-emerald-500/30 hover:border-emerald-500/60 shadow-md shadow-emerald-950/20 hover:shadow-emerald-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/30 hover:border-[#d4c4a8]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#556b2f]/30 hover:border-[#556b2f]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-emerald-500/25 hover:border-emerald-500/50 shadow-sm hover:shadow-md hover:shadow-emerald-500/5 transition-all ${glass}`;
    }

    if (score >= RATING_THRESHOLDS.okay) { // Okay - Yellow
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-yellow-400 ring-2 ring-yellow-400/40 shadow-lg shadow-yellow-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#b8860b] ring-2 ring-[#b8860b]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#a08a2e] ring-2 ring-[#a08a2e]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-yellow-400 ring-2 ring-yellow-400/30 shadow-md shadow-yellow-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-yellow-400/30 hover:border-yellow-400/60 shadow-md shadow-yellow-950/20 hover:shadow-yellow-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/30 hover:border-[#d4c4a8]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#a08a2e]/30 hover:border-[#a08a2e]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-yellow-400/25 hover:border-yellow-400/50 shadow-sm hover:shadow-md hover:shadow-yellow-500/5 transition-all ${glass}`;
    }

    if (score >= RATING_THRESHOLDS.slow) { // Slow - Orangish/Amber
      if (isSelected) {
        return isDark
          ? `bg-slate-900/[var(--card-opacity)] border-orange-500 ring-2 ring-orange-500/40 shadow-lg shadow-orange-500/10 scale-[1.01] z-10 ${glass}`
          : theme === 'hunting'
          ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#c85a17] ring-2 ring-[#c85a17]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
          : (theme === 'olive' || theme === 'hunting')
          ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#b87333] ring-2 ring-[#b87333]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
          : `bg-white/[var(--card-opacity)] border-orange-500 ring-2 ring-orange-500/30 shadow-md shadow-orange-500/5 scale-[1.01] z-10 ${glass}`;
      }
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-orange-500/30 hover:border-orange-500/60 shadow-md shadow-orange-950/20 hover:shadow-orange-500/5 transition-all ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#d4c4a8]/30 hover:border-[#d4c4a8]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#b87333]/30 hover:border-[#b87333]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
        : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-orange-500/25 hover:border-orange-500/50 shadow-sm hover:shadow-md hover:shadow-orange-500/5 transition-all ${glass}`;
    }

    // Very Slow (< 26) - Red
    if (isSelected) {
      return isDark
        ? `bg-slate-900/[var(--card-opacity)] border-rose-500 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 scale-[1.01] z-10 ${glass}`
        : theme === 'hunting'
        ? `bg-[#eee6d6]/[var(--card-opacity)] border-[#8b3a3a] ring-2 ring-[#8b3a3a]/30 shadow-md text-[#2a1b0e] scale-[1.01] z-10 ${glass}`
        : (theme === 'olive' || theme === 'hunting')
        ? `bg-[#f7f5ed]/[var(--card-opacity)] border-[#8b3a3a] ring-2 ring-[#8b3a3a]/30 shadow-md text-[#1e2e1b] scale-[1.01] z-10 ${glass}`
        : `bg-white/[var(--card-opacity)] border-rose-500 ring-2 ring-rose-500/30 shadow-md shadow-rose-500/5 scale-[1.01] z-10 ${glass}`;
    }
    return isDark
      ? `bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-rose-500/30 hover:border-rose-500/60 shadow-md shadow-rose-950/20 hover:shadow-rose-500/5 transition-all ${glass}`
      : theme === 'hunting'
      ? `bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#8b3a3a]/30 hover:border-[#8b3a3a]/50 shadow-xs text-[#2a1b0e] transition-all ${glass}`
      : (theme === 'olive' || theme === 'hunting')
      ? `bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#8b3a3a]/30 hover:border-[#8b3a3a]/50 shadow-xs text-[#1e2e1b] transition-all ${glass}`
      : `bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-rose-500/25 hover:border-rose-500/50 shadow-sm hover:shadow-md hover:shadow-rose-500/5 transition-all ${glass}`;
  };

  return (
    <div className="w-full">
      {/* Best Day Banner — highlights the top-scoring day of the week. Uses the
          same theme-aware card background as the forecast cards (respects the
          custom-background opacity & blur settings) instead of a hard gradient. */}
      {bestDay && (
        <button
          onClick={() => {
            // Expand the best day's 7-day card WITHOUT changing the selected day
            // (that would swap the top forecast card). The effect above scrolls
            // after React commits the expanded card.
            setAutoExpandedDate(bestDay.date);
            setBestDayScrollRequest((request) => request + 1);
          }}
          className={`w-full mb-3 rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-all hover:scale-[1.002] cursor-pointer backdrop-blur-md ${
            isDark
              ? 'bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-emerald-500/50 ring-1 ring-emerald-500/20'
              : theme === 'hunting'
              ? 'bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf] border-[#556b2f]/50 text-[#2a1b0e]'
              : (theme === 'olive' || theme === 'hunting')
              ? 'bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9] border-[#556b2f]/50 text-[#1e2e1b]'
              : 'bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-emerald-300 shadow-sm'
          }`}
          title="Tap to jump to the great day"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-500 to-amber-600 shadow-md`}>
              <Award className="w-5 h-5 sm:w-6 sm:h-6 fill-slate-950 text-slate-950" />
            </div>
            <div className="min-w-0">
              <div className={`text-xs sm:text-xs font-black uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-emerald-400' : theme === 'hunting' ? 'text-[#556b2f]' : theme === 'olive' ? 'text-[#2d4a27]' : 'text-emerald-700'}`}>
                <span>Great Day to Hunt</span>
                {isPrimeDay(bestDayScore) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-600 dark:text-amber-300 border border-amber-500/35">
                    <Sparkles className="w-2.5 h-2.5" /> Great Day
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                <span className={`text-xl sm:text-2xl font-black leading-tight ${isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'}`}>
                  {bestDay.dayName}
                </span>
                <span className={`text-xs sm:text-sm font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {bestDay.dateFormatted}
                </span>
              </div>
              <div className={`text-xs sm:text-xs font-bold truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {bestDayPeak.isHourly
                  ? `Best movement window: ${bestDayPeak.score}/100 at ${bestDayPeak.label}`
                  : `Overall deer movement: ${bestDayPeak.score}/100`}
              </div>
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 -rotate-90 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
        </button>
      )}

      {/* Section heading on a theme-aware card so the title stays legible over
          any custom background photo (card respects opacity/blur settings). */}
      <div className={`mb-3 rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 backdrop-blur-md transition-colors duration-300 ${
        isDark
          ? 'bg-slate-900/[var(--card-opacity)] border-slate-700/60'
          : theme === 'hunting'
          ? 'bg-[#eee6d6]/[var(--card-opacity)] border-[#d4c4a8]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] border-[#d8d2c0]'
          : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-sm'
      }`}>
        <h2 className={`text-base sm:text-lg font-black flex items-center gap-2 transition-colors duration-300 ${headerTextColor} ${headerShadow}`}>
          <Calendar className={`w-5 h-5 shrink-0 ${headerIconColor}`} />
          <span>{isExtendedView ? '14-Day Deer Forecast' : '7-Day Deer Forecast'}</span>
        </h2>
        <div className="flex flex-col items-end gap-0.5">
          {lastRefreshed && (
            <span className={`text-xs font-bold flex items-center gap-1 transition-colors duration-300 ${headerTextColor}`}>
              <RefreshCw className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Last refreshed {lastRefreshed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            </span>
          )}
          <span className={`text-xs sm:text-[13px] font-medium transition-colors duration-300 ${headerTextColor} opacity-75`}>
            Tap a day for hourly weather and moon times
          </span>
        </div>
      </div>

      {/* The extended forecast action belongs to the section header, so it is
          immediately discoverable without making the user scan past all seven
          cards. */}
      {hasExtendedForecast && !isExtendedView && (
        <button
          type="button"
          onClick={() => {
            if (onOpenFourteenDay) onOpenFourteenDay();
            else setShowFourteenDay(true);
          }}
          aria-label="View 14-day hunting forecast"
          className={`mb-3 w-full sm:w-auto self-center group inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl border text-xs sm:text-sm font-black uppercase tracking-wider transition-all cursor-pointer ${
            isDark || theme === 'hunting' || theme === 'olive' ? 'shadow-none' : 'shadow-sm'
          } hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 backdrop-blur-md ${
            isDark
              ? 'bg-slate-900/[var(--card-opacity)] hover:bg-slate-900/[calc(var(--card-opacity)*1.15)] border-slate-700/60 text-emerald-300 focus-visible:ring-emerald-400 focus-visible:ring-offset-slate-950'
              : theme === 'hunting'
              ? 'bg-[#eee6d6]/[var(--card-opacity)] hover:bg-[#eae1cf]/[var(--card-opacity)] border-[#d4c4a8] text-[#7a3208] focus-visible:ring-[#c85a17] focus-visible:ring-offset-[#f4eee1]'
              : theme === 'olive'
              ? 'bg-[#f7f5ed]/[var(--card-opacity)] hover:bg-[#efebd9]/[var(--card-opacity)] border-[#d8d2c0] text-[#3d4f21] focus-visible:ring-[#556b2f] focus-visible:ring-offset-[#efebd9]'
              : 'bg-white/[var(--card-opacity)] hover:bg-white/[calc(var(--card-opacity)*1.02)] border-slate-200 text-emerald-800 focus-visible:ring-emerald-600 focus-visible:ring-offset-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>View {Math.max(7, (dailyAll?.length || daily.length))}-Day Forecast</span>
          <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Day cards: a vertical stack on mobile/tablet, and a 2-column grid on
          desktop so all seven days stay visible without a long scroll. The
          expanded (selected) card spans both columns to keep its detail
          content full-width and readable. */}
      <div className="flex flex-col gap-3.5 xl:grid xl:grid-cols-2 xl:gap-4 xl:items-start">
        {daily.map((day) => {
          const isSelected = day.date === selectedDate;
          const isExpanded = isSelected || day.date === autoExpandedDate;
          // selectedHour only affects the expanded body — the collapsed card header
          // must show the DAY's summary so all seven cards agree with themselves
          // and with the day's dial. Previously the hourly slider controlled every
          // card, which produced "1.35″ rain" day cards that still read "Clear Skies".
          const hourData = selectedHour !== undefined && day.hourly && day.hourly[selectedHour] ? day.hourly[selectedHour] : null;
          // Use hourly score when slider is active so badges update dynamically
          const cardScore = hourData ? hourData.huntScore : day.huntScore;
          const cardRating = hourData ? getRatingFromScore(hourData.huntScore) : day.rating;
          const cardWeatherIcon = day.weatherIcon;
          const cardWeatherDesc = day.weatherDesc;
          const cardWindDirText = day.windDirectionText;
          const cardWindSpeed = units === 'metric'
            ? `${day.windSpeedMaxKmh} km/h`
            : `${day.windSpeedMaxMph} mph`;
          const cardPressure = pressureUnit === 'hPa'
            ? `${day.pressureAvgHpa} hPa`
            : `${day.pressureAvgInHg} inHg`;
          // Prime is a peak-movement signal: a day qualifies when its daily
          // summary or any forecast hour reaches 95+, not merely because it
          // leads this particular seven-day slice.
          const peakHour = day.hourly && day.hourly.length > 0
            ? day.hourly.reduce((peak, hour) => hour.huntScore > peak.huntScore ? hour : peak, day.hourly[0])
            : null;
          const primeScore = getPeakHuntScore(day);
          const isPrime = isPrimeDay(primeScore);
          const isPrimeExplainerOpen = expandedPrimeDate === day.date;
          const primeReasons = day.factors
            .filter((factor) => factor.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          const dayRut = getRutPhase(day.date, location);
          const hasSignificantColdFront = isSignificantColdFront(day.tempDrop24h, units);
          // Round the displayed drop to one decimal so floating-point noise
          // from the °C→°F conversion never leaks into the badge or tooltip.
          const coldFrontDrop = Math.round(day.tempDrop24h * 10) / 10;

          // Calculate maximum precipitation probability for the day
          const maxPrecipProb = day.hourly && day.hourly.length > 0
            ? Math.max(...day.hourly.map((h) => h.precipProbability || 0))
            : 0;

          return (
            <div
              key={day.date}
              id={`forecast-card-${day.date}`}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-label={`${day.dayName} ${day.dateFormatted} forecast — tap to expand`}
              onClick={() => {
                setAutoExpandedDate(null);
                onSelectDate(isSelected ? '' : day.date);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAutoExpandedDate(null);
                  onSelectDate(isSelected ? '' : day.date);
                }
              }}
              className={`relative w-full rounded-2xl border transition-all hover:scale-[1.002] cursor-pointer flex flex-col overflow-hidden ${
                isExpanded ? 'xl:col-span-2' : ''
              } ${getCardHueClasses(
                cardScore,
                isSelected
              )}`}
            >
              {/* Subtle paper texture overlay so the card has a tactile feel. */}
              <PaperTexture
                variant="fibers"
                opacity={0.18}
                blendMode="soft-light"
                tone="rgb(var(--ui-muted-rgb))"
                className="absolute inset-0 pointer-events-none rounded-2xl"
              />

              {/* COMPACT CARD HEADER (always visible, click-toggleable) */}
              {/* lg:flex-wrap + the min-width below keep this row from crushing
                  the weather summary when the card is only ~570px wide (two
                  columns in the desktop grid). The right-hand action cluster is
                  shrink-0, so without a floor on the left side it would win all
                  the space and squeeze the text column to a few pixels wide,
                  stretching each card to ~690px tall. Demanding 300px forces
                  the action row to wrap onto its own line instead, and the card
                  collapses back to a compact height. Mobile is unaffected. */}
              <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none lg:flex-wrap">
                {/* Left side: Date, Sunrise/Sunset + Weather mini summary */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 lg:min-w-[300px]">
                  <div className="flex flex-col min-w-[95px] sm:min-w-[110px] shrink-0">
                    <span className={`text-[15px] sm:text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {day.dayName}
                    </span>
                    <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {day.dateFormatted}
                    </span>
                    <div className="mt-1 flex flex-col gap-0.5 text-xs sm:text-xs font-extrabold text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1 whitespace-nowrap" title="Sunrise">
                        <Sunrise className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>{day.solunar?.sunrise || '6:30 AM'}</span>
                      </span>
                      <span className="flex items-center gap-1 whitespace-nowrap" title="Sunset">
                        <Sunset className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span>{day.solunar?.sunset || '6:45 PM'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-l pl-3.5 border-slate-700/20 min-w-0">
                    <div className="flex-shrink-0 scale-95">
                      {renderWeatherIcon(cardWeatherIcon)}
                    </div>
                    <div className="text-xs sm:text-sm min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-black block text-[13px] sm:text-[15px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {day.maxTemp}° / {day.minTemp}°{units === 'imperial' ? 'F' : 'C'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full border transition-colors ${
                            maxPrecipProb >= 40
                              ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/40'
                              : maxPrecipProb > 0
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
                              : isDark
                              ? 'bg-slate-800/60 text-slate-400 border-slate-700/50'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                          title={`Highest chance of rain: ${maxPrecipProb}%`}
                        >
                          <Droplets className="w-3 h-3 text-cyan-500 shrink-0" />
                          <span>{maxPrecipProb}% precip</span>
                        </span>
                      </div>
                      <span className={`text-xs font-bold block leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {cardWeatherDesc}
                      </span>
                      <span className="text-xs sm:text-xs font-extrabold flex w-full max-w-full items-start gap-1 leading-snug text-emerald-600 dark:text-emerald-400 mt-0.5 whitespace-normal">
                        <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="min-w-0 break-words">Best time to hunt: {getBestHuntTime(day)}</span>
                      </span>
                      <span className="text-xs sm:text-xs font-extrabold block text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap flex items-center gap-1">
                        {renderRutIcon(dayRut.iconName, "w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0")}
                        <span>Rut: {dayRut.name}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: keep Prime -> See forecast -> Score in one compact row.
                    When the header wraps at lg it takes the full card width and
                    right-aligns, so the actions still line up with the card edge. */}
                <div className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5 overflow-visible sm:w-auto sm:flex-nowrap sm:gap-2.5 shrink-0 ml-auto lg:w-full">
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 shrink-0 sm:flex-nowrap sm:gap-2.5">
                    {/* Badges container stays on one line so Prime never pushes the action or score down. */}
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 shrink-0 sm:flex-nowrap sm:gap-1.5">
                    {day.solunar?.moonPhaseName === 'Full Moon' && (
                      <div className={`text-xs font-black px-2 sm:px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1 border whitespace-nowrap ${
                        isDark
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        <Moon className="w-3 h-3 fill-current text-amber-500 shrink-0" />
                        <span>Full Moon</span>
                      </div>
                    )}

                    {isPrime && (
                      <button
                        type="button"
                        aria-label={`Explain why ${day.dayName} is a great day`}
                        aria-expanded={isPrimeExplainerOpen}
                        aria-controls={`prime-explainer-${day.date}`}
                        title="Why is this a great day?"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPrimeDate(isPrimeExplainerOpen ? null : day.date);
                        }}
                        className={`bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 ${theme === 'hunting' ? 'text-white' : 'text-slate-950'} text-[11px] sm:text-xs font-black px-2.5 sm:px-3 py-1 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-0.5 sm:gap-1 border border-amber-300 whitespace-nowrap transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1`}
                      >
                        <Award className="w-3 h-3 fill-current shrink-0" />
                        <span>Great Day</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isPrimeExplainerOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Quick action stays in the compact header so detailed predictions are
                      reachable without expanding the card first. */}
                  {onOpenDetails && (
                    <button
                      type="button"
                      aria-label={`View detailed prediction for ${day.dayName}`}
                      title="View detailed prediction"
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetails(day.date);
                      }}
                      className={`group inline-flex h-9 sm:h-10 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 sm:px-3 text-[11px] sm:text-xs font-black uppercase tracking-wide transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                        isDark
                          ? 'bg-slate-950/35 hover:bg-emerald-500/15 border-slate-700/70 text-emerald-300 focus-visible:ring-emerald-400 focus-visible:ring-offset-slate-900'
                          : theme === 'hunting'
                          ? 'bg-[#f4eee1]/70 hover:bg-[#c85a17]/10 border-[#c85a17]/35 text-[#7a3208] focus-visible:ring-[#c85a17] focus-visible:ring-offset-[#f4eee1]'
                          : theme === 'olive'
                          ? 'bg-[#f7f5ed]/70 hover:bg-[#556b2f]/10 border-[#556b2f]/35 text-[#3d4f21] focus-visible:ring-[#556b2f] focus-visible:ring-offset-[#f7f5ed]'
                          : 'bg-white/70 hover:bg-emerald-50 border-slate-300 text-emerald-700 focus-visible:ring-emerald-600 focus-visible:ring-offset-white'
                      }`}
                    >
                      <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Details</span>
                      <span className="hidden sm:inline">See forecast</span>
                    </button>
                  )}

                  {/* Fixed-width Score Badge & Arrow for 100% left-to-right alignment across all cards */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <div
                      className={`w-[104px] sm:w-[155px] shrink-0 px-1 sm:px-2.5 py-1.5 rounded-xl border font-black shadow-xs flex items-center justify-center gap-0.5 sm:gap-1.5 ${getScoreBadgeColor(
                        cardScore
                      )}`}
                    >
                      <DeerIcon className="w-3.5 h-3.5 sm:w-5 sm:h-5 fill-current shrink-0" />
                      {cardScore >= RATING_THRESHOLDS.excellent && <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-amber-350 shrink-0" />}
                      <span className="text-[13px] sm:text-base leading-none font-black">{cardScore}</span>
                      <span className="text-[11px] sm:text-xs uppercase tracking-wider font-extrabold opacity-95 whitespace-nowrap">{cardRating}</span>
                    </div>

                    {/* Dropdown Arrow */}
                    <div className={`w-5 sm:w-7 h-5 sm:h-7 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-500/10 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <ChevronDown
                        className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ease-in-out ${
                          isExpanded ? 'rotate-180' : 'rotate-0'
                        }`}
                      />
                    </div>
                  </div>
                  </div>
                </div>
              </div>

              {isPrime && isPrimeExplainerOpen && (
                <motion.div
                  id={`prime-explainer-${day.date}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.2 }}
                  role="region"
                  aria-label={`${day.dayName} great-day explanation`}
                  onClick={(e) => e.stopPropagation()}
                  className={`mx-3.5 sm:mx-4 mb-3 overflow-hidden rounded-xl border px-3 py-3 text-xs backdrop-blur-sm ${
                    isDark
                      ? 'bg-emerald-950/45 border-emerald-500/35 text-emerald-50'
                      : theme === 'hunting'
                      ? 'bg-[#fff4e6] border-[#c85a17]/35 text-[#3f2414]'
                      : theme === 'olive'
                      ? 'bg-[#eef4e5] border-[#556b2f]/35 text-[#26351e]'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <p className="font-black uppercase tracking-wider">Why this is a great-day forecast</p>
                        <p className="mt-1 leading-relaxed opacity-85">
                          The forecast reaches {primeScore}/100{peakHour && primeScore === peakHour.huntScore ? ` at ${getHour12Label(new Date(peakHour.timestamp).getHours())}` : ''}, crossing the 95+ great-day mark.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Close prime day explanation"
                      onClick={() => setExpandedPrimeDate(null)}
                      className="shrink-0 rounded-md p-1 opacity-65 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2.5 space-y-2 border-t border-current/15 pt-2.5">
                    <p className="text-xs font-black uppercase tracking-wider opacity-70">What is helping the hunt</p>
                    {primeReasons.length > 0 ? primeReasons.map((factor) => (
                      <div key={factor.name} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-extrabold">{factor.name}</p>
                          <p className="mt-0.5 leading-relaxed opacity-80">{factor.description}</p>
                        </div>
                        <span className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">+{factor.score} pts</span>
                      </div>
                    )) : (
                      <p className="leading-relaxed opacity-80">Several smaller factors combine to lift this day into the top tier.</p>
                    )}
                  </div>

                  <p className="mt-2.5 border-t border-current/15 pt-2.5 text-xs leading-relaxed opacity-70">
                    A Great Day means unusually favorable predicted movement conditions—not a guarantee of deer activity. Always verify wind direction, access, and local conditions.
                  </p>
                </motion.div>
              )}

              {/* HOUR "NOW" CHIP — small, hour-driven weather glance that updates
                  with the hourly slider. Always reserves its row so cards don't
                  reflow when the chip toggles. Hide-when-matches uses BOTH icon
                  AND desc so "Heavy Rain" vs "Light Showers" (both CloudRain)
                  still surfaces. Kept non-interactive (pointer-events none) so it
                  never intercepts the card's tap target. */}
              {((hourData && selectedHour !== undefined) || hasSignificantColdFront) && (() => {
                // Bind the hour index for clean narrowing — avoids `selectedHour!`.
                const hrDetails = hourData ? getWeatherDetails(hourData.weatherCode) : getWeatherDetails(day.weatherCode);
                const differsFromDay = hourData && (
                  hrDetails.icon !== day.weatherIcon || hrDetails.desc !== day.weatherDesc
                );
                const hourIndex = selectedHour ?? 0;
                return (
                  <div
                    data-testid="hour-now-chip"
                    aria-live="polite"
                    className={`px-3.5 sm:px-4 min-h-[30px] sm:min-h-[34px] flex flex-wrap items-center gap-2 text-xs sm:text-xs font-bold select-none border-t pointer-events-none ${
                      isDark ? 'border-slate-700/40 text-slate-400' : 'border-slate-200/80 text-slate-500'
                    }`}
                  >
                    {hourData && (differsFromDay ? (
                      <>
                        <span
                          className={`uppercase tracking-wider text-xs sm:text-xs font-extrabold shrink-0 ${
                            isDark ? 'text-emerald-400' : 'text-emerald-600'
                          }`}
                        >
                          Now&nbsp;·&nbsp;{getHour12Label(hourIndex)}
                        </span>
                        <motion.span
                          // Key on icon+desc so the crossfade fires for either change.
                          key={`${day.date}-${hrDetails.icon}-${hrDetails.desc}`}
                          initial={{ opacity: 0.35 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.18 }}
                          className="inline-flex shrink-0"
                          aria-hidden="true"
                        >
                          {renderSmallWeatherIcon(hrDetails.icon)}
                        </motion.span>
                        <span className="opacity-90">{hrDetails.desc}</span>
                      </>
                    ) : (
                      <span
                        className={`uppercase tracking-wider text-xs sm:text-xs font-extrabold ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {hrDetails.desc} · {getHour12Label(hourIndex)}
                      </span>
                    ))}
                    {hasSignificantColdFront && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-black uppercase tracking-wider whitespace-nowrap ${
                          isDark
                            ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                        title={`Significant 24-hour temperature drop: ${coldFrontDrop}°${units === 'imperial' ? 'F' : 'C'}`}
                        aria-label="Cold front forecast"
                      >
                        <Snowflake className="w-3 h-3 shrink-0" />
                        <span>COLD FRONT!</span>
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* EXPANDED CONTENT AREA WITH SLIDE DOWN ANIMATION */}
              <motion.div
                initial={false}
                animate={{
                  height: isExpanded ? 'auto' : 0,
                  opacity: isExpanded ? 1 : 0,
                }}
                transition={{
                  duration: isExpanded ? 0.35 : 0,
                  ease: [0.04, 0.62, 0.23, 0.98], // elegant spring-like ease
                }}
                className="overflow-hidden"
              >
                <div className="theme-expanded-content px-4 pb-4 sm:px-5 sm:pb-5 border-t border-slate-500/15">
                  {/* Highlight & Status Badges */}
                  <div className="flex flex-wrap gap-1.5 mt-3.5 mb-3.5">
                    {/* Semi-rectangular Pill Style Badge for Rut Status */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-black rounded-lg border-2 ${dayRut.badgeStyle}`}
                    >
                      {renderRutIcon(dayRut.iconName, "w-3.5 h-3.5 shrink-0")}
                      <span>Rut: {dayRut.name}</span>
                    </span>

                    {hasSignificantColdFront && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          isDark
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        <Snowflake className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-300" />
                        <span>-{coldFrontDrop}°{units === 'imperial' ? 'F' : 'C'} Drop</span>
                      </span>
                    )}
                    {day.isPostStorm && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          isDark
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <CloudRain className="w-3.5 h-3.5 shrink-0 text-emerald-500 dark:text-emerald-300" />
                        <span>Post-Storm Activity</span>
                      </span>
                    )}
                    {(day.pressureTrend === 'rapid_drop' || day.pressureTrend === 'rapid_rise') && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          isDark
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-300" />
                        <span>Baro Front Shift</span>
                      </span>
                    )}
                  </div>

                  {/* Weather & Temp */}
                  <div className="flex items-center gap-3.5 my-3">
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-100/[var(--card-opacity)] border-slate-200'
                      }`}
                    >
                      {renderWeatherIcon(hourData ? getWeatherDetails(hourData.weatherCode).icon : day.weatherIcon)}
                    </div>
                    <div>
                      <div className={`text-xl sm:text-2xl font-black flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {hourData ? (
                          <>
                            <span>{hourData.temp}°</span>
                            <span className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              ({day.maxTemp}° / {day.minTemp}°{units === 'imperial' ? 'F' : 'C'})
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{day.maxTemp}°</span>
                            <span className={`text-base font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              / {day.minTemp}°{units === 'imperial' ? 'F' : 'C'}
                            </span>
                          </>
                        )}
                      </div>
                      <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {hourData ? hourData.weatherDesc : day.weatherDesc}
                      </p>
                    </div>
                  </div>

                  {/* Barometer, Wind & Rain Precip Grid */}
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-3 gap-3 my-3 py-3 border-y text-[13px] sm:text-sm ${
                      isDark ? 'border-slate-800/80' : 'border-slate-200'
                    }`}
                  >
                    {/* Barometer */}
                    <div className="flex items-center gap-2.5">
                      <Gauge className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <div>
                        <div className={`flex items-center gap-1 font-bold text-sm sm:text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          <span>{cardPressure}</span>
                          {getPressureTrendIcon(day.pressureTrend)}
                        </div>
                        <span className={`text-xs capitalize font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {day.pressureTrend.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Wind */}
                    <div className="flex items-center gap-2.5">
                      <Wind className="w-5 h-5 text-sky-500 flex-shrink-0" />
                      <div>
                        <div className={`font-bold text-sm sm:text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {cardWindDirText} {cardWindSpeed}
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Wind Vector</span>
                      </div>
                    </div>

                    {/* Rain Precip */}
                    <div className="flex items-center gap-2.5 col-span-2 sm:col-span-1">
                      <Droplets className="w-5 h-5 text-cyan-500 flex-shrink-0" />
                      <div>
                        <div className={`font-bold text-sm sm:text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {maxPrecipProb}% <span className="text-xs font-normal opacity-80">({units === 'imperial' ? `${day.precipSumInches || 0} in` : `${day.precipSumMm || 0} mm`})</span>
                        </div>
                        <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Precip Risk</span>
                      </div>
                    </div>
                  </div>

                  {/* Sunrise & Sunset Row */}
                  <div
                    className={`mt-2 pt-2 border-t text-[13px] sm:text-sm flex items-center justify-between font-bold ${
                      isDark ? 'border-slate-800/60 text-slate-300' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sunrise className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs uppercase font-extrabold opacity-75">Sunrise:</span>
                      <span className="text-sm">{day.solunar?.sunrise || '6:30 AM'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Sunset className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      <span className="text-xs uppercase font-extrabold opacity-75">Sunset:</span>
                      <span className="text-sm">{day.solunar?.sunset || '6:45 PM'}</span>
                    </span>
                  </div>

                  {/* Hunt Windows Preview */}
                  <div
                    className={`mt-2.5 pt-2.5 border-t text-[13px] sm:text-sm flex flex-col gap-1.5 ${
                      isDark ? 'border-slate-800/40' : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4.5 h-4.5" /> AM Morning Hunt:
                      </span>
                      <span>{day.morningPrime}</span>
                    </div>
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-bold text-sm">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4.5 h-4.5" /> PM Evening Hunt:
                      </span>
                      <span>{day.eveningPrime}</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            </div>
          );
        })}

      </div>

      {/* 14-day forecast modal — slides in over the dashboard, theme-aware,
          showing every day from index 7 onward with the same scoring language
          the user already understands from the 7-day cards. */}
      {showFourteenDay && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fourteen-day-modal-title"
        >
          {/* Backdrop dims and blocks clicks outside the sheet */}
          <button
            type="button"
            aria-label="Close 14-day forecast modal"
            onClick={() => setShowFourteenDay(false)}
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
          />
          <div
            className={`relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : theme === 'hunting'
                ? 'bg-[#f4eee1] border-[#d4c4a8] text-[#2a1b0e]'
                : theme === 'olive'
                ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal header — title, playback endpoint, close button */}
            <div
              className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3 ${
                isDark ? 'border-slate-700/60' : theme === 'hunting' ? 'border-[#d4c4a8]/60' : theme === 'olive' ? 'border-[#d8d2c0]/60' : 'border-slate-200'
              }`}
            >
              <div className="min-w-0">
                <h2
                  id="fourteen-day-modal-title"
                  className={`text-base sm:text-lg font-black flex items-center gap-2 ${isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'}`}
                >
                  <Calendar className={`w-5 h-5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  <span>14-Day Hunting Forecast</span>
                </h2>
                <p
                  className={`text-xs sm:text-xs mt-0.5 ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-500'}`}
                >
                  Extended outlook — confidence fades after day 7
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFourteenDay(false)}
                aria-label="Close"
                className={`p-2 rounded-xl transition-colors cursor-pointer flex-shrink-0 ${
                  isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : theme === 'hunting'
                    ? 'text-[#8b7355] hover:text-[#7a3208] hover:bg-[#eae1cf]'
                    : theme === 'olive'
                    ? 'text-[#6e6a5e] hover:text-[#1e2e1b] hover:bg-[#e8e3d3]'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Confidence caveat — visible only once per modal open so the
                hunter knows the 8-14d scores are model guidance, not a guarantee. */}
            <div
              className={`mx-4 sm:mx-6 mt-4 px-3 py-2 rounded-xl text-xs sm:text-xs font-semibold border flex items-start gap-2 ${
                isDark
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                  : theme === 'hunting'
                  ? 'bg-[#c85a17]/10 border-[#c85a17]/40 text-[#7a3208]'
                  : theme === 'olive'
                  ? 'bg-[#b87333]/10 border-[#b87333]/40 text-[#5c3d10]'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Days 8-14 are model-only forecasts with lower confidence. Use them for
                broad planning (vacation timing, scouting visits), not for picking a stand.
              </span>
            </div>

            {/* Scrollable list of extended-range days. Each row mirrors the
                7-day card language so the user already knows how to read it. */}
            <div className="overflow-y-auto px-4 sm:px-6 py-4 flex-1">
              <ul className="flex flex-col gap-2.5">
                {extendedDays.map((day, idx) => {
                  const extendedIdx = 7 + idx + 1; // 1-indexed day count from "today"
                  const rating = getRatingFromScore(day.huntScore);
                  const ratingColor = rating === 'Great'
                    ? isDark ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40' : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                    : rating === 'Good'
                    ? isDark ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : rating === 'Okay'
                    ? isDark ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' : 'text-yellow-700 bg-yellow-50 border-yellow-200'
                    : rating === 'Slow'
                    ? isDark ? 'text-orange-300 bg-orange-500/10 border-orange-500/30' : 'text-orange-700 bg-orange-50 border-orange-200'
                    : isDark ? 'text-rose-300 bg-rose-500/10 border-rose-500/30' : 'text-rose-700 bg-rose-50 border-rose-200';

                  const lowConfidence = idx + 7 >= 8
                    ? isDark ? 'border-dashed border-amber-500/50' : 'border-dashed border-amber-300'
                    : '';
                  const dayName = day.dayName === 'Today' ? 'Today' : day.dayName === 'Tomorrow' ? 'Tomorrow' : day.dayName;

                  return (
                    <li
                      key={day.date}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelectDate(day.date);
                        setShowFourteenDay(false);
                        if (onOpenDetails) onOpenDetails(day.date);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectDate(day.date);
                          setShowFourteenDay(false);
                          if (onOpenDetails) onOpenDetails(day.date);
                        }
                      }}
                      className={`group cursor-pointer rounded-xl border-2 px-3 py-2.5 sm:px-4 sm:py-3 transition-all flex items-center gap-3 hover:scale-[1.005] ${lowConfidence} ${
                        isDark
                          ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700'
                          : theme === 'hunting'
                          ? 'bg-[#eee6d6] hover:bg-[#eae1cf] border-[#d4c4a8]'
                          : theme === 'olive'
                          ? 'bg-[#efebd9] hover:bg-[#e8e3d3] border-[#d4cebc]'
                          : 'bg-slate-50 hover:bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center min-w-[3rem] sm:min-w-[3.5rem] text-center">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-500'}`}>
                          {idx + 7 >= 8 ? `Day ${extendedIdx}` : dayName}
                        </span>
                        <span className={`text-xs mt-0.5 font-semibold ${isDark ? 'text-slate-300' : theme === 'hunting' ? 'text-[#5c4a32]' : theme === 'olive' ? 'text-[#3d4f21]' : 'text-slate-600'}`}>
                          {day.dateFormatted}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center gap-2 ${isDark ? 'text-white' : theme === 'hunting' ? 'text-[#2a1b0e]' : theme === 'olive' ? 'text-[#1e2e1b]' : 'text-slate-900'}`}>
                          <span className="text-sm font-black truncate">{day.weatherDesc}</span>
                        </div>
                        <div className={`text-xs sm:text-xs font-semibold ${isDark ? 'text-slate-400' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-500'}`}>
                          {day.maxTemp}°/{day.minTemp}°
                          {units === 'imperial' ? 'F' : 'C'}
                          {' · '}
                          {day.windDirectionText} {units === 'imperial' ? `${day.windSpeedMaxMph} mph` : `${day.windSpeedMaxKmh} km/h`}
                          {day.precipSumMm > 0 ? ` · ${day.precipSumInches.toFixed(2)} in` : ''}
                        </div>
                      </div>

                      <div className={`px-2.5 py-1 rounded-lg border font-black text-xs flex flex-col items-center justify-center min-w-[3.2rem] ${ratingColor}`}>
                        <span className="text-base leading-none">{day.huntScore}</span>
                        <span className="text-[11px] mt-0.5 opacity-80 uppercase tracking-wide">{rating}</span>
                      </div>

                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                          isDark ? 'text-slate-500' : theme === 'hunting' ? 'text-[#8b7355]' : theme === 'olive' ? 'text-[#6e6a5e]' : 'text-slate-400'
                        }`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>

            <div
              className={`px-4 sm:px-6 py-3 border-t text-xs sm:text-xs text-center ${isDark ? 'border-slate-700/60 text-slate-500' : 'border-slate-200 text-slate-500'}`}
            >
              Tap any day to jump to the full prediction view.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
