import React, { useState } from 'react';
import { DailyForecast, Location, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit } from '../types';
import { WindCompass } from './WindCompass';
import { PressureChart } from './PressureChart';
import { DeerIcon } from './DeerIcon';
import { RutStatusModal } from './RutStatusModal';
import { RutPhaseIcon } from './RutPhaseIcon';
import { PaperTexture } from './PaperTexture';
import { getHour12Label, getRatingFromScore, getWeatherDetails, getBestHuntTime, calculateHuntScore, getBestStandForWind, getDetailedConditionExplanation, RATING_THRESHOLDS } from '../utils/huntingEngine';
import { getRutPhase } from '../utils/rutEngine';
import {
  Sunrise,
  Sunset,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Moon,
  Clock,
  Compass,
  Gauge,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  Wind,
  Droplets,
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudLightning,
  Info,
  Calendar,
  Star,
  Undo2,
  Crosshair,
  MapPin,
  BarChart3,
} from 'lucide-react';

interface DayDetailViewProps {
  day: DailyForecast;
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  forecastCards?: React.ReactNode;
  selectedHour?: number;
  onSelectHour?: (hour: number) => void;
  isToday?: boolean;
  onResetToToday?: () => void;
  onSelectLocation?: (loc: Location) => void;
  hasCustomBackground?: boolean;
}

const getWeatherIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'Sun':
    case 'SunMedium':
      return <Sun className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'CloudSun':
      return <CloudSun className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    case 'Cloud':
      return <Cloud className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    case 'CloudFog':
      return <CloudFog className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    case 'CloudDrizzle':
      return <CloudDrizzle className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case 'CloudRain':
    case 'CloudRainWind':
      return <CloudRain className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    case 'Snowflake':
      return <Snowflake className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
    case 'CloudLightning':
      return <CloudLightning className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    default:
      return <Cloud className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  }
};

export const DayDetailView: React.FC<DayDetailViewProps> = ({
  day,
  location,
  units,
  pressureUnit,
  theme,
  isDark = theme === 'dark',
  forecastCards,
  selectedHour,
  onSelectHour,
  isToday = true,
  onResetToToday,
  onSelectLocation,
  hasCustomBackground = false,
}) => {
  const [showFactors, setShowFactors] = useState(true);
  const [isRutModalOpen, setIsRutModalOpen] = useState(false);
  const [showWeatherExplanation, setShowWeatherExplanation] = useState(false);

  const rutInfo = getRutPhase(day.date, location);

  const hourData = selectedHour !== undefined && day.hourly && day.hourly[selectedHour] ? day.hourly[selectedHour] : null;
  const currentScore = hourData ? hourData.huntScore : day.huntScore;
  const currentRating = hourData ? getRatingFromScore(hourData.huntScore) : day.rating;
  const currentIconName = hourData ? getWeatherDetails(hourData.weatherCode).icon : day.weatherIcon;
  const currentWindDeg = hourData ? hourData.windDirectionDeg : day.windDirectionDeg;
  const currentWindSpeed = hourData ? hourData.windSpeedMph : day.windSpeedMaxMph;
  const currentWindText = hourData ? hourData.windDirectionText : day.windDirectionText;
  const currentWindSummary = hourData
    ? `${units === 'imperial' ? `${hourData.windSpeedMph} mph` : `${hourData.windSpeedKmh} km/h`} ${hourData.windDirectionText}`
    : `${units === 'imperial' ? `${day.windSpeedMaxMph} mph` : `${day.windSpeedMaxKmh} km/h`} ${day.windDirectionText}`;

  const scrollToWindPlotter = () => {
    document.getElementById('wind-plotter')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToPressureChart = () => {
    document.getElementById('barometer-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const condExplanation = getDetailedConditionExplanation(day, hourData, units, pressureUnit);
  const weatherExplanationLabel = `${selectedHour !== undefined ? 'Why is this hour' : 'Why is this day'} ${
    currentRating === 'Okay' || currentRating === 'Slow' ? `only ${currentRating.toLowerCase()}` : currentRating.toLowerCase()
  }?`;

  const isExcellentDay = currentScore >= RATING_THRESHOLDS.excellent;
  const isGoodDay = currentScore >= RATING_THRESHOLDS.good && currentScore < RATING_THRESHOLDS.excellent;
  const isModerateDay = currentScore >= RATING_THRESHOLDS.okay && currentScore < RATING_THRESHOLDS.good;
  const isSlowDay = currentScore >= RATING_THRESHOLDS.slow && currentScore < RATING_THRESHOLDS.okay;
  const isPoorDay = currentScore < RATING_THRESHOLDS.slow;

  const activeFactors = React.useMemo(() => {
    if (selectedHour !== undefined && day.hourly && day.hourly[selectedHour]) {
      const h = day.hourly[selectedHour];
      return calculateHuntScore({
        tempDrop24h: h.tempDrop24h !== undefined ? h.tempDrop24h : day.tempDrop24h,
        maxTempF: h.temp,
        minTempF: day.minTemp,
        pressureInHg: h.pressureInHg,
        pressureTrend: h.pressureTrend ?? day.pressureTrend,
        windMph: h.windSpeedMph,
        weatherCode: h.weatherCode,
        isPostStorm: day.isPostStorm && h.weatherDesc === 'Rain Break',
        humidity: h.humidity ?? null,
        cloudCover: h.cloudCover ?? null,
        tempDeltaF: h.tempDeltaF ?? null,
        windGustMph: h.windGustMph ?? null,
        // Use the exact per-hour rain-break signal weatherService stamped on
        // the hour so the factor panel always agrees with the dial's score.
        hasRainBreak: h.weatherDesc === 'Rain Break',
        solunar: day.solunar,
        solunarRating: h.solunarRating,
        hour: selectedHour,
        isPrimeWindow: h.isPrimeWindow,
        units,
        pressureUnit,
        dateStr: day.date,
        location,
      }).factors;
    }
    return day.factors;
  }, [selectedHour, day, units, pressureUnit, location]);

  const scoreStrokeColor = (() => {
    if (theme === 'hunting') {
      if (isDark) {
        if (currentScore >= RATING_THRESHOLDS.excellent) return '#556b2f';
        if (currentScore >= RATING_THRESHOLDS.good) return '#556b2f';
        if (currentScore >= RATING_THRESHOLDS.okay) return '#d9b64a';
        if (currentScore >= RATING_THRESHOLDS.slow) return '#d08a4d';
        return '#c5675c';
      }
      if (currentScore >= RATING_THRESHOLDS.excellent) return '#556b2f';
      if (currentScore >= RATING_THRESHOLDS.good) return '#556b2f';
      if (currentScore >= RATING_THRESHOLDS.okay) return '#b8860b';
      if (currentScore >= RATING_THRESHOLDS.slow) return '#c85a17';
      return '#8b3a3a';
    }

    if (theme === 'olive') {
      if (isDark) {
        if (currentScore >= RATING_THRESHOLDS.excellent) return '#9aae71';
        if (currentScore >= RATING_THRESHOLDS.good) return '#7f984e';
        if (currentScore >= RATING_THRESHOLDS.okay) return '#d1b84a';
        if (currentScore >= RATING_THRESHOLDS.slow) return '#c18a4d';
        return '#c05a52';
      }
      if (currentScore >= RATING_THRESHOLDS.excellent) return '#2d4a27';
      if (currentScore >= RATING_THRESHOLDS.good) return '#556b2f';
      if (currentScore >= RATING_THRESHOLDS.okay) return '#a08a2e';
      if (currentScore >= RATING_THRESHOLDS.slow) return '#b87333';
      return '#8b3a3a';
    }

    if (isDark) {
      if (currentScore >= RATING_THRESHOLDS.excellent) return '#34d399';
      if (currentScore >= RATING_THRESHOLDS.good) return '#10b981';
      if (currentScore >= RATING_THRESHOLDS.okay) return '#fbbf24';
      if (currentScore >= RATING_THRESHOLDS.slow) return '#d97706';
      return '#f43f5e';
    }

    if (currentScore >= RATING_THRESHOLDS.excellent) return '#047857';
    if (currentScore >= RATING_THRESHOLDS.good) return '#059669';
    if (currentScore >= RATING_THRESHOLDS.okay) return '#ca8a04';
    if (currentScore >= RATING_THRESHOLDS.slow) return '#d97706';
    return '#f43f5e';
  })();

  const scoreDialFrameStyle = theme === 'hunting'
    ? { borderColor: scoreStrokeColor, outline: `4px solid ${scoreStrokeColor}55` }
    : theme === 'light' || theme === 'dark'
    ? { borderColor: scoreStrokeColor, outline: `4px solid ${scoreStrokeColor}33` }
    : undefined;

  // The engine's condition explanation supplies semantic tone classes, but
  // those classes were tuned for dark mode. Remap the rationale surface to
  // each app theme so the "What drives this score" panel stays readable.
  const explanationTone = condExplanation.badgeColor.includes('rose')
    ? 'poor'
    : condExplanation.badgeColor.includes('amber')
    ? 'fair'
    : condExplanation.badgeColor.includes('sky')
    ? 'cool'
    : 'good';

  const weatherExplanationSurface = isDark
    ? explanationTone === 'poor'
      ? 'bg-rose-950/55 border-rose-500/45 text-rose-100'
      : explanationTone === 'fair'
      ? 'bg-amber-950/55 border-amber-500/45 text-amber-100'
      : explanationTone === 'cool'
      ? 'bg-sky-950/55 border-sky-500/45 text-sky-100'
      : 'bg-emerald-950/55 border-emerald-500/45 text-emerald-100'
    : theme === 'hunting'
    ? explanationTone === 'poor'
      ? 'bg-[#fff0e8] border-[#c85a17]/40 text-[#5c2412]'
      : explanationTone === 'fair'
      ? 'bg-[#fff6df] border-[#b87333]/40 text-[#5c3d10]'
      : explanationTone === 'cool'
      ? 'bg-[#edf5f6] border-[#3f7f87]/35 text-[#21434a]'
      : 'bg-[#edf6e9] border-[#556b2f]/35 text-[#26351e]'
    : theme === 'olive'
    ? explanationTone === 'poor'
      ? 'bg-[#f8ece7] border-[#9b4b3f]/40 text-[#54231e]'
      : explanationTone === 'fair'
      ? 'bg-[#f7f0df] border-[#b87333]/40 text-[#5c3d10]'
      : explanationTone === 'cool'
      ? 'bg-[#edf4f5] border-[#4f858d]/35 text-[#23464d]'
      : 'bg-[#eef4e5] border-[#556b2f]/35 text-[#26351e]'
    : explanationTone === 'poor'
    ? 'bg-rose-50 border-rose-200 text-rose-900'
    : explanationTone === 'fair'
    ? 'bg-amber-50 border-amber-200 text-amber-900'
    : explanationTone === 'cool'
    ? 'bg-sky-50 border-sky-200 text-sky-900'
    : 'bg-emerald-50 border-emerald-200 text-emerald-900';

  const weatherExplanationHeading = isDark
    ? 'text-emerald-300'
    : theme === 'hunting'
    ? 'text-[#9a4615]'
    : theme === 'olive'
    ? 'text-[#466126]'
    : 'text-emerald-800';

  const ratingBadgeClasses = theme === 'hunting'
    ? isExcellentDay
      ? 'bg-[#556b2f] text-white border-[#556b2f]'
      : isGoodDay
      ? 'bg-[#556b2f] text-white border-[#556b2f]'
      : isModerateDay
      ? 'bg-[#b8860b] text-white border-[#d9b64a]'
      : isSlowDay
      ? 'bg-[#c85a17] text-white border-[#e08a5a]'
      : 'bg-[#8b3a3a] text-white border-[#b56b6b]'
    : isExcellentDay
    ? 'bg-emerald-800 text-white border-emerald-600'
    : isGoodDay
    ? 'bg-emerald-500 text-slate-950 border-emerald-300'
    : isModerateDay
    ? 'bg-yellow-500 text-slate-950 border-yellow-300'
    : isSlowDay
    ? 'bg-orange-600 text-white border-orange-400'
    : 'bg-rose-500 text-white border-rose-400';

  // Hunter badges use one consistent field-guide green for every green state,
  // best window, and explanation controls each have their own visual role.
  // The "Why is this day …?" toggle is the quietest badge on the hero card:
  // a translucent tint with colored text and a colored border instead of a
  // solid fill, so it reads as an info control rather than competing with the
  // solid rating / rut badges. The tint follows the day's rating tone, and the
  // open state is slightly stronger so the expand/collapse affordance reads.
  const explanationBadgeBase = isDark
    ? explanationTone === 'poor'
      ? 'bg-rose-500/10 text-rose-300 border-rose-500/40 hover:bg-rose-500/20'
      : explanationTone === 'fair'
      ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
      : explanationTone === 'cool'
      ? 'bg-sky-500/10 text-sky-300 border-sky-500/40 hover:bg-sky-500/20'
      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20'
    : theme === 'hunting'
    ? explanationTone === 'poor'
      ? 'bg-[#8b3a3a]/10 text-[#8b3a3a] border-[#8b3a3a]/40 hover:bg-[#8b3a3a]/20'
      : explanationTone === 'fair'
      ? 'bg-[#c85a17]/10 text-[#c85a17] border-[#c85a17]/40 hover:bg-[#c85a17]/20'
      : explanationTone === 'cool'
      ? 'bg-[#3f7f87]/10 text-[#3f7f87] border-[#3f7f87]/40 hover:bg-[#3f7f87]/20'
      : 'bg-[#556b2f]/10 text-[#556b2f] border-[#556b2f]/40 hover:bg-[#556b2f]/20'
    : theme === 'olive'
    ? explanationTone === 'poor'
      ? 'bg-[#9b4b3f]/10 text-[#9b4b3f] border-[#9b4b3f]/40 hover:bg-[#9b4b3f]/20'
      : explanationTone === 'fair'
      ? 'bg-[#b87333]/10 text-[#b87333] border-[#b87333]/40 hover:bg-[#b87333]/20'
      : explanationTone === 'cool'
      ? 'bg-[#4f858d]/10 text-[#4f858d] border-[#4f858d]/40 hover:bg-[#4f858d]/20'
      : 'bg-[#556b2f]/10 text-[#556b2f] border-[#556b2f]/40 hover:bg-[#556b2f]/20'
    : explanationTone === 'poor'
    ? 'bg-rose-500/10 text-rose-700 border-rose-500/40 hover:bg-rose-500/20'
    : explanationTone === 'fair'
    ? 'bg-amber-500/10 text-amber-700 border-amber-500/40 hover:bg-amber-500/20'
    : explanationTone === 'cool'
    ? 'bg-sky-500/10 text-sky-700 border-sky-500/40 hover:bg-sky-500/20'
    : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/20';

  const explanationBadgeActive = isDark
    ? explanationTone === 'poor'
      ? 'bg-rose-500/20 text-rose-200 border-rose-500/60 hover:bg-rose-500/30'
      : explanationTone === 'fair'
      ? 'bg-amber-500/20 text-amber-200 border-amber-500/60 hover:bg-amber-500/30'
      : explanationTone === 'cool'
      ? 'bg-sky-500/20 text-sky-200 border-sky-500/60 hover:bg-sky-500/30'
      : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60 hover:bg-emerald-500/30'
    : theme === 'hunting'
    ? explanationTone === 'poor'
      ? 'bg-[#8b3a3a]/20 text-[#8b3a3a] border-[#8b3a3a]/60 hover:bg-[#8b3a3a]/30'
      : explanationTone === 'fair'
      ? 'bg-[#c85a17]/20 text-[#c85a17] border-[#c85a17]/60 hover:bg-[#c85a17]/30'
      : explanationTone === 'cool'
      ? 'bg-[#3f7f87]/20 text-[#3f7f87] border-[#3f7f87]/60 hover:bg-[#3f7f87]/30'
      : 'bg-[#556b2f]/20 text-[#556b2f] border-[#556b2f]/60 hover:bg-[#556b2f]/30'
    : theme === 'olive'
    ? explanationTone === 'poor'
      ? 'bg-[#9b4b3f]/20 text-[#9b4b3f] border-[#9b4b3f]/60 hover:bg-[#9b4b3f]/30'
      : explanationTone === 'fair'
      ? 'bg-[#b87333]/20 text-[#b87333] border-[#b87333]/60 hover:bg-[#b87333]/30'
      : explanationTone === 'cool'
      ? 'bg-[#4f858d]/20 text-[#4f858d] border-[#4f858d]/60 hover:bg-[#4f858d]/30'
      : 'bg-[#556b2f]/20 text-[#556b2f] border-[#556b2f]/60 hover:bg-[#556b2f]/30'
    : explanationTone === 'poor'
    ? 'bg-rose-500/15 text-rose-700 border-rose-500/50 hover:bg-rose-500/25'
    : explanationTone === 'fair'
    ? 'bg-amber-500/15 text-amber-700 border-amber-500/50 hover:bg-amber-500/25'
    : explanationTone === 'cool'
    ? 'bg-sky-500/15 text-sky-700 border-sky-500/50 hover:bg-sky-500/25'
    : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/50 hover:bg-emerald-500/25';
  const hunterBestHuntBadgeClasses = isDark
    ? 'bg-[#556b2f] text-white border-[#556b2f]'
    : 'bg-[#556b2f] text-white border-[#556b2f]';
  const hunterSelectedHourBadgeClasses = isDark
    ? 'bg-[#3b2b1e] text-[#f3d4aa] border-[#8a5536]'
    : 'bg-[#f0dfc2] text-[#6b421f] border-[#b87333]';
  const hunterRutBadgeClasses = (() => {
    switch (rutInfo.phaseId) {
      case 'summer':
        return isDark
          ? 'bg-[#556b2f] text-white border-[#556b2f]'
          : 'bg-[#556b2f] text-white border-[#556b2f]';
      case 'early':
        return isDark
          ? 'bg-[#203b38] text-[#c5e0d8] border-[#5c8880]'
          : 'bg-[#dcebe5] text-[#28534d] border-[#5c8880]';
      case 'pre_rut':
        return isDark
          ? 'bg-[#4a2918] text-[#f4c38d] border-[#c8782f]'
          : 'bg-[#f3d4aa] text-[#6d3213] border-[#c8782f]';
      case 'peak_rut':
        return isDark
          ? 'bg-gradient-to-r from-[#7f2f16] to-[#b84e17] text-white border-[#f0a066]'
          : 'bg-gradient-to-r from-[#a64016] to-[#d36b20] text-white border-[#f0a066]';
      case 'lockdown':
        return isDark
          ? 'bg-[#40221e] text-[#f0b0a3] border-[#a85c4d]'
          : 'bg-[#ead0c6] text-[#6a2c22] border-[#a85c4d]';
      case 'post_rut':
        return isDark
          ? 'bg-[#203b38] text-[#b7d8d0] border-[#5c8880]'
          : 'bg-[#d7e2df] text-[#27534f] border-[#5c8880]';
      default:
        return isDark
          ? 'bg-[#556b2f] text-white border-[#556b2f]'
          : 'bg-[#556b2f] text-white border-[#556b2f]';
    }
  })();

  return (
    <div className="w-full space-y-3 sm:space-y-4 animate-fadeIn">
      {/* Hero Overview Header Card */}
      <div
        className={`rounded-3xl p-3 sm:p-4 border shadow-xl relative overflow-hidden transition-colors backdrop-blur-xl ${
          isDark
            ? 'bg-slate-900/[var(--card-opacity)] border-slate-700/70 text-slate-100'
            : theme === 'hunting'
            ? 'bg-[#eae1cf]/[var(--card-opacity)] border-2 border-[#c85a17]/40 text-[#2a1b0e] shadow-lg ring-1 ring-[#c85a17]/20'
            : theme === 'olive'
            ? 'bg-[#f7f5ed]/[var(--card-opacity)] border-2 border-[#556b2f]/40 text-[#1e2e1b] shadow-lg ring-1 ring-[#556b2f]/20'
            : 'bg-white/[var(--card-opacity)] border-slate-200 text-slate-900 shadow-sm'
        }`}
      >

        {/* Backwoods-only: ink wash + topographic fragment in the upper
            right of the hero card so the field-guide vibe carries into the
            most prominent surface of the app. */}
        {/* Subtle paper texture overlay (universal). */}
        <PaperTexture
          variant="wash"
          opacity={0.08}
          blendMode="soft-light"
          tone="rgb(var(--ui-muted-rgb))"
          className="absolute -top-4 -right-6 w-56 h-28"
        />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4 relative z-10">
          {/* Left: Score Dial, Date, Badges & Verdict */}
          <div className="score-summary-column flex flex-col items-center sm:items-start gap-4 w-full lg:w-auto">
            <div className="flex flex-row items-center justify-center gap-3 sm:gap-5 flex-shrink-0 self-center sm:self-auto">
              {/* Circular Gauge Score */}
              <div style={scoreDialFrameStyle} className={`relative flex items-center justify-center shrink-0 transition-all ${
                theme === 'hunting'
                  ? isDark
                    ? 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-[#24170f]/[var(--card-opacity)] border-2 shadow-xl'
                    : 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-[#eae1cf] border-2 shadow-xl'
                  : theme === 'olive'
                  ? isDark
                    ? 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-slate-950/[var(--card-opacity)] border-2 border-emerald-600/60 shadow-xl ring-4 ring-emerald-500/25'
                    : 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-[#f2efe4] border-2 border-[#556b2f] shadow-xl ring-4 ring-[#556b2f]/25'
                  : isDark
                  ? 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-slate-950/[var(--card-opacity)] border-2 shadow-xl'
                  : 'w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-full bg-white/[var(--card-opacity)] border-2 shadow-lg'
              }`}>
                {/* SVG Circle Track */}
                <svg className="absolute w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="rgb(var(--ui-border-rgb))"
                    strokeWidth="8"
                  />
                  {/* Colored Indicator */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={scoreStrokeColor}
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - currentScore / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-300 ease-out"
                  />
                </svg>
                <div className="score-dial-content text-center z-10 flex flex-col items-center justify-center">
                  <DeerIcon
                    className={`fill-current -mb-0.5 ${
                      theme === 'light' || theme === 'dark' ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-9 h-9 sm:w-11 sm:h-11'
                    }`}
                    style={{ color: scoreStrokeColor, fill: scoreStrokeColor }}
                  />
                  <div
                    className="font-black tracking-tight leading-none text-3xl sm:text-4xl"
                    style={{ color: scoreStrokeColor }}
                  >
                    {currentScore}
                  </div>
                  <div
                    className="text-xs sm:text-xs font-black uppercase tracking-wider leading-tight mt-0.5 flex items-center justify-center gap-1"
                    style={{ color: scoreStrokeColor }}
                  >
                    {isExcellentDay && <Star className="w-3 h-3" style={{ color: scoreStrokeColor, fill: scoreStrokeColor }} />}
                    <span>{getRatingFromScore(currentScore)}</span>
                  </div>
                  <div
                    className="text-xs sm:text-xs font-black uppercase tracking-widest -mt-0.5 opacity-90"
                    style={{ color: scoreStrokeColor }}
                  >
                    SCORE
                  </div>
                </div>
              </div>

              {/* Smaller Wind Dial */}
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0">
                <div
                  className={`absolute inset-0 rounded-full border shadow-sm flex items-center justify-center ${
                    isDark ? 'border-slate-800 bg-slate-950/[var(--card-opacity)]' : 'border-slate-200 bg-white/[var(--card-opacity)]'
                  }`}
                >
                  {/* Cardinal Labels */}
                  <span className={`absolute top-1 text-xs font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>N</span>
                  <span className={`absolute right-1.5 text-xs font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>E</span>
                  <span className={`absolute bottom-1 text-xs font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>S</span>
                  <span className={`absolute left-1.5 text-xs font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>W</span>

                  {/* Tick Marks */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((tick) => (
                    <div
                      key={tick}
                      className={`absolute w-0.5 h-1 ${isDark ? 'bg-slate-800/80' : 'bg-slate-200'}`}
                      style={{
                        transform: `rotate(${tick}deg) translateY(-${isDark ? 42 : 46}px)`,
                      }}
                    />
                  ))}
                  
                  {/* Central Text displaying Wind Speed and Direction */}
                  <div className="text-center z-10 flex flex-col items-center justify-center">
                    <span className="text-xs sm:text-sm font-black tracking-tighter leading-none text-amber-500">
                      {units === 'metric'
                        ? `${hourData ? Math.round(hourData.windSpeedKmh ?? hourData.windSpeedMph * 1.60934) : Math.round(day.windSpeedMaxKmh ?? day.windSpeedMaxMph * 1.60934)}`
                        : `${Math.round(hourData ? hourData.windSpeedMph : day.windSpeedMaxMph)}`
                      }
                    </span>
                    <span className={`text-xs sm:text-xs font-bold opacity-80 uppercase leading-none mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {units === 'metric' ? 'km/h' : 'mph'}
                    </span>
                    <span className="text-xs sm:text-xs font-black tracking-tight leading-none text-emerald-500 mt-1">
                      {currentWindText}
                    </span>
                  </div>

                  {/* Wind Direction Arrow */}
                  <div
                    className="absolute inset-0 pointer-events-none flex items-center justify-center transition-transform duration-700 ease-out"
                    style={{ transform: `rotate(${currentWindDeg}deg)` }}
                  >
                    <div className="flex flex-col items-center -translate-y-[34px] sm:-translate-y-[40px]">
                      <div className="w-0.5 h-4 bg-amber-500 rounded-full shadow-xs" />
                      <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[7px] border-t-amber-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Date Display: ALWAYS directly below the score dial / dials, and ALWAYS above the pill style badges */}
            <div className={`text-xs sm:text-[13px] font-black uppercase tracking-wider flex items-center gap-1.5 self-center sm:self-auto ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{day.dayName}, {day.dateFormatted}</span>
              {selectedHour !== undefined && (
                <span className={`font-extrabold px-1.5 py-0.5 rounded-lg border ${
                  theme === 'hunting'
                    ? hunterSelectedHourBadgeClasses
                    : 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/35'
                }`}>
                  @ {getHour12Label(selectedHour)}
                </span>
              )}
            </div>

            {/* Keep day navigation separate from the status badge row so it is
                always visible when viewing a future day. */}
            {!isToday && onResetToToday && (
              <div className="self-center sm:self-start">
                <button
                  type="button"
                  onClick={onResetToToday}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs sm:text-xs font-black uppercase tracking-wider whitespace-nowrap shadow-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-95 ${
                    theme === 'hunting'
                      ? 'bg-[#c85a17] hover:bg-[#b34e12] text-white border-[#e08a5a]'
                      : theme === 'olive'
                      ? 'bg-[#556b2f] hover:bg-[#4a5e27] text-white border-[#8a9a5b]'
                      : isDark
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-300'
                  }`}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Back to Today</span>
                </button>
              </div>
            )}

            {/* Pill style badges */}
            <div className="flex flex-col items-center sm:items-start gap-1.5 w-full">
              {/* Top Row Badges */}
              {/* Keep the rating and rut badges together on one centered row.
                  The compact phone sizing leaves room for both without clipping,
                  while the larger layout keeps the fuller visual treatment. */}
              <div className="flex flex-nowrap items-center justify-center gap-1 sm:gap-1.5 w-[calc(100%+1rem)] -mx-2 sm:mx-0 sm:w-full overflow-visible">
                <span
                  className={`shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-[15px] font-black uppercase tracking-tight sm:tracking-wider border flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                    ratingBadgeClasses
                  }`}
                >
                  {isExcellentDay && <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current text-amber-300" />}
                  <span>{currentRating} Hunt Forecast</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsRutModalOpen(true)}
                  className={`inline-flex shrink-0 items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-[15px] font-black uppercase tracking-tight sm:tracking-wider border-2 whitespace-nowrap cursor-pointer hover:scale-[1.04] active:scale-95 transition-all shadow-lg shadow-black/20 ring-2 ring-white/25 hover:ring-white/50 ${theme === 'hunting' ? hunterRutBadgeClasses : rutInfo.badgeStyle}`}
                  title="Click for Rut Phase Breakdown & Hunter Tips"
                >
                  {rutInfo.phaseId === 'peak_rut' && (
                    <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse motion-reduce:animate-none flex-shrink-0" />
                  )}
                  <RutPhaseIcon iconName={rutInfo.iconName} className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span>Rut: {rutInfo.name}</span>
                  <Info className="w-4 h-4 sm:w-5 sm:h-5 opacity-80 shrink-0" />
                </button>
              </div>

              {/* Centered Best Hunt Time Badge */}
              <div className="flex items-center justify-center w-full">
                <span className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider whitespace-nowrap border shadow-xs ${
                  theme === 'hunting'
                    ? hunterBestHuntBadgeClasses
                    : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-600 dark:text-emerald-400'
                }`}>
                  <Crosshair className="w-3.5 h-3.5" /> Best Hunt: {getBestHuntTime(day)}
                </span>
              </div>
            </div>

            {/* Verdict and Target */}
            <div className="flex flex-col items-center sm:items-start space-y-1 w-full">
              <h2 className={`text-lg sm:text-xl font-black leading-snug text-center sm:text-left ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {condExplanation.headline}
              </h2>

              <div className="w-full flex justify-center py-0.5">
                <button
                  type="button"
                  onClick={() => setShowWeatherExplanation((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl font-extrabold transition-all shrink-0 cursor-pointer whitespace-nowrap shadow-sm border active:scale-95 ${
                    showWeatherExplanation ? explanationBadgeActive : explanationBadgeBase
                  }`}
                  title="Click to view weather factors driving this score"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{showWeatherExplanation ? 'Hide the details ▲' : `${weatherExplanationLabel} ▼`}</span>
                </button>
              </div>

              <p className={`text-xs flex flex-wrap items-center justify-center sm:justify-start gap-2 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {location.name} {location.admin1 ? `(${location.admin1})` : ''}</span>
                <span>• Whitetail Deer Forecast</span>
              </p>

              {/* Specific Weather Score Rationale Box - Only shown when clicked */}
              {showWeatherExplanation && (
                <div className={`w-full p-2.5 rounded-xl border ${weatherExplanationSurface} backdrop-blur-sm text-left mt-1 shadow-sm space-y-0.5`}>
                  <div className={`text-xs font-black uppercase tracking-wider ${weatherExplanationHeading}`}>
                    Why the hunt looks this way
                  </div>
                  <p className={`text-xs font-medium leading-relaxed ${isDark ? 'text-slate-100' : theme === 'hunting' ? 'text-[#3f2414]' : theme === 'olive' ? 'text-[#2e4028]' : 'text-slate-800'}`}>
                    {condExplanation.detail}
                  </p>
                </div>
              )}

              {/* Current Weather Metrics Badges */}
              <div className="w-full grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1.5 sm:gap-2 mt-2 pt-2 border-t border-slate-500/20">
                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-xs'}`}>
                  {getWeatherIconComponent(currentIconName)}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-xs font-bold uppercase tracking-wider opacity-60">Condition</div>
                    <div className="text-xs font-black truncate">{hourData ? hourData.weatherDesc : day.weatherDesc}</div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-xs'}`}>
                  <Thermometer className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-xs font-bold uppercase tracking-wider opacity-60">Temperature</div>
                    <div className="text-xs font-black truncate">
                      {hourData ? `${hourData.temp}°${units === 'imperial' ? 'F' : 'C'}` : `${day.maxTemp}° / ${day.minTemp}°${units === 'imperial' ? 'F' : 'C'}`}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={scrollToWindPlotter}
                  aria-label="Scroll to the Wind and Stand Scent Plotter"
                  title="View Wind & Stand Scent Plotter"
                  className={`group appearance-none text-left w-full cursor-pointer p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:-translate-y-0.5 hover:border-sky-500/70 hover:shadow-md active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 min-w-0 ${
                    theme === 'hunting'
                      ? isDark
                        ? 'bg-[#203b38]/80 border-[#5c8880]/70 hover:bg-[#294943]'
                        : 'bg-[#edf3ed]/90 border-[#5c8880]/60 shadow-xs hover:bg-[#e1ece3]'
                      : isDark
                      ? 'bg-slate-950/[var(--card-opacity)] border-slate-800'
                      : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-xs'
                  }`}
                >
                  <Wind className="w-4 h-4 text-sky-500 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs sm:text-xs font-bold uppercase tracking-wider text-sky-700/80 dark:text-sky-300/80">Wind</span>
                    <span className="block text-xs font-black truncate">{currentWindSummary}</span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 shrink-0 text-[11px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    <span className="hidden sm:inline">View</span>
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={scrollToPressureChart}
                  aria-label="Scroll to the Rain and Barometer chart"
                  title="View Rain & Barometer chart"
                  className={`group appearance-none text-left w-full cursor-pointer p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:-translate-y-0.5 hover:border-purple-500/70 hover:shadow-md active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/70 min-w-0 ${
                    theme === 'hunting'
                      ? isDark
                        ? 'bg-[#3b2b1e]/80 border-[#b87333]/70 hover:bg-[#4a3020]'
                        : 'bg-[#f3eadb]/90 border-[#b87333]/60 shadow-xs hover:bg-[#ecdfca]'
                      : isDark
                      ? 'bg-slate-950/[var(--card-opacity)] border-slate-800'
                      : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-xs'
                  }`}
                >
                  <Gauge className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs sm:text-xs font-bold uppercase tracking-wider text-purple-700/80 dark:text-purple-300/80">Barometer</span>
                    <span className="block text-xs font-black truncate">
                      {hourData 
                        ? (pressureUnit === 'inHg' ? `${hourData.pressureInHg} inHg` : `${hourData.pressureHpa} hPa`)
                        : (pressureUnit === 'inHg' ? `${day.pressureAvgInHg} inHg` : `${day.pressureAvgHpa} hPa`)
                      }
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-0.5 shrink-0 text-[11px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
                    <span className="hidden sm:inline">View</span>
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-xs'}`}>
                  <Sunrise className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-xs font-bold uppercase tracking-wider opacity-60">Sunrise</div>
                    <div className="text-xs font-black truncate">
                      {day.solunar?.sunrise || '6:30 AM'}
                    </div>
                  </div>
                </div>

                <div className={`p-1.5 sm:p-2 rounded-xl flex items-center gap-2 border transition-all hover:border-slate-500/40 min-w-0 ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-white/[var(--card-opacity)] border-slate-200 shadow-xs'}`}>
                  <Sunset className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-xs font-bold uppercase tracking-wider opacity-60">Sunset</div>
                    <div className="text-xs font-black truncate">
                      {day.solunar?.sunset || '6:45 PM'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Prime Hunt Windows Quick Card */}
          <div
            className={`w-full lg:w-auto rounded-2xl p-2.5 sm:p-3 border flex flex-col sm:flex-row lg:flex-col gap-2 min-w-[250px] ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] backdrop-blur-md border-slate-800' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]' : 'bg-slate-50/[var(--card-opacity)] backdrop-blur-md border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 font-bold shrink-0">
                  <Sunrise className="w-4 h-4" />
                </div>
                <div>
                  <div className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Morning Hunt</div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">{day.morningPrime}</div>
                </div>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold shrink-0">
                Dawn Window
              </span>
            </div>

            <div
              className={`flex items-center justify-between gap-2.5 text-xs pt-1.5 sm:pt-0 lg:pt-1.5 border-t sm:border-t-0 lg:border-t ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 font-bold shrink-0">
                  <Sunset className="w-4 h-4" />
                </div>
                <div>
                  <div className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Evening Hunt</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-bold">{day.eveningPrime}</div>
                </div>
              </div>
              <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-bold shrink-0">
                Dusk Window
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Day Forecast Strip Directly Below Current Conditions */}
      {forecastCards}

      {/* Main responsive grid: pressure, score factors, wind, and solunar context */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 2xl:gap-8">
        {/* Left Column: Pressure Chart & Factor Breakdown */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* 24-Hour Barometer Chart */}
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

          {/* Factor Breakdown */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200'
            }`}
          >
            <div
              className="flex items-center justify-between cursor-pointer select-none mb-2"
              onClick={() => setShowFactors(!showFactors)}
            >
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-flex items-center gap-2"><BarChart3 className="w-4 h-4" /> What may get deer moving</span>
                </h3>
                <p className={`text-xs sm:text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  What is helping or hurting deer movement for {day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted})
                  {selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}
                </p>
              </div>

              <button className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                {showFactors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>

            {showFactors && (
              <div className={`space-y-3 mt-3 divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {/* Selected Day/Time Indicator */}
                <div className="pb-1.5 border-b-0 flex items-center">
                  <div className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full border ${
                    isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-emerald-400' : 'bg-slate-50/[var(--card-opacity)] border-slate-200/80 text-emerald-700'
                  }`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      Looking at: {day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted})
                      {selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}
                    </span>
                  </div>
                </div>

                {activeFactors.map((factor, idx) => {
                  const isPositive = factor.score > 0;
                  return (
                    <div key={idx} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
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

        {/* Right column: scent compass and solunar context */}
        <div className="space-y-4 sm:space-y-6">
          {/* Active Day Scent Vector Label */}
          <div className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 px-3 py-2.5 rounded-2xl border ${
            isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-700 shadow-xs'
          }`}>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span className="leading-normal">
              Wind & Scent: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{day.dayName === 'Today' ? 'Today' : day.dayName} ({day.dateFormatted}){selectedHour !== undefined ? ` @ ${getHour12Label(selectedHour)}` : ''}</span>
            </span>
          </div>

          {/* Wind & Scent Compass */}
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

          {/* Solunar & Moon Card */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
              isDark ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800 text-slate-100' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] text-[#2a1b0e]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] text-[#1e2e1b]' : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Moon className="w-4 h-4 text-amber-500" />
                <span>Moon & Deer Activity</span>
              </h3>
              <span className="text-xs text-amber-600 dark:text-amber-300 font-bold">{day.solunar.moonPhaseName}</span>
            </div>

            <div
              className={`p-3 rounded-xl border flex items-center justify-between text-xs mb-3 ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] backdrop-blur-md border-slate-800' : theme === 'hunting' ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]' : (theme === 'olive' || theme === 'hunting') ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]' : 'bg-slate-50/[var(--card-opacity)] backdrop-blur-md border-slate-200'
              }`}
            >
              <div>
                <span className={`block text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Moon Brightness</span>
                <span className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{day.solunar.moonIllumination}%</span>
              </div>
              <div className="text-right">
                <span className={`block text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sunrise / Sunset</span>
                <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {day.solunar.sunrise} / {day.solunar.sunset}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isDark ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block">Best Moon Window #1 (2 hrs)</span>
                  <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{day.solunar.major1}</span>
                </div>
                <span className="text-xs bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                  Good time to feed
                </span>
              </div>

              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isDark ? 'bg-emerald-950/30 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'
                }`}
              >
                <div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block">Best Moon Window #2 (2 hrs)</span>
                  <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{day.solunar.major2}</span>
                </div>
                <span className="text-xs bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                  Good time to feed
                </span>
              </div>

              <div
                className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                  isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800/80' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'
                }`}
              >
                <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Other Moon Windows:</span>
                <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {day.solunar.minor1} • {day.solunar.minor2}
                </span>
              </div>
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

