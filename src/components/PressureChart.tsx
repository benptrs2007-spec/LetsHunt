import React, { useState, useEffect, useRef } from 'react';
import { HourlyForecast, UnitSystem, ThemeMode, ThemeVariantMode, PressureUnit } from '../types';
import { Droplets, Activity } from 'lucide-react';

interface PressureChartProps {
  hourly: HourlyForecast[];
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  selectedHour?: number;
  onSelectHour?: (hour: number) => void;
  selectedDayName?: string;
  selectedDateFormatted?: string;
}

export const PressureChart: React.FC<PressureChartProps> = ({
  hourly,
  units,
  pressureUnit,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  selectedHour,
  onSelectHour,
  selectedDayName,
  selectedDateFormatted,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // True while the pointer is actively scrubbing horizontally — the pointer
  // owns the selection for as long as it's sliding across the graph.
  const [scrubbing, setScrubbing] = useState(false);

  if (!hourly || hourly.length === 0) return null;

  // Fixed 12-hour window anchored to "now": on today's forecast the slice
  // starts at the current (in-progress) hour, so the graph always shows the
  // NEXT 12 hours of data instead of a fixed midnight slice. Future days have
  // no "now" hour (every timestamp is ahead) and past days have none left
  // (no timestamp qualifies), so both naturally fall back to a midnight start.
  // The graph never pans — it always shows the same fixed slice and the
  // tracker slides across it.
  const now = new Date();
  const firstLiveIdx = hourly.findIndex((h) => h.timestamp + 60 * 60 * 1000 > now.getTime());
  const windowStart = Math.max(0, firstLiveIdx);
  const windowSize = Math.min(12, hourly.length - windowStart);
  const windowHours = hourly.slice(windowStart, windowStart + windowSize);
  // Guards against a 1-hour window (late-night today) dividing by zero.
  const xDenom = Math.max(1, windowHours.length - 1);

  // Which points get an X-axis timestamp. A fixed "every third point" rule left
  // short windows (evenings, when the next 12 hours spill past midnight) with
  // only two labels, so the stride now adapts to the window and the last hour is
  // always labelled. Ticks never sit closer than two slots apart — at ~60px per
  // "7:00 PM" label, adjacent slots would collide.
  const labelIndexSet = (() => {
    const n = windowHours.length;
    if (n <= 1) return new Set<number>([0]);
    const stride = n <= 6 ? 1 : n <= 10 ? 2 : 3;
    const indices: number[] = [];
    for (let i = 0; i < n; i += stride) indices.push(i);
    if (indices[indices.length - 1] !== n - 1) {
      // Replace the previous tick instead of adding a crowded neighbour.
      if (n - 1 - indices[indices.length - 1] < 2) indices.pop();
      indices.push(n - 1);
    }
    return new Set(indices);
  })();

  // Extract pressure and precipitation series for the visible window
  const pressures = windowHours.map((h) => (pressureUnit === 'inHg' ? h.pressureInHg : h.pressureHpa));

  const minP = Math.min(...pressures);
  const maxP = Math.max(...pressures);
  const rangeP = Math.max(0.05, maxP - minP);

  // SVG dimensions — fitted to the container (no min-width, no scroll strip)
  const width = 600;
  const height = 250;
  const paddingLeft = 48;
  const paddingRight = 48;
  const paddingTop = 30;
  const paddingBottom = 48;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Convert points to SVG coordinates. Each point remembers its index into
  // the day's full 24-hour series so selection stays in sync everywhere.
  const points = windowHours.map((h, i) => {
    const x = paddingLeft + (i / xDenom) * chartWidth;
    const valP = pressureUnit === 'inHg' ? h.pressureInHg : h.pressureHpa;
    const normP = (valP - minP) / rangeP;
    const yP = height - paddingBottom - normP * (chartHeight - 15);

    const precipProb = Math.min(100, Math.max(0, h.precipProbability || 0));
    const normPrecip = precipProb / 100;
    const yPrecip = height - paddingBottom - normPrecip * (chartHeight - 15);

    return {
      x,
      yP,
      yPrecip,
      valP,
      precipProb,
      precipMm: h.precipMm || 0,
      hourStr: h.time,
      score: h.huntScore,
      isPrime: h.isPrimeWindow,
      fullIndex: windowStart + i,
      h,
    };
  });

  // SVG Path for Barometric Pressure Line
  const pressureLineD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.yP}` : `${acc} L ${pt.x},${pt.yP}`;
  }, '');

  const pressureAreaD = `${pressureLineD} L ${points[points.length - 1].x},${height - paddingBottom} L ${points[0].x},${height - paddingBottom} Z`;

  // SVG Path for Rain Precipitation Forecast Line
  const precipLineD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.yPrecip}` : `${acc} L ${pt.x},${pt.yPrecip}`;
  }, '');

  const precipAreaD = `${precipLineD} L ${points[points.length - 1].x},${height - paddingBottom} L ${points[0].x},${height - paddingBottom} Z`;

  // The selected/hovered hour in full-day indices. While actively scrubbing
  // the pointer owns the selection; otherwise a mouse hover (desktop)
  // previews, falling back to the externally selected hour (the simple-dash
  // slider, detailed view, etc.).
  const activeFullIdx = scrubbing
    ? (selectedHour !== undefined ? selectedHour : null)
    : hoveredIdx !== null
      ? hoveredIdx
      : (selectedHour !== undefined ? selectedHour : null);
  const activePoint =
    activeFullIdx !== null &&
    activeFullIdx >= windowStart &&
    activeFullIdx < windowStart + windowHours.length
      ? points[activeFullIdx - windowStart]
      : null;

  // --- Drag-to-scrub gesture ----------------------------------------------
  // Slide a finger (or mouse) across the graph to scrub the hour — like
  // Apple Weather. Vertical swipes still scroll the page because the SVG
  // uses touch-action: pan-y, so the browser owns vertical pans while
  // horizontal movement comes to us. A tap still selects the hour.
  const chartSvgRef = useRef<SVGSVGElement>(null);
  const pointerGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    active: boolean;
  } | null>(null);

  const clearPointerGesture = () => {
    pointerGestureRef.current = null;
    setScrubbing(false);
  };

  // Safety net: if the finger lifts off the page instead of the graph (no
  // pointer capture for touch, so vertical page scroll keeps working), make
  // sure the scrub gesture always ends.
  useEffect(() => {
    if (!scrubbing) return;
    const end = () => clearPointerGesture();
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [scrubbing]);

  const getHourFromClientX = (clientX: number): number | null => {
    const svg = chartSvgRef.current;
    if (!svg || windowHours.length < 2) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const viewBoxX = ((clientX - rect.left) / rect.width) * width;
    const ratio = (viewBoxX - paddingLeft) / chartWidth;
    const localIdx = Math.max(0, Math.min(windowHours.length - 1, Math.round(ratio * xDenom)));
    return windowStart + localIdx;
  };

  const beginPointerGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    clearPointerGesture();
    // Capturing the mouse keeps a drag flowing even off the chart's edge;
    // touch is left uncaptured so the browser can still take over for
    // vertical page scrolling.
    if (event.pointerType !== 'touch') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      active: false,
    };
  };

  const movePointerGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastX = event.clientX;

    if (!gesture.active) {
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      // A mostly vertical movement belongs to page scrolling — drop the
      // gesture and let the browser's pan (and pointercancel) take over.
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
        clearPointerGesture();
        return;
      }
      // Only a deliberate sideways slide engages the scrubber. Freeze the
      // window at its current position for the rest of the drag so the
      // cursor tracks the finger exactly instead of re-centering under it.
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        gesture.active = true;
        setScrubbing(true);
        setHoveredIdx(null);
      } else {
        return;
      }
    }

    const index = getHourFromClientX(event.clientX);
    if (index !== null) onSelectHour?.(index);
  };

  const endPointerGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = pointerGestureRef.current;
    if (gesture?.pointerId === event.pointerId) {
      if (gesture.active) {
        // Final slide position wins.
        const index = getHourFromClientX(event.clientX);
        if (index !== null) onSelectHour?.(index);
      } else {
        // A tap with no meaningful slide selects the pressed hour.
        const index = getHourFromClientX(event.clientX);
        if (index !== null) onSelectHour?.(index);
      }
      // Let the selection (not a stale hover) own the cursor after release.
      setHoveredIdx(null);
    }
    clearPointerGesture();
  };

  return (
    <div
      id="barometer-chart"
      className={`rounded-2xl p-4 sm:p-5 border shadow-md transition-colors ${
        isDark
          ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md' : 'bg-slate-900/90'} border-slate-800 text-slate-100`
          : theme === 'hunting'
          ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] text-[#2a1b0e]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] text-[#1e2e1b]'
          : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-md' : 'bg-white'} border-slate-200 text-slate-900`
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center flex-wrap gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-2"><Activity className="w-4 h-4" /> Rain & Barometer</span>
            {selectedDayName && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                  isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800 text-slate-300' : 'bg-slate-100/[var(--card-opacity)] border-slate-200 text-slate-700'
                }`}
              >
                {selectedDayName} ({selectedDateFormatted})
              </span>
            )}
          </h3>
          <p className={`text-xs sm:text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            The next 12 hours of rain and barometer readings — slide across the graph to scrub the barometer and rain
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs font-bold flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500 inline-block" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Best Hunt Hours</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-amber-500 rounded-full inline-block" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Barometer ({pressureUnit})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-cyan-400 rounded-full inline-block" />
            <span className="text-cyan-500 dark:text-cyan-400 flex items-center gap-0.5">
              <Droplets className="w-3 h-3 inline" /> Rain Precip (%)
            </span>
          </div>
        </div>
      </div>

      <svg
        ref={chartSvgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none"
        style={{ touchAction: 'pan-y' }}
        onMouseLeave={() => setHoveredIdx(null)}
        onPointerDown={beginPointerGesture}
        onPointerMove={movePointerGesture}
        onPointerUp={endPointerGesture}
        onPointerCancel={clearPointerGesture}
        onLostPointerCapture={clearPointerGesture}
      >
        <defs>
          <linearGradient id="pressureGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>

          <linearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines with Left (Barometer) and Right (Rain Precip %) Axes */}
        {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
          const y = height - paddingBottom - ratio * (chartHeight - 15);
          const valP = minP + ratio * rangeP;
          const valPrecip = Math.round(ratio * 100);

          return (
            <g key={ratio}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke="rgb(var(--ui-border-rgb) / 0.8)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* Left Axis: Pressure */}
              <text
                x={paddingLeft - 8}
                y={y + 4}
                fill={isDark ? '#f59e0b' : '#d97706'}
                fontSize="16"
                fontWeight="800"
                textAnchor="end"
              >
                {valP.toFixed(pressureUnit === 'inHg' ? 2 : 0)}
              </text>
              {/* Right Axis: Rain Precip % */}
              <text
                x={width - paddingRight + 8}
                y={y + 4}
                fill={isDark ? '#22d3ee' : '#0284c7'}
                fontSize="16"
                fontWeight="800"
                textAnchor="start"
              >
                {valPrecip}%
              </text>
            </g>
          );
        })}

        {/* Area Fill under Barometric Pressure line */}
        <path d={pressureAreaD} fill="url(#pressureGrad)" />

        {/* Area Fill under Rain Precipitation line */}
        <path d={precipAreaD} fill="url(#precipGrad)" />

        {/* Barometric Pressure Line */}
        <path
          d={pressureLineD}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Rain Precipitation Line */}
        <path
          d={precipLineD}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="2.5"
          strokeDasharray="5 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hourly Nodes & X-Axis Time Labels */}
        {points.map((pt, i) => {
          const isHovered = hoveredIdx === pt.fullIndex;
          const isSelected = activePoint === pt;
          const slotWidth = chartWidth / windowHours.length;

          return (
            <g
              key={pt.fullIndex}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(pt.fullIndex)}
              onClick={() => onSelectHour && onSelectHour(pt.fullIndex)}
            >
              {/* Wide invisible interaction block for easy hover/touch */}
              <rect
                x={pt.x - slotWidth / 2}
                y={paddingTop}
                width={slotWidth}
                height={chartHeight}
                fill="transparent"
              />

              {/* Rain Precip Point Node */}
              <circle
                cx={pt.x}
                cy={pt.yPrecip}
                r={isHovered ? 6 : pt.precipProb > 30 ? 4 : 2.5}
                fill="#06b6d4"
                stroke="rgb(var(--ui-surface-rgb))"
                strokeWidth={1.5}
              />

              {/* Barometer Point Node */}
              <circle
                cx={pt.x}
                cy={pt.yP}
                r={isHovered ? 6.5 : pt.isPrime ? 4.5 : 3}
                fill={pt.isPrime ? '#10b981' : '#f59e0b'}
                stroke="rgb(var(--ui-surface-rgb))"
                strokeWidth={1.5}
              />

              {/* X-Axis Time Labels */}
              {labelIndexSet.has(i) && (
                <text
                  x={pt.x}
                  y={height - 12}
                  fill="rgb(var(--ui-text-rgb))"
                  fontSize="15"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {pt.hourStr}
                </text>
              )}
            </g>
          );
        })}

        {/* Active Hover / Selected Hour Cursor Line */}
        {activePoint && (
          <g className="pointer-events-none">
            <line
              x1={activePoint.x}
              y1={paddingTop}
              x2={activePoint.x}
              y2={height - paddingBottom}
              stroke="#0284c7"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
            {/* Pressure Active Ring */}
            <circle
              cx={activePoint.x}
              cy={activePoint.yP}
              r="7"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            {/* Precip Active Ring */}
            <circle
              cx={activePoint.x}
              cy={activePoint.yPrecip}
              r="6"
              fill="#06b6d4"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Active Hover / Hour Detail Card */}
      {activePoint ? (
        <div
          className={`mt-4 p-3.5 sm:p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm animate-fadeIn ${
            isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-700/80 text-slate-100' : 'bg-slate-50/[var(--card-opacity)] border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 bg-amber-500/20 text-amber-600 dark:text-amber-300 font-extrabold rounded-lg border border-amber-500/40 text-xs sm:text-sm">
              ⏰ {activePoint.hourStr}
            </span>
            <div>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Barometer: </span>
              <span className={`font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                {activePoint.valP} {pressureUnit}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 sm:gap-5 flex-wrap font-bold">
            <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
              <Droplets className="w-4 h-4 inline shrink-0" />
              <span>
                Rain Precip: <span className="font-black text-cyan-500">{activePoint.precipProb}%</span>
                {activePoint.precipMm > 0 && (
                  <span className="text-xs opacity-90 ml-1">
                    ({units === 'imperial' ? `${(activePoint.precipMm / 25.4).toFixed(2)} in` : `${activePoint.precipMm.toFixed(1)} mm`})
                  </span>
                )}
              </span>
            </div>

            <div>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Temp: </span>
              <span className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {activePoint.h.temp}°{units === 'imperial' ? 'F' : 'C'}
              </span>
            </div>

            <div>
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Wind: </span>
              <span className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {activePoint.h.windDirectionText} @{' '}
                {units === 'metric' ? `${activePoint.h.windSpeedKmh} km/h` : `${activePoint.h.windSpeedMph} mph`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Movement: </span>
              <span
                className={`px-2.5 py-0.5 rounded-md font-black ${
                  activePoint.score >= 86
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40'
                    : activePoint.score >= 61
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : activePoint.score >= 41
                    ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border border-yellow-500/40'
                    : activePoint.score >= 26
                    ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/40'
                    : 'bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                {activePoint.score}/100
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className={`text-xs text-center mt-2.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Tap an hour, or slide your finger across the graph, to scrub rain, the barometer, wind, and movement.
        </p>
      )}
    </div>
  );
};
