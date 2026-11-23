import { DailyForecast, HourlyForecast, PressureTrend, ScoreFactor, SolunarInfo, UnitSystem, PressureUnit, Location, SavedPin } from '../types';
import { getRutPhase } from './rutEngine';
import { calculateMoonTimes } from './solunar';
import { safeGetJSON } from './storage';

// Convert hPa to inHg
export function hpaToInHg(hpa: number): number {
  return Number((hpa * 0.02953).toFixed(2));
}

// Convert °C to °F
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

// Convert km/h to mph
export function kmhToMph(kmh: number): number {
  return Math.round(kmh * 0.621371);
}

// Degrees to Cardinal wind direction
export function getWindDirectionText(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

// Weather Code mapping to human description & lucide icon name
export function getWeatherDetails(code: number): { desc: string; icon: string } {
  switch (code) {
    case 0:
      return { desc: 'Clear Skies', icon: 'Sun' };
    case 1:
      return { desc: 'Mostly Clear', icon: 'SunMedium' };
    case 2:
      return { desc: 'Partly Cloudy', icon: 'CloudSun' };
    case 3:
      return { desc: 'Overcast', icon: 'Cloud' };
    case 45:
    case 48:
      return { desc: 'Foggy / Low Scent Visibility', icon: 'CloudFog' };
    case 51:
    case 53:
    case 55:
      return { desc: 'Light Drizzle', icon: 'CloudDrizzle' };
    case 61:
    case 63:
      return { desc: 'Rain', icon: 'CloudRain' };
    case 65:
      return { desc: 'Heavy Rain', icon: 'CloudRainWind' };
    case 71:
    case 73:
    case 75:
      return { desc: 'Snowfall', icon: 'Snowflake' };
    case 80:
    case 81:
    case 82:
      return { desc: 'Passing Showers', icon: 'CloudRain' };
    case 95:
    case 96:
    case 99:
      return { desc: 'Thunderstorms', icon: 'CloudLightning' };
    default:
      return { desc: 'Overcast', icon: 'Cloud' };
  }
}

export function format12HourTime(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return typeof dateInput === 'string' ? dateInput : '12:00 AM';

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
}

function formatTimeInTimezone(dateInput: Date | string, timezone?: string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return typeof dateInput === 'string' ? dateInput : '12:00 AM';
  if (!timezone) return format12HourTime(date);

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function getHour12Label(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${ampm}`;
}

/**
 * Batch 3 — single source of truth for the hunt-score rating scale.
 *
 * Five movement bands: Great (86+), Good (71-85), Okay (41-70),
 * Slow (26-40) and Very Slow (0-25). Every score-band branch in the app
 * reads from this constant: the verdict block in `calculateHuntScore`, the
 * `Great / Good / Okay / Slow / Very Slow` rating returned by
 * `getRatingFromScore`, the score-based headline fallback in
 * `getDetailedConditionExplanation`, and the dial / card colour tables in
 * `DayDetailView`, `ForecastCards`, `SimpleDashboard` and
 * `DetailedPredictionView`.
 */
export const RATING_THRESHOLDS = {
  excellent: 86, // Great
  good: 71,      // Good
  okay: 41,      // Okay
  slow: 26,      // Slow
} as const;

export function getRatingFromScore(score: number): 'Very Slow' | 'Slow' | 'Okay' | 'Good' | 'Great' {
  if (score >= RATING_THRESHOLDS.excellent) return 'Great';
  if (score >= RATING_THRESHOLDS.good) return 'Good';
  if (score >= RATING_THRESHOLDS.okay) return 'Okay';
  if (score >= RATING_THRESHOLDS.slow) return 'Slow';
  return 'Very Slow';
}

/**
 * Prime is a stricter peak-movement signal than the Great rating: a day
 * earns it when its daily summary or any hourly forecast reaches 95+.
 */
export const PRIME_DAY_THRESHOLD = 95;

export function isPrimeDay(score: number): boolean {
  return score >= PRIME_DAY_THRESHOLD;
}

/**
 * A significant cold front is a forecast temperature drop of about 9°F / 5°C
 * over 24 hours. This shared threshold keeps the score, badges, and any other
 * hunting-plan displays consistent across unit systems.
 */
export function isSignificantColdFront(
  tempDrop24h: number | null | undefined,
  units: UnitSystem
): boolean {
  if (tempDrop24h === null || tempDrop24h === undefined || !Number.isFinite(tempDrop24h)) {
    return false;
  }
  return tempDrop24h >= (units === 'metric' ? 5 : 9);
}

/**
 * Returns the strongest movement opportunity available in a day, considering
 * both the daily summary and every hourly score. Best Day and Prime badges use
 * this same value so those labels cannot point at different days.
 */
export function getPeakHuntScore(day: Pick<DailyForecast, 'huntScore' | 'hourly'>): number {
  if (!day.hourly || day.hourly.length === 0) return day.huntScore;
  return Math.max(day.huntScore, ...day.hourly.map((hour) => hour.huntScore));
}

/** True for weather codes that represent active precipitation. */
const isPrecipitatingWeatherCode = (weatherCode: number): boolean =>
  weatherCode === 51 || weatherCode === 53 || weatherCode === 55 ||
  weatherCode === 61 || weatherCode === 63 || weatherCode === 65 ||
  (weatherCode >= 71 && weatherCode <= 75) ||
  (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95;

/**
 * Shared rain-break detector used by both the weather service and display
 * explanations. The normal window is three dry hours after the last
 * meaningful rain hour. It can stretch modestly — never indefinitely — when
 * the preceding event was unusually heavy or prolonged, because the woods can
 * stay in a genuine post-storm transition longer in those cases.
 */
export function isRainBreakHourFromSeries(
  precipitationMm: number[],
  weatherCodes: number[],
  currentIndex: number,
): boolean {
  if (!Number.isInteger(currentIndex) || currentIndex <= 0 || currentIndex >= precipitationMm.length) {
    return false;
  }

  const currentPrecip = precipitationMm[currentIndex] || 0;
  const currentCode = weatherCodes[currentIndex] || 0;
  if (currentPrecip >= 0.1 || isPrecipitatingWeatherCode(currentCode)) return false;

  const isRainHour = (index: number): boolean =>
    (precipitationMm[index] || 0) >= 0.2 || isPrecipitatingWeatherCode(weatherCodes[index] || 0);

  let lastRainIndex = -1;
  for (let index = currentIndex - 1; index >= 0; index--) {
    if (isRainHour(index)) {
      lastRainIndex = index;
      break;
    }
  }
  if (lastRainIndex < 0) return false;

  const hoursSinceRain = currentIndex - lastRainIndex;
  if (hoursSinceRain < 1) return false;

  // Measure the recent event rather than treating any isolated shower from
  // earlier in the day as a prolonged post-storm setup. Up to two dry hours
  // may separate showers in the same event; a longer gap starts a new event.
  let eventRainHours = 0;
  let dryGap = 0;
  for (let index = lastRainIndex; index >= Math.max(0, lastRainIndex - 23); index--) {
    if (isRainHour(index)) {
      eventRainHours += 1;
      dryGap = 0;
    } else {
      dryGap += 1;
      if (dryGap > 2) break;
    }
  }

  const recentTotalMm = precipitationMm
    .slice(Math.max(0, lastRainIndex - 5), lastRainIndex + 1)
    .reduce((sum, amount) => sum + (amount || 0), 0);
  const lastRainAmountMm = precipitationMm[lastRainIndex] || 0;
  const lastRainCode = weatherCodes[lastRainIndex] || 0;
  const extremelyHeavy = lastRainCode === 65 || lastRainAmountMm >= 8 || recentTotalMm >= 15;
  const prolonged = eventRainHours >= 8 || (eventRainHours >= 5 && recentTotalMm >= 8);

  // Normal: 3 hours. Extremely heavy rain: up to 5. A prolonged rain event:
  // up to 6. These are deliberately bounded so a day with one old shower
  // cannot keep advertising "Rain Break" all afternoon.
  const allowedHours = prolonged ? 6 : extremelyHeavy ? 5 : 3;
  return hoursSinceRain <= allowedHours;
}

/**
 * True when a specific hour represents a recent break in rain/post-storm
 * clearing. Legacy day objects without hourly observations fail closed rather
 * than showing a stale Rain Break for the rest of the day.
 */
export function isHourlyRainBreak(day: DailyForecast, weatherCode: number, hourIndex?: number): boolean {
  if (isPrecipitatingWeatherCode(weatherCode)) return false;

  if (day.hourly && hourIndex !== undefined && hourIndex >= 0 && hourIndex < day.hourly.length) {
    return isRainBreakHourFromSeries(
      day.hourly.map((hour) => hour.precipMm || 0),
      day.hourly.map((hour) => hour.weatherCode || 0),
      hourIndex,
    );
  }

  // Conservative legacy fallback: retain only the ordinary three-hour rule
  // when a caller has no hourly series from which to evaluate exceptions.
  if (day.lastRainHour !== undefined && day.lastRainHour >= 0 && hourIndex !== undefined) {
    const hoursSinceRain = hourIndex - day.lastRainHour;
    return day.hasRainBreak === true && hoursSinceRain >= 1 && hoursSinceRain <= 3;
  }
  return false;
}

export function formatTimeRange12h(start: Date | string, end: Date | string): string {
  return `${format12HourTime(start)} - ${format12HourTime(end)}`;
}

/**
 * Display a 2-hour solunar window. When the window crosses midnight the end
 * time belongs to the next day, so append "(next day)" — otherwise a hunter
 * could read "11:00 PM - 1:00 AM" as a backwards range.
 */
function formatSolunarRange(start: Date, end: Date): string {
  const crossesMidnight = end.getDate() !== start.getDate();
  const base = formatTimeRange12h(start, end);
  return crossesMidnight ? `${base} (next day)` : base;
}

function toWindowMs(start: Date | null, end: Date | null): { start: number; end: number } | undefined {
  return start && end ? { start: start.getTime(), end: end.getTime() } : undefined;
}

/**
 * Calculates Solunar times & moon phase for a given date and location.
 *
 * Batch 2: now uses real lunar astronomy (transit, rise/set) via
 * astronomy-engine. Falls back to the legacy sunrise/sunset-offset
 * heuristic whenever the real calculation produces null values or the
 * astronomy library throws, so solunar never disappears from the
 * dashboard.
 */
export function calculateSolunar(
  dateStr: string,
  lat: number,
  lon: number,
  sunriseStr: string,
  sunsetStr: string,
  timezone?: string,
): SolunarInfo {
  const date = new Date(dateStr);

  // Sunrise/sunset arrive as absolute instants after accounting for the API's
  // fixed offset; format them in the location's IANA zone for date-specific DST.
  const sunriseTime = sunriseStr ? formatTimeInTimezone(sunriseStr, timezone) : '6:30 AM';
  const sunsetTime = sunsetStr ? formatTimeInTimezone(sunsetStr, timezone) : '6:45 PM';

  // --- Real astronomy (preferred path) ---
  const moonTimes = calculateMoonTimes(date, lat, lon);

  // Major periods: moon overhead (upper transit) and underfoot (lower transit).
  // Each is a 2-hour window centered on the transit time.
  const major1Start = moonTimes.upperTransit ? new Date(moonTimes.upperTransit.getTime() - 3600000) : null;
  const major1End = moonTimes.upperTransit ? new Date(moonTimes.upperTransit.getTime() + 3600000) : null;

  const major2Start = moonTimes.lowerTransit ? new Date(moonTimes.lowerTransit.getTime() - 3600000) : null;
  const major2End = moonTimes.lowerTransit ? new Date(moonTimes.lowerTransit.getTime() + 3600000) : null;

  // Other moon windows: moonrise and moonset, each ±1h.
  const minor1Start = moonTimes.moonrise ? new Date(moonTimes.moonrise.getTime() - 3600000) : null;
  const minor1End = moonTimes.moonrise ? new Date(moonTimes.moonrise.getTime() + 3600000) : null;

  const minor2Start = moonTimes.moonset ? new Date(moonTimes.moonset.getTime() - 3600000) : null;
  const minor2End = moonTimes.moonset ? new Date(moonTimes.moonset.getTime() + 3600000) : null;

  // --- Legacy phase / window fallback ---
  // Phase is computed from a fixed reference new moon (Jan 11, 2024)
  // and the synodic month — same formula the real calculator uses
  // underneath, so we keep it as a guaranteed fallback for when
  // astronomy throws.
  const refDate = new Date('2024-01-11').getTime();
  const diffDays = (date.getTime() - refDate) / (1000 * 60 * 60 * 24);
  const moonCycle = (diffDays % 29.530588 + 29.530588) % 29.530588;
  const fallbackPhase = moonCycle / 29.530588;
  const fallbackIllumination = Math.round((1 - Math.cos(fallbackPhase * 2 * Math.PI)) / 2 * 100);

  let fallbackPhaseName = 'New Moon';
  if (fallbackPhase > 0.03 && fallbackPhase < 0.22) fallbackPhaseName = 'Waxing Crescent';
  else if (fallbackPhase >= 0.22 && fallbackPhase <= 0.28) fallbackPhaseName = 'First Quarter';
  else if (fallbackPhase > 0.28 && fallbackPhase < 0.47) fallbackPhaseName = 'Waxing Gibbous';
  else if (fallbackPhase >= 0.47 && fallbackPhase <= 0.53) fallbackPhaseName = 'Full Moon';
  else if (fallbackPhase > 0.53 && fallbackPhase < 0.72) fallbackPhaseName = 'Waning Gibbous';
  else if (fallbackPhase >= 0.72 && fallbackPhase <= 0.78) fallbackPhaseName = 'Last Quarter';
  else if (fallbackPhase > 0.78 && fallbackPhase < 0.97) fallbackPhaseName = 'Waning Crescent';

  const srDate = sunriseStr ? new Date(sunriseStr) : new Date(new Date(dateStr).setHours(6, 30));
  const ssDate = sunsetStr ? new Date(sunsetStr) : new Date(new Date(dateStr).setHours(18, 45));

  const fallbackMajor1Start = new Date(srDate.getTime() + (fallbackPhase * 2 - 1) * 3600000 - 3600000);
  const fallbackMajor1End = new Date(fallbackMajor1Start.getTime() + 7200000);
  const fallbackMajor2Start = new Date(ssDate.getTime() + (fallbackPhase * 2 - 1) * 3600000 - 3600000);
  const fallbackMajor2End = new Date(fallbackMajor2Start.getTime() + 7200000);
  const fallbackMinor1Start = new Date(srDate.getTime() - 7200000);
  const fallbackMinor1End = new Date(fallbackMinor1Start.getTime() + 3600000);
  const fallbackMinor2Start = new Date(ssDate.getTime() + 5400000);
  const fallbackMinor2End = new Date(fallbackMinor2Start.getTime() + 3600000);

  return {
    // Nullish coalescing (??) on purpose — a real new moon has phase 0
    // and 0% illumination, so the || operator would falsely fall back to
    // the heuristic.
    moonPhase: moonTimes.moonPhase ?? fallbackPhase,
    moonPhaseName: moonTimes.moonPhaseName ?? fallbackPhaseName,
    moonIllumination: moonTimes.moonIllumination ?? fallbackIllumination,
    major1: major1Start && major1End ? formatSolunarRange(major1Start, major1End) : formatSolunarRange(fallbackMajor1Start, fallbackMajor1End),
    major2: major2Start && major2End ? formatSolunarRange(major2Start, major2End) : formatSolunarRange(fallbackMajor2Start, fallbackMajor2End),
    minor1: minor1Start && minor1End ? formatSolunarRange(minor1Start, minor1End) : formatSolunarRange(fallbackMinor1Start, fallbackMinor1End),
    minor2: minor2Start && minor2End ? formatSolunarRange(minor2Start, minor2End) : formatSolunarRange(fallbackMinor2Start, fallbackMinor2End),
    sunrise: sunriseTime,
    sunset: sunsetTime,
    // Exact epoch-ms windows so scoring/rating never re-parse the display
    // strings (which breaks windows that cross midnight). Falls back to the
    // heuristic windows whenever real astronomy produced no dates.
    solunarWindows: {
      major1: toWindowMs(major1Start, major1End) ?? toWindowMs(fallbackMajor1Start, fallbackMajor1End),
      major2: toWindowMs(major2Start, major2End) ?? toWindowMs(fallbackMajor2Start, fallbackMajor2End),
      minor1: toWindowMs(minor1Start, minor1End) ?? toWindowMs(fallbackMinor1Start, fallbackMinor1End),
      minor2: toWindowMs(minor2Start, minor2End) ?? toWindowMs(fallbackMinor2Start, fallbackMinor2End),
    },
  };
}

/**
 * Calculates deer movement hunt score (0-100) and breakdown factors
 *
 * Batch 1 (season-aware scoring + humidity + gusts):
 *   - `tempDeltaF` (optional): the temperature deviation from the matching
 *     local-hour (or prime-window) rolling 30-day normal for the location. When
 *     provided, the Temperature factor scores against deviation bands
 *     instead of absolute thresholds. When null/undefined, the legacy
 *     absolute thresholds are used so existing callers keep working.
 *   - `humidity` (optional): relative humidity 0-100. Powers the new
 *     Scent & Humidity factor.
 *   - `windGustMph` (optional): 10m wind gust. Adds a swirling-scent
 *     penalty to the Wind Speed factor when gust - sustained > 15 mph.
 *   - `cloudCover` (optional): hourly or prime-window cloud cover from 0-100.
 *     Adds a modest overcast benefit without letting clouds outweigh weather,
 *     wind, or time of day.
 */
export function calculateHuntScore(params: {
  tempDrop24h: number; // in °F or °C drop (positive if drop/cooling)
  maxTempF: number;
  minTempF: number;
  pressureInHg: number;
  pressureTrend: PressureTrend;
  windMph: number;
  weatherCode: number;
  isPostStorm: boolean;
  hasRainBreak?: boolean;
  solunar: SolunarInfo;
  hour?: number;
  isPrimeWindow?: boolean;
  /** Solunar activity for this hour/day: 'High' = inside a major moon window
   *  (overhead/underfoot), 'Medium' = inside a minor window (rise/set). For
   *  the daily call, 'High' means a major window falls inside the morning or
   *  evening prime windows. Feeds the Moon Activity factor's window bonus. */
  solunarRating?: 'High' | 'Medium' | 'Normal';
  units?: UnitSystem;
  pressureUnit?: PressureUnit;
  dateStr?: string;
  location?: Location;
  // Batch 1 additions:
  tempDeltaF?: number | null;
  humidity?: number | null;
  windGustMph?: number | null;
  cloudCover?: number | null;
}): { score: number; rating: DailyForecast['rating']; verdict: string; factors: ScoreFactor[] } {
  // Start at an intentionally neutral midpoint. Forecast conditions can help
  // choose *when* to hunt, but they cannot reliably predict animal movement
  // with the precision implied by the former, very large bonuses.
  let totalScore = 50;
  const factors: ScoreFactor[] = [];

  const isHourly = params.hour !== undefined;
  const hourLabel = isHourly ? getHour12Label(params.hour!) : '';

  const isMetric = params.units === 'metric';
  const isHpa = params.pressureUnit === 'hPa';

  const tempUnitStr = isMetric ? '°C' : '°F';
  const tempDropVal = params.tempDrop24h;
  const maxTempDisp = params.maxTempF;
  const minTempDisp = params.minTempF;

  // Convert to Fahrenheit for threshold checking if inputs are metric
  const maxTempCheckF = isMetric ? Math.round((params.maxTempF * 9) / 5 + 32) : params.maxTempF;
  const tempDropCheckF = isMetric ? Math.round((params.tempDrop24h * 9) / 5) : params.tempDrop24h;

  const pressUnitStr = isHpa ? 'hPa' : 'inHg';
  const pressDisp = isHpa ? Math.round(params.pressureInHg / 0.02953) : params.pressureInHg;

  const windUnitStr = isMetric ? 'km/h' : 'mph';
  const windDisp = isMetric ? Math.round(params.windMph * 1.60934) : params.windMph;

  // Factor 1: Temperature & hunting context.
  //
  // Seasonal deviation answers: "Is this hour warmer or cooler than what is
  // normal for this location and local clock hour?" Absolute context answers:
  // "Is the actual temperature uncomfortable or restrictive even if the recent
  // normal is also unusually warm/cold?" Both are needed for a hunting-time
  // recommendation. A 95°F afternoon should not score as comfortable merely
  // because the last 30 days were also hot.
  let tempScore = 0;
  let tempDesc = '';
  let tempStatus: ScoreFactor['status'] = 'neutral';
  let absoluteTempAdjustment = 0;
  let absoluteTempNote = '';

  const absoluteTempF = maxTempCheckF;
  if (absoluteTempF >= 95) {
    absoluteTempAdjustment = -8;
    absoluteTempNote = `Extreme heat (${maxTempDisp}${tempUnitStr}) makes a daylight sit less comfortable and usually narrows the best opportunity to shade, water, or last light.`;
  } else if (absoluteTempF >= 85) {
    absoluteTempAdjustment = -5;
    absoluteTempNote = `Very warm conditions (${maxTempDisp}${tempUnitStr}) can reduce comfortable daylight hunting opportunity.`;
  } else if (absoluteTempF >= 78) {
    absoluteTempAdjustment = -2;
    absoluteTempNote = `Warm conditions (${maxTempDisp}${tempUnitStr}) may shift the better hunt toward the edges of legal shooting time.`;
  } else if (absoluteTempF <= 10) {
    absoluteTempAdjustment = -3;
    absoluteTempNote = `Severe cold (${maxTempDisp}${tempUnitStr}) can make a long sit difficult and concentrate the best opportunity around food and sheltered cover.`;
  } else if (absoluteTempF <= 20) {
    absoluteTempAdjustment = -1;
    absoluteTempNote = `Very cold conditions (${maxTempDisp}${tempUnitStr}) are huntable but may make comfort, access, and sit length more difficult.`;
  }

  const useSeasonRelative = typeof params.tempDeltaF === 'number' && Number.isFinite(params.tempDeltaF);
  if (useSeasonRelative) {
    // `tempDeltaF` is always stored in Fahrenheit, even when the app displays
    // metric units. Convert only the explanation, never the thresholds.
    const deltaF = params.tempDeltaF as number;
    const deltaDisplay = isMetric ? Math.round((deltaF * 5) / 9) : Math.round(deltaF);
    const deltaUnit = isMetric ? '°C' : '°F';
    const signedDelta = `${deltaDisplay >= 0 ? '+' : ''}${deltaDisplay}${deltaUnit}`;
    const absoluteDelta = Math.abs(deltaDisplay);

    if (deltaF >= 12) {
      tempScore = -12;
      tempStatus = 'poor';
      tempDesc = `At ${maxTempDisp}${tempUnitStr} (${signedDelta} from seasonal normal), it's much warmer than usual for this hour. Daylight hunting opportunity may be reduced.`;
    } else if (deltaF >= 6) {
      tempScore = -7;
      tempStatus = 'poor';
      tempDesc = `At ${maxTempDisp}${tempUnitStr} (${signedDelta} from seasonal normal), it's warmer than usual. The better hunt may be near first or last light.`;
    } else if (deltaF > -6) {
      tempScore = 3;
      tempStatus = 'good';
      tempDesc = `At ${maxTempDisp}${tempUnitStr} (${signedDelta} from seasonal normal), temps are near the average for this hour. No strong temperature advantage or warning.`;
    } else if (deltaF > -14) {
      tempScore = 6;
      tempStatus = 'optimal';
      tempDesc = `At ${maxTempDisp}${tempUnitStr} (-${absoluteDelta}${deltaUnit} from seasonal normal), it's cooler than usual. This can improve daytime hunting comfort and opportunity.`;
    } else {
      // Very cold anomalies get only a limited seasonal bonus. Absolute cold
      // context below can reduce it when conditions become difficult to hunt.
      tempScore = 2;
      tempStatus = 'good';
      tempDesc = `At ${maxTempDisp}${tempUnitStr} (-${absoluteDelta}${deltaUnit} from seasonal normal), it's far below average. Cold can help, but extreme conditions may shorten a productive sit.`;
    }
  } else {
    // If the climate request is unavailable, use conservative absolute context
    // rather than pretending that a fixed temperature is seasonally optimal.
    if (absoluteTempF >= 95) {
      tempScore = -8;
      tempStatus = 'poor';
      tempDesc = `Extreme heat (${maxTempDisp}${tempUnitStr}) limits comfortable daylight hunting opportunity.`;
    } else if (absoluteTempF >= 85) {
      tempScore = -5;
      tempStatus = 'poor';
      tempDesc = `Very warm conditions (${maxTempDisp}${tempUnitStr}) may shift the better hunt toward last light.`;
    } else if (absoluteTempF >= 78) {
      tempScore = -2;
      tempStatus = 'poor';
      tempDesc = `Warm conditions (${maxTempDisp}${tempUnitStr}) can reduce comfortable daylight hunting opportunity.`;
    } else if (absoluteTempF <= 20) {
      tempScore = absoluteTempF <= 10 ? 0 : 2;
      tempStatus = absoluteTempF <= 10 ? 'neutral' : 'good';
      tempDesc = `Cold conditions (${maxTempDisp}${tempUnitStr}) can help concentrate opportunity but may make a long sit difficult.`;
    } else if (absoluteTempF <= 65) {
      tempScore = 6;
      tempStatus = 'optimal';
      tempDesc = `Cool conditions (${maxTempDisp}${tempUnitStr}) are comfortable for a daylight hunt.`;
    } else {
      tempScore = 3;
      tempStatus = 'good';
      tempDesc = `Moderate conditions (${maxTempDisp}${tempUnitStr}) provide a workable hunting window.`;
    }
  }

  // Keep this factor's range stable while ensuring an extreme actual
  // temperature cannot be hidden by a favorable seasonal anomaly.
  tempScore = Math.max(-12, Math.min(6, tempScore + (useSeasonRelative ? absoluteTempAdjustment : 0)));
  if (absoluteTempAdjustment <= -5) tempStatus = 'poor';
  else if (absoluteTempAdjustment < 0 && tempStatus === 'optimal') tempStatus = 'good';
  if (absoluteTempNote) tempDesc = `${tempDesc} ${absoluteTempNote}`;

  totalScore += tempScore;
  factors.push({
    name: 'Temperature & Hunting Context',
    score: tempScore,
    maxScore: 6,
    description: tempDesc,
    status: tempStatus,
  });

  // Factor 2: Temperature Trend. A day-to-day temperature change is useful
  // context, but it is less reliable than the current temperature and should
  // not dominate a score on its own.
  let trendScore = 0;
  let trendDesc = '';
  let trendStatus: ScoreFactor['status'] = 'neutral';

  if (tempDropCheckF >= 15) {
    trendScore = 5;
    trendStatus = 'optimal';
    trendDesc = `Big cold front! A sharp temperature drop of ${tempDropVal}${tempUnitStr} triggers massive feeding movement.`;
  } else if (tempDropCheckF >= 9) {
    trendScore = 4;
    trendStatus = 'optimal';
    trendDesc = `Cooling off fast! Temperature drop of ${tempDropVal}${tempUnitStr} (5–10°C) encourages active daylight travel.`;
  } else if (tempDropCheckF >= 4) {
    trendScore = 2;
    trendStatus = 'good';
    trendDesc = `A little cooling favors deer movement.`;
  } else if (tempDropCheckF <= -9) {
    trendScore = -4;
    trendStatus = 'poor';
    trendDesc = `Rapid warming trend (+${Math.abs(tempDropVal)}${tempUnitStr}). Sudden heat spike suppresses daylight activity.`;
  } else if (tempDropCheckF <= -5) {
    trendScore = -2;
    trendStatus = 'poor';
    trendDesc = `Warming trend (+${Math.abs(tempDropVal)}${tempUnitStr} increase) reduces open daytime movement.`;
  } else {
    trendScore = 0;
    trendStatus = 'neutral';
    trendDesc = `Stable 24h temperature trend (${tempDropVal === 0 ? '0' : tempDropVal > 0 ? `-${tempDropVal}` : `+${Math.abs(tempDropVal)}`}${tempUnitStr}).`;
  }

  totalScore += trendScore;
  factors.push({
    name: 'Temperature Change',
    score: trendScore,
    maxScore: 5,
    description: trendDesc,
    status: trendStatus,
  });

  // Factor 3: Wind Speed (Light to moderate 8-20 km/h vs Dead calm <5 km/h or Strong >30 km/h)
  // Batch 1: also penalizes gusty conditions (gust - sustained > 15 mph),
  // which spook deer via swirling scent even when sustained winds are calm.
  let windScore = 0;
  let windDesc = '';
  let windStatus: ScoreFactor['status'] = 'neutral';

  const windKmh = Math.round(params.windMph * 1.60934);

  if (windKmh >= 8 && windKmh <= 20) { // 5 to 12.5 mph
    windScore = 7;
    windStatus = 'optimal';
    windDesc = `Ideal light to moderate wind (${windDisp} ${windUnitStr}). Provides steady scent stream without making deer skittish.`;
  } else if (windKmh < 5) { // < 3 mph
    windScore = -4;
    windStatus = 'poor';
    windDesc = `Dead-calm wind (${windDisp} ${windUnitStr}). Your scent can hang around you and tip off deer.`;
  } else if (windKmh > 30) { // > 19 mph
    windScore = -8;
    windStatus = 'poor';
    windDesc = `Hard wind (${windDisp} ${windUnitStr}). Swirling scent and noisy woods push deer into thick cover.`;
  } else if (windKmh >= 5 && windKmh < 8) {
    windScore = 2;
    windStatus = 'good';
    windDesc = `Light breeze (${windDisp} ${windUnitStr}). Minimal wind noise; good for undetected movement.`;
  } else { // 21 to 30 km/h
    windScore = -2;
    windStatus = 'neutral';
    windDesc = `Breezy conditions (${windDisp} ${windUnitStr}). Focus on lee-sides of ridges and sheltered oak thickets.`;
  }

  // Gust penalty (Batch 1). Apply only when the sustained wind itself is
  // not already penalised as "strong" — strong sustained + gusts would
  // double-count. Cap the penalty at -3 so a gust spike can't outweigh a
  // calm-wind penalty.
  if (typeof params.windGustMph === 'number' && Number.isFinite(params.windGustMph)) {
    const gustMph = params.windGustMph as number;
    const gustDelta = Math.round(gustMph - params.windMph);
    if (gustDelta > 15 && windKmh <= 30) {
      const gustPenalty = -3;
      windScore += gustPenalty;
      windDesc = windDesc
        ? `${windDesc} Gusts to ${Math.round(gustMph)} mph (-${Math.abs(gustPenalty)}).`
        : `Gusty conditions: sustained ${Math.round(params.windMph)} mph, gusts ${Math.round(gustMph)} mph.`;
      if (windStatus === 'optimal') windStatus = 'good';
    }
  }

  totalScore += windScore;
  factors.push({
    name: 'Wind & Scent',
    score: windScore,
    maxScore: 7,
    description: windDesc,
    status: windStatus,
  });

  // Factor 4: Barometer. Pressure is included as a small trend cue;
  // absolute station pressure varies substantially by elevation.
  let baroScore = 0;
  let baroDesc = '';
  let baroStatus: ScoreFactor['status'] = 'neutral';

  const isStormCode = params.weatherCode === 63 || params.weatherCode === 65 || params.weatherCode >= 95;

  if (params.pressureTrend === 'rapid_rise' || (params.pressureInHg >= 30.00 && params.pressureTrend === 'rising')) {
    baroScore = 4;
    baroStatus = 'optimal';
    baroDesc = `High or rising barometer (${pressDisp} ${pressUnitStr}). Clear post-front stability triggers heavy daylight movement.`;
  } else if (params.pressureTrend === 'rapid_drop' && isStormCode) {
    baroScore = -4;
    baroStatus = 'poor';
    baroDesc = `Barometer falling fast (${pressDisp} ${pressUnitStr}) before a heavy storm. Deer may stay tucked in until it passes.`;
  } else if (params.pressureTrend === 'rapid_drop' || params.pressureTrend === 'falling') {
    baroScore = 3;
    baroStatus = 'good';
    baroDesc = `Falling barometer (${pressDisp} ${pressUnitStr}). Pre-front shift prompts deer to feed before rain.`;
  } else if (params.pressureInHg >= 29.90) {
    baroScore = 2;
    baroStatus = 'good';
    baroDesc = `High barometer (${pressDisp} ${pressUnitStr}). Clear, steady weather is usually a good sign for deer movement.`;
  } else if (params.pressureInHg < 29.70) {
    baroScore = -2;
    baroStatus = 'poor';
    baroDesc = `Low barometer (${pressDisp} ${pressUnitStr}). Deer may move less in daylight.`;
  } else {
    baroScore = 0;
    baroStatus = 'neutral';
    baroDesc = `Steady barometer (${pressDisp} ${pressUnitStr}). Normal baseline activity.`;
  }

  totalScore += baroScore;
  factors.push({
    name: 'Barometer',
    score: baroScore,
    maxScore: 4,
    description: baroDesc,
    status: baroStatus,
  });

  // Factor 5: Precipitation. A rain break is only meaningful for the specific
  // dry hour immediately after measurable rain; callers should not flag an
  // entire mixed-weather day as a post-storm event.
  let precipScore = 0;
  let precipDesc = '';
  let precipStatus: ScoreFactor['status'] = 'neutral';

  const isCurrentlyPrecipitating = params.weatherCode === 51 || 
                                   params.weatherCode === 53 || 
                                   params.weatherCode === 55 || 
                                   params.weatherCode === 61 || 
                                   params.weatherCode === 63 || 
                                   params.weatherCode === 65 || 
                                   (params.weatherCode >= 71 && params.weatherCode <= 75) || 
                                   (params.weatherCode >= 80 && params.weatherCode <= 82) || 
                                   params.weatherCode >= 95;

  if ((params.hasRainBreak || params.isPostStorm) && !isCurrentlyPrecipitating) {
    precipScore = 6;
    precipStatus = 'optimal';
    precipDesc = 'Rain just quit and the woods are clearing. Deer often step out to feed and stretch right after a break.';
  } else if (params.weatherCode === 51 || params.weatherCode === 53 || params.weatherCode === 55 || params.weatherCode === 45 || params.weatherCode === 48) {
    precipScore = 3;
    precipStatus = 'optimal';
    precipDesc = 'Light drizzle and mist can quiet your footsteps and keep deer moving under cloudy skies.';
  } else if (params.weatherCode >= 71 && params.weatherCode <= 75) {
    precipScore = 3;
    precipStatus = 'good';
    precipDesc = 'Active snowfall. Fresh snow and cold air trigger metabolic feeding surges near field edges.';
  } else if (params.weatherCode === 65 || params.weatherCode >= 95) {
    precipScore = -8;
    precipStatus = 'poor';
    precipDesc = 'Heavy rain and lightning usually send deer to thick cover.';
  } else if (params.weatherCode === 61 || params.weatherCode === 63) {
    precipScore = -3;
    precipStatus = 'poor';
    precipDesc = 'Steady rain usually keeps deer tucked into thick cover until it lets up.';
  } else {
    precipScore = 0;
    precipStatus = 'neutral';
    precipDesc = 'Clear or lightly cloudy skies — a normal day in the woods.';
  }

  totalScore += precipScore;
  factors.push({
    name: 'Rain & Snow',
    score: precipScore,
    maxScore: 7,
    description: precipDesc,
    status: precipStatus,
  });

  // Factor 6: Time of Day (Dawn/dusk prime hours vs Midday outside rut)
  let timeScore = 0;
  let timeDesc = '';
  let timeStatus: ScoreFactor['status'] = 'neutral';

  const rutInfo = params.dateStr ? getRutPhase(params.dateStr, params.location) : null;
  const isPeakRut = rutInfo?.phaseId === 'peak_rut' || rutInfo?.phaseId === 'pre_rut';

  if (isHourly) {
    const hr = params.hour!;
    if (params.isPrimeWindow) {
      timeScore = 9;
      timeStatus = 'optimal';
      timeDesc = `Best window (${hourLabel})! First 2 hours after sunrise or last 2 hours before sunset are peak travel hours.`;
    } else if (hr >= 11 && hr <= 14) {
      if (isPeakRut) {
        timeScore = 2;
        timeStatus = 'good';
        timeDesc = `Midday shift during Peak Rut (${hourLabel}). Bucks actively cruise bedding areas all day seeking estrous does.`;
      } else {
        timeScore = -5;
        timeStatus = 'poor';
        timeDesc = `Midday lull (${hourLabel}). Outside the rut, deer remain bedded in deep security cover during warm midday hours.`;
      }
    } else {
      timeScore = 0;
      timeStatus = 'neutral';
      timeDesc = `An ordinary movement hour (${hourLabel}). Moon phase: ${params.solunar.moonPhaseName}.`;
    }
  } else {
    timeScore = 4;
    timeStatus = 'good';
    timeDesc = `First light and the last hour before dark are your best bets. Moon phase: ${params.solunar.moonPhaseName}.`;
  }

  totalScore += timeScore;
  factors.push({
    name: 'Best Time of Day',
    score: timeScore,
    maxScore: 9,
    description: timeDesc,
    status: timeStatus,
  });

  // Factor 7: Rut Phase (Pre-rut, seeking, chasing, peak rut vs early/post-rut/summer)
  let rutScore = 0;
  let rutDesc = '';
  let rutStatus: ScoreFactor['status'] = 'neutral';

  if (rutInfo) {
    if (rutInfo.phaseId === 'peak_rut' || rutInfo.phaseId === 'pre_rut') {
      rutScore = 6;
      rutStatus = 'optimal';
      rutDesc = `Active rut (${rutInfo.name}): Pre-rut scraping, seeking, and chasing frenzy! Daylight buck movement is at its seasonal peak.`;
    } else if (rutInfo.phaseId === 'lockdown') {
      rutScore = 2;
      rutStatus = 'good';
      rutDesc = `Lockdown Phase: Bucks are paired with receptive does in thick cover. Cruising drops but trophy bucks are present.`;
    } else if (rutInfo.phaseId === 'early' || rutInfo.phaseId === 'post_rut') {
      rutScore = 0;
      rutStatus = 'neutral';
      rutDesc = `${rutInfo.name}: Early or post-rut patterns. Buck daylight travel is moderate and tightly tied to feeding areas.`;
    } else {
      rutScore = -2;
      rutStatus = 'poor';
      rutDesc = `${rutInfo.name}: Outside active rut periods. Bucks follow strict bed-to-feed nocturnal or low-activity routines.`;
    }
  } else {
    rutScore = 0;
    rutStatus = 'neutral';
    rutDesc = 'Standard seasonal patterns apply.';
  }

  totalScore += rutScore;
  factors.push({
    name: 'Rut & Buck Movement',
    score: rutScore,
    maxScore: 6,
    description: rutDesc,
    status: rutStatus,
  });

  // Factor 8: Solunar activity. Moon phase and the calculated feeding periods
  // are a supporting signal; cap their contribution so they complement rather
  // than override current weather, wind, and the time of day.
  let solunarScore = 0;
  let solunarDesc = '';
  let solunarStatus: ScoreFactor['status'] = 'neutral';

  const moonPhaseName = params.solunar?.moonPhaseName || 'New Moon';
  const moonIllumination = params.solunar?.moonIllumination !== undefined ? params.solunar.moonIllumination : 0;

  if (moonPhaseName === 'Full Moon') {
    solunarScore = 3;
    solunarStatus = 'optimal';
    solunarDesc = `Full Moon (${moonIllumination}% illumination). Strong moon conditions can increase movement around the listed best moon windows.`;
  } else if (moonPhaseName === 'New Moon') {
    solunarScore = 2;
    solunarStatus = 'good';
    solunarDesc = `New Moon (${moonIllumination}% illumination). Favorable dark-night conditions support normal dawn and dusk movement.`;
  } else if (moonPhaseName === 'Waxing Gibbous' || moonPhaseName === 'Waning Gibbous') {
    solunarScore = 1;
    solunarStatus = 'good';
    solunarDesc = `Gibbous moon (${moonIllumination}% illumination). Moderate solunar lift, especially near the best moon windows.`;
  } else {
    solunarScore = 0;
    solunarStatus = 'neutral';
    solunarDesc = `${moonPhaseName} (${moonIllumination}% brightness). The moon is only a small clue today, so watch the weather and wind first.`;
  }

  // Batch 4: the real solunar windows (moon overhead/underfoot = major,
  // moonrise/moonset = minor) now feed the score instead of phase alone.
  // Hourly calls bump hours that fall inside a window; the daily call bumps
  // days where a window overlaps the morning/evening prime windows.
  let windowBonus = 0;
  if (params.solunarRating === 'High') {
    windowBonus = isHourly ? 3 : 2;
    solunarStatus = 'optimal';
    solunarDesc = isHourly
      ? `Inside a MAJOR moon window (moon overhead or underfoot) at ${hourLabel}. ${solunarDesc}`
      : `A major moon window (moon overhead or underfoot) falls inside your morning or evening hunt. ${solunarDesc}`;
  } else if (params.solunarRating === 'Medium') {
    windowBonus = 1;
    solunarStatus = 'good';
    solunarDesc = isHourly
      ? `Inside a MINOR moon window (moonrise or moonset) at ${hourLabel}. ${solunarDesc}`
      : `A minor moon window (moonrise or moonset) falls inside your morning or evening hunt. ${solunarDesc}`;
  }
  solunarScore += windowBonus;

  totalScore += solunarScore;
  factors.push({
    name: 'Moon Activity',
    score: solunarScore,
    maxScore: 6,
    description: solunarDesc,
    status: solunarStatus,
  });

  // Factor 9 (Batch 1): Scent & Humidity. Humidity is already fetched from
  // Open-Meteo (relativehumidity_2m) but was previously discarded; this
  // makes it a small but meaningful driver of deer scent-detection
  // conditions. Wet ground silences footsteps, high humidity holds scent
  // in thermals; very dry air means crunchy leaves and sinking scent.
  let scentScore = 0;
  let scentDesc = '';
  let scentStatus: ScoreFactor['status'] = 'neutral';

  if (typeof params.humidity === 'number' && Number.isFinite(params.humidity)) {
    const humidity = params.humidity as number;
    const fogCode = params.weatherCode === 45 || params.weatherCode === 48;
    if (humidity >= 75 && humidity <= 95) {
      scentScore = 4;
      scentStatus = 'optimal';
      scentDesc = `Damp air (${Math.round(humidity)}%) can hold scent close and soften ground noise.`;
    } else if (humidity >= 60 && humidity < 75) {
      scentScore = 2;
      scentStatus = 'good';
      scentDesc = `Moderately damp air (${Math.round(humidity)}%) usually gives you workable scent conditions.`;
    } else if (humidity > 95 && fogCode) {
      scentScore = 2;
      scentStatus = 'good';
      scentDesc = `Foggy and very humid (${Math.round(humidity)}%) — woods stay still but visibility drops.`;
    } else if (humidity > 95) {
      scentScore = 0;
      scentStatus = 'neutral';
      scentDesc = `Very humid (${Math.round(humidity)}%) without fog. Scent holds but conditions feel heavy.`;
    } else if (humidity < 35) {
      scentScore = -2;
      scentStatus = 'poor';
      scentDesc = `Dry air (${Math.round(humidity)}%) — crunchy leaves and sinking scent work against you.`;
    } else {
      scentScore = 0;
      scentStatus = 'neutral';
      scentDesc = `Average humidity (${Math.round(humidity)}%). No strong scent signal either way.`;
    }
  } else {
    // No humidity supplied by caller (legacy callers / fallback forecast).
    scentScore = 0;
    scentStatus = 'neutral';
    scentDesc = 'No humidity reading — pay extra attention to wind and ground noise.';
  }

  totalScore += scentScore;
  factors.push({
    name: 'Humidity & Scent',
    score: scentScore,
    maxScore: 4,
    description: scentDesc,
    status: scentStatus,
  });

  // Factor 10: Cloud cover. A partly-to-mostly cloudy sky can extend useful
  // daylight movement, especially when temperatures are warm. This is kept
  // deliberately small and does not reward storm clouds or active heavy rain.
  let cloudScore = 0;
  let cloudDesc = '';
  let cloudStatus: ScoreFactor['status'] = 'neutral';
  const cloudCover = params.cloudCover;
  const isPrecipitating =
    (params.weatherCode >= 51 && params.weatherCode <= 65) ||
    (params.weatherCode >= 71 && params.weatherCode <= 75) ||
    (params.weatherCode >= 80 && params.weatherCode <= 82) ||
    params.weatherCode >= 95;

  if (typeof cloudCover === 'number' && Number.isFinite(cloudCover)) {
    const cloud = Math.max(0, Math.min(100, cloudCover));
    if (isPrecipitating) {
      cloudScore = 0;
      cloudStatus = 'neutral';
      cloudDesc = `Cloud cover ${Math.round(cloud)}% is noted, but precipitation conditions matter more than the sky cover.`;
    } else if (cloud >= 45 && cloud <= 85) {
      cloudScore = 4;
      cloudStatus = 'optimal';
      cloudDesc = `Helpful overcast (${Math.round(cloud)}% cloud cover) can keep deer comfortable and moving longer in daylight.`;
    } else if (cloud > 15 && cloud < 45) {
      cloudScore = 2;
      cloudStatus = 'good';
      cloudDesc = `Some cloud cover (${Math.round(cloud)}%) may reduce bright, exposed conditions.`;
    } else if (cloud > 85) {
      cloudScore = 2;
      cloudStatus = 'good';
      cloudDesc = `Heavy cloud cover (${Math.round(cloud)}%) helps block bright skies, though it is not a guarantee of movement.`;
    } else {
      cloudScore = 0;
      cloudStatus = 'neutral';
      cloudDesc = `Mostly clear skies (${Math.round(cloud)}% cloud cover). Deer movement depends more on temperature, wind, and timing.`;
    }
  } else {
    cloudScore = 0;
    cloudStatus = 'neutral';
    cloudDesc = 'No cloud-cover reading — temperature, wind, and timing carry the forecast.';
  }

  totalScore += cloudScore;
  factors.push({
    name: 'Cloud Cover',
    score: cloudScore,
    maxScore: 4,
    description: cloudDesc,
    status: cloudStatus,
  });

  // Clamp final score between 15 and 99
  const finalScore = Math.min(99, Math.max(15, Math.round(totalScore)));

  let rating: DailyForecast['rating'] = 'Okay';
  let verdict = '';

  if (finalScore >= RATING_THRESHOLDS.excellent) {
    rating = 'Great';
    verdict = "Get in the woods — it's a great day! A cold front, weather change, or clearing sky should get bucks on their feet.";
  } else if (finalScore >= RATING_THRESHOLDS.good) {
    rating = 'Good';
    verdict = "It's a good day to go hunting. Deer should move best early and late in the day.";
  } else if (finalScore >= RATING_THRESHOLDS.okay) {
    rating = 'Okay';
    verdict = "It's an okay day to hunt. Your best bet is around first light and the last hour before dark.";
  } else if (finalScore >= RATING_THRESHOLDS.slow) {
    rating = 'Slow';
    verdict = "Movement is slow today — focus on the first and last hours of legal light and stick to thick cover.";
  } else {
    rating = 'Very Slow';
    verdict = "Movement is very slow. Heat, hard wind, or rough weather may keep deer bedded down — look for thick cover if you go.";
  }

  return {
    score: finalScore,
    rating,
    verdict,
    factors,
  };
}

/**
 * Returns a specific, detailed explanation for why the score dial is what it is
 * based on current or selected weather, precipitation, rain breaks, wind, and temp.
 */
export function getDetailedConditionExplanation(
  day: DailyForecast,
  hourData: HourlyForecast | null,
  units: UnitSystem = 'imperial',
  pressureUnit: PressureUnit = 'inHg'
): { headline: string; detail: string; badgeColor: string } {
  const weatherCode = hourData ? hourData.weatherCode : day.weatherCode;
  const windMph = hourData ? hourData.windSpeedMph : day.windSpeedMaxMph;
  const tempF = hourData ? hourData.temp : day.maxTemp;
  const pressureTrend = day.pressureTrend;
  const score = hourData ? hourData.huntScore : day.huntScore;
  const tempDrop = day.tempDrop24h;

  // Check if the current hour represents a break in the rain. The post-storm
  // flag must be derived from this same bounded hourly window; using the
  // day-level `isPostStorm` flag directly made an early shower look recent for
  // every later dry hour.
  const hourIndex = hourData
    ? day.hourly.findIndex((hour) => hour.timestamp === hourData.timestamp)
    : undefined;
  const hasRainBreak = hourData
    ? isHourlyRainBreak(day, hourData.weatherCode, hourIndex)
    : false;
  const isPostStorm = hourData ? hasRainBreak : false;

  // Unit-aware display helpers so every explanation cites the real numbers
  // in the user's chosen units. (temp / tempDrop24h are already stored in
  // those units; wind and pressure have raw mph/kmh and inHg/hPa values.)
  const isMetric = units === 'metric';
  const tempUnit = isMetric ? '°C' : '°F';
  const windVal = Math.round(hourData
    ? (isMetric ? hourData.windSpeedKmh : hourData.windSpeedMph)
    : (isMetric ? day.windSpeedMaxKmh : day.windSpeedMaxMph));
  const windUnit = isMetric ? 'km/h' : 'mph';
  const tempVal = Math.round(tempF);
  const tempDropVal = Math.round(tempDrop);
  const pressureVal = pressureUnit === 'hPa'
    ? Math.round(hourData ? hourData.pressureHpa : day.pressureAvgHpa)
    : (hourData ? hourData.pressureInHg : day.pressureAvgInHg);
  const pressureUnitLabel = pressureUnit === 'hPa' ? 'hPa' : 'inHg';
  const weatherDesc = (hourData ? hourData.weatherDesc : day.weatherDesc) || 'stormy weather';

  // 1. Heavy Rain & Storms (Codes 65, 95, 96, 99)
  if (weatherCode === 65 || weatherCode >= 95) {
    return {
      headline: 'It is not a good time to hunt — Heavy Rain & Storms',
      detail: `Heavy rain and active storms (${weatherDesc.toLowerCase()}) push deer into thick cover. If you go, expect little movement until it calms down.`,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }

  // 2. Break in the rain / Rain Stopped / Post Storm
  if (hasRainBreak || (isPostStorm && weatherCode <= 3)) {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Unfavorable Post-Rain Conditions',
        detail: `The rain quit, but ${tempVal}${tempUnit} air and a ${windVal} ${windUnit} wind are still keeping deer movement low. Hunt thick cover.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is a great time to go hunting — Rain Just Stopped',
      detail: `Rain just let up and skies are clearing — with ${tempVal}${tempUnit} air and a ${windVal} ${windUnit} wind, deer step out to feed and stretch.`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 3. Steady Active Rain (Codes 61, 63)
  if (weatherCode === 61 || weatherCode === 63) {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Active Steady Rain',
        detail: `${weatherDesc} is falling steadily and deer are tucked into thick cover — wait for it to let up before expecting movement.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is an okay time to hunt — Active Rain',
      detail: `Rain quiets the woods, but deer usually stay tucked in — be ready for them to step out the moment the rain eases.`,
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    };
  }

  // 4. Light Drizzle / Fog (Codes 51, 53, 55, 45, 48)
  if (weatherCode === 51 || weatherCode === 53 || weatherCode === 55 || weatherCode === 45 || weatherCode === 48) {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Low Activity with Drizzle/Fog',
        detail: `The damp ground helps, but ${tempVal}${tempUnit} air and a ${windVal} ${windUnit} wind are still working against deer movement.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is a good time to hunt — Light Drizzle & Fog',
      detail: `Light drizzle (${weatherDesc.toLowerCase()}) quiets your footsteps and the overcast keeps deer moving — a steady ${windVal} ${windUnit} wind keeps your scent predictable.`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 5. Snowfall (Codes 71-75)
  if (weatherCode >= 71 && weatherCode <= 75) {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Stormy Snowfall Conditions',
        detail: `Snow is falling, but a ${windVal} ${windUnit} wind and a ${tempDropVal}${tempUnit} temperature drop have deer holed up in thick cover.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is a good time to hunt — Active Snowfall',
      detail: `Fresh snow and ${tempVal}${tempUnit} air push deer along field edges and timber cuts — expect movement before and after the snow.`,
      badgeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
    };
  }

  // 6. Absolute heat context. This is about the quality and comfort of a
  // hunting sit, not a claim that deer stop moving entirely.
  const tempAbsoluteF = isMetric ? (tempF * 9 / 5 + 32) : tempF;
  if (tempAbsoluteF >= 95) {
    return {
      headline: 'It is not a good time to hunt — Extreme Heat',
      detail: `Extreme heat (${tempVal}${tempUnit}) makes a daylight sit uncomfortable and usually narrows the best opportunity to shade, water, or last light.`,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }
  if (tempAbsoluteF >= 85) {
    return {
      headline: score >= RATING_THRESHOLDS.good ? 'It is a good time to hunt — Very Warm Conditions' : 'It may be a difficult hunt — Very Warm Conditions',
      detail: `Very warm air (${tempVal}${tempUnit}) can make a long daylight sit less comfortable. Favor shade, water, and the edges of legal shooting time.`,
      badgeColor: score >= RATING_THRESHOLDS.good ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }
  if (tempAbsoluteF >= 78) {
    return {
      headline: score >= RATING_THRESHOLDS.okay ? 'It is an okay time to hunt — Warm Conditions' : 'It is not a good time to hunt — Warm Conditions',
      detail: `Warm air (${tempVal}${tempUnit}) may shift the better hunt toward first or last legal light.`,
      badgeColor: score >= RATING_THRESHOLDS.okay ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }

  // 7. High Gusty Winds (windMph >= 18 / 29 km/h)
  if (windMph >= (isMetric ? 29 : 18)) {
    return {
      headline: 'It is not a good time to hunt — High Swirling Winds' ,
      detail: `Strong, gusty wind (${windVal} ${windUnit}) makes the woods noisy and swirls your scent — deer usually stay in thick cover.`,
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }

  // 8. Barometer Trends
  if (pressureTrend === 'rapid_drop') {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Front Swirling Winds',
        detail: `The barometer is dropping (${pressureVal} ${pressureUnitLabel}), but ${tempVal}${tempUnit} air and a ${windVal} ${windUnit} wind are still keeping deer bedded down.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is a great time to go hunting — Barometer Falling Rapidly',
      detail: `The barometer is falling (${pressureVal} ${pressureUnitLabel}) ahead of a front — deer feed hard before the bad weather arrives.`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  if (pressureTrend === 'rapid_rise') {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Ineffective Rising Barometer',
        detail: `The barometer is rising (${pressureVal} ${pressureUnitLabel}) after the front, but ${tempVal}${tempUnit} air and a ${windVal} ${windUnit} wind are canceling the movement boost.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is a great time to go hunting — Barometer Rising Post-Front',
      detail: `The barometer is rising (${pressureVal} ${pressureUnitLabel}) behind the front — clear, stable air puts deer on their feet feeding in daylight.`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 9. Cold Front Hit (tempDrop >= 8°F / 4°C)
  if (tempDrop >= (isMetric ? 4 : 8)) {
    if (score < RATING_THRESHOLDS.okay) {
      return {
        headline: 'It is not a good time to hunt — Suppressed Cold Front',
        detail: `The temperature dropped ${tempDropVal}${tempUnit} in 24h, but other weather problems or bad wind are still holding deer back.`,
        badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      };
    }
    return {
      headline: 'It is a great time to go hunting — Cold Front Hit',
      detail: `A sharp 24-hour drop of ${tempDropVal}${tempUnit} puts bucks on their feet in daylight — a classic cold-front surge.`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  }

  // 10. Default Score-Based Explanations — cite the exact conditions driving
  // the score instead of generic copy.
  // Batch 3: aligned to the centralised RATING_THRESHOLDS so the headline
  // copy never contradicts the dial rating.
  const windZoneText = isMetric ? '6–19 km/h' : '4–12 mph';
  const windIdeal = windMph >= 4 && windMph <= 12;
  const drivers: string[] = [];
  if (tempDrop >= (isMetric ? 4 : 8)) {
    drivers.push(`${tempDropVal}${tempUnit} drop in temperature over 24h`);
  } else if (tempDrop >= (isMetric ? 2 : 4)) {
    drivers.push(`a ${tempDropVal}${tempUnit} cooling trend`);
  }
  if (windIdeal) {
    drivers.push(`${windVal} ${windUnit} wind (moderate — ideal ${windZoneText})`);
  }
  // Note: 'rapid_drop' / 'rapid_rise' already returned in the barometer
  // branch above, so only 'rising' / 'falling' / 'steady' can reach here.
  if (pressureTrend === 'rising') {
    drivers.push(`the barometer climbing to ${pressureVal} ${pressureUnitLabel}`);
  } else if (pressureTrend === 'falling') {
    drivers.push(`the barometer easing down to ${pressureVal} ${pressureUnitLabel}`);
  }
  if (hasRainBreak || (isPostStorm && weatherCode <= 3)) {
    drivers.push('rain that just let up');
  }
  if (drivers.length === 0) {
    drivers.push(`${tempVal}${tempUnit} air`); // fallback so the copy is never empty
  }
  const driversText = drivers.length > 1
    ? `${drivers.slice(0, -1).join(', ')} and ${drivers[drivers.length - 1]}`
    : drivers[0];
  const primeText = `Best windows: ${day.morningPrime} and ${day.eveningPrime}.`;

  if (score >= RATING_THRESHOLDS.excellent) {
    return {
      headline: 'It is a great time to go hunting — Top-Tier Conditions',
      detail: `${driversText} — ideal conditions for deer movement. ${primeText}`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  } else if (score >= RATING_THRESHOLDS.good) {
    return {
      headline: 'It is a great time to go hunting — Ideal Weather Alignment',
      detail: `${driversText} — a solid reason for deer to move in daylight. ${primeText}`,
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    };
  } else if (score >= RATING_THRESHOLDS.okay) {
    return {
      headline: "It's an okay time to hunt — Moderate Weather Conditions",
      detail: 'Nothing dramatic is happening with the weather. Focus on first light and the last hour before dark.',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    };
  } else {
    return {
      headline: 'It is not a good time to hunt — Unfavorable Weather Conditions',
      detail: 'Warm weather, a flat barometer, or swirling wind can limit daylight movement. Hunt near thick bedding cover if you go.',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    };
  }
}

/**
 * Determines the absolute Best Hunt of the Day time range.
 * Compares morning and evening hourly temperatures, wind, and precipitation
 * to choose the highest-rated time window.
 */
export function getBestHuntTime(day: DailyForecast): string {
  if (!day.hourly || day.hourly.length === 0) {
    return day.morningPrime;
  }

  // The hourly score already includes temperature, wind, rain, cloud cover,
  // solunar timing, and the exact unit-safe factor inputs. Re-scoring here
  // with a second formula used to subtract a raw temperature from the score;
  // that changed the recommendation when the user switched °F/°C. Choose the
  // best scored hour from each actual prime window instead.
  const primeHours = day.hourly.filter((hour) => hour.isPrimeWindow);
  const candidates = primeHours.length > 0 ? primeHours : day.hourly;
  const bestMorning = candidates
    .filter((hour) => new Date(hour.timestamp).getHours() < 12)
    .reduce<HourlyForecast | null>((best, hour) => !best || hour.huntScore > best.huntScore ? hour : best, null);
  const bestEvening = candidates
    .filter((hour) => new Date(hour.timestamp).getHours() >= 12)
    .reduce<HourlyForecast | null>((best, hour) => !best || hour.huntScore > best.huntScore ? hour : best, null);

  if (!bestMorning && !bestEvening) return day.morningPrime;
  if (!bestEvening || (bestMorning && bestMorning.huntScore >= bestEvening.huntScore)) {
    return day.morningPrime;
  }
  return day.eveningPrime;
}

const DIRECTION_DEGREES: Record<string, number> = {
  'N': 0,
  'NNE': 22.5,
  'NE': 45,
  'ENE': 67.5,
  'E': 90,
  'ESE': 112.5,
  'SE': 135,
  'SSE': 157.5,
  'S': 180,
  'SSW': 202.5,
  'SW': 225,
  'WSW': 247.5,
  'W': 270,
  'WNW': 292.5,
  'NW': 315,
  'NNW': 337.5,
};

export function getBestStandForWind(windDeg: number): { name: string; type: string; idealWind: string } | null {
  try {
    const pins: SavedPin[] = safeGetJSON<SavedPin[]>('letshunt_saved_pins', []);
    if (pins.length === 0) return null;
    // Home / Cabin is a starting point, not a hunting location, so it can never
    // be recommended as the best stand for the current wind direction.
    const standsWithWind = pins.filter(p => p.type !== 'home' && ((p.preferredWindDeg !== undefined) || (p.preferredWind && p.preferredWind.length > 0)));
    if (standsWithWind.length === 0) return null;

    let bestPin: SavedPin | null = null;
    let minDiff = Infinity;
    let bestIdealWind = '';

    for (const pin of standsWithWind) {
      if (pin.preferredWindDeg !== undefined) {
        const diff = Math.abs(pin.preferredWindDeg - windDeg);
        const shortestDiff = Math.min(diff, 360 - diff);
        if (shortestDiff < minDiff) {
          minDiff = shortestDiff;
          bestPin = pin;
          bestIdealWind = `${Math.round(pin.preferredWindDeg)}° (${getWindDirectionText(pin.preferredWindDeg)})`;
        }
      }
      if (pin.preferredWind) {
        for (const w of pin.preferredWind) {
          const pDeg = DIRECTION_DEGREES[w.toUpperCase()] ?? 0;
          const diff = Math.abs(pDeg - windDeg);
          const shortestDiff = Math.min(diff, 360 - diff);
          if (shortestDiff < minDiff) {
            minDiff = shortestDiff;
            bestPin = pin;
            bestIdealWind = w;
          }
        }
      }
    }

    if (!bestPin) return null;
    return {
      name: bestPin.name,
      type: bestPin.type,
      idealWind: bestIdealWind,
    };
  } catch (e) {
    return null;
  }
}

function parseSolunarTimeRange(
  rangeStr: string,
  referenceDate: Date
): { start: number; end: number } | null {
  const parts = rangeStr.split(' - ');
  if (parts.length !== 2) return null;

  const parseToMs = (timeStr: string): number | null => {
    const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const d = new Date(referenceDate);
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  };

  const start = parseToMs(parts[0]);
  const end = parseToMs(parts[1]);
  if (start === null || end === null) return null;
  return { start, end };
}

export function getSolunarRating(
  timestamp: number,
  solunar: SolunarInfo
): 'High' | 'Medium' | 'Normal' {
  // Preferred path: exact epoch-ms windows from real astronomy. These stay
  // correct across midnight boundaries (e.g. a window that runs 11 PM → 1 AM
  // the next day), which re-parsing the display strings could never handle
  // because the end time would be stamped onto the same calendar day.
  const windows = solunar.solunarWindows;
  if (windows) {
    const inRange = (r?: { start: number; end: number }) =>
      r !== undefined && timestamp >= r.start && timestamp <= r.end;
    if (inRange(windows.major1) || inRange(windows.major2)) return 'High';
    if (inRange(windows.minor1) || inRange(windows.minor2)) return 'Medium';
    return 'Normal';
  }

  // Legacy fallback (offline synthetic forecast): parse the display strings
  // against the hour's own date. Only safe because those hard-coded windows
  // never cross midnight.
  const date = new Date(timestamp);
  const major1 = parseSolunarTimeRange(solunar.major1, date);
  const major2 = parseSolunarTimeRange(solunar.major2, date);
  const minor1 = parseSolunarTimeRange(solunar.minor1, date);
  const minor2 = parseSolunarTimeRange(solunar.minor2, date);

  if (major1 && timestamp >= major1.start && timestamp <= major1.end) return 'High';
  if (major2 && timestamp >= major2.start && timestamp <= major2.end) return 'High';
  if (minor1 && timestamp >= minor1.start && timestamp <= minor1.end) return 'Medium';
  if (minor2 && timestamp >= minor2.start && timestamp <= minor2.end) return 'Medium';

  return 'Normal';
}
