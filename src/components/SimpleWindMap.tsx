import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HourlyForecast, Location, UnitSystem, ThemeVariantMode } from '../types';
import { Wind, ZoomIn, ZoomOut, RotateCcw, MapPin, Navigation, CalendarDays } from 'lucide-react';
import { getHour12Label } from '../utils/huntingEngine';

// Shared hook: pauses this component's CSS animations when it scrolls out of
// the viewport and resumes them (instantly, mid-flight) when it returns.
// Pausing via animationPlayState keeps every droplet exactly where it was, so
// re-entering the viewport continues the flow rather than restarting it — and
// an offscreen card costs zero compositor work. A small rootMargin pre-roll
// starts the animation just before the card edge appears so it never pops in
// frozen.
const useViewportAnimationPause = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [isOnScreen, setIsOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return; // older browsers: animation just runs always
    const observer = new IntersectionObserver(
      ([entry]) => setIsOnScreen(entry.isIntersecting),
      { rootMargin: '120px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isOnScreen };
};

interface SimpleWindMapProps {
  location: Location;
  hourly: HourlyForecast[];
  units: UnitSystem;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  selectedDayName?: string;
  selectedDateFormatted?: string;
}

// Coordinate conversions for Web Mercator (Slippy Map Tiles)
function latLngToTileCoords(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileXToLng(x: number, zoom: number) {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

function tileYToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function getWindDirectionText(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

// Builds an elongated teardrop path pointing in the +x direction: a rounded head
// at the leading (downwind) edge that tapers to a point at the trailing end.
// Shared with the main Map page's animated wind flow overlay.
const dropletPath = (len: number, headR: number, bodyW: number) => {
  const hx = len - headR;
  return [
    `M 0 0`,
    `C ${(len * 0.25).toFixed(1)} ${(-bodyW).toFixed(1)}, ${(len * 0.7).toFixed(1)} ${(-headR).toFixed(1)}, ${hx.toFixed(1)} ${(-headR).toFixed(1)}`,
    `A ${headR.toFixed(1)} ${headR.toFixed(1)} 0 0 1 ${hx.toFixed(1)} ${headR.toFixed(1)}`,
    `C ${(len * 0.7).toFixed(1)} ${headR.toFixed(1)}, ${(len * 0.25).toFixed(1)} ${bodyW.toFixed(1)}, 0 0`,
    `Z`,
  ].join(' ');
};

export const SimpleWindMap: React.FC<SimpleWindMapProps> = ({
  location,
  hourly,
  units,
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  selectedDayName,
  selectedDateFormatted,
}) => {
  // Hour selected by the map's own compact slider. This is intentionally
  // local to the map so scrubbing the map never changes the hero, the
  // hourly score bars, or the pressure chart — those follow the hourly-card
  // slider instead.
  const [mapHour, setMapHour] = useState<number>(() => new Date().getHours());
  // When the displayed day changes (new hourly array), reset the map hour
  // to the live hour so the map never points at a stale hour of the old day.
  useEffect(() => {
    setMapHour(new Date().getHours());
  }, [hourly]);

  const [zoom, setZoom] = useState(15);
  // Wind droplets only animate while the map card is on screen.
  const { ref: viewportRef, isOnScreen: isMapOnScreen } = useViewportAnimationPause<HTMLDivElement>();
  const defaultLat = location?.latitude ?? 39.8283;
  const defaultLng = location?.longitude ?? -98.5795;
  const [centerLat, setCenterLat] = useState(defaultLat);
  const [centerLng, setCenterLng] = useState(defaultLng);

  // Keep the map centered on the active location whenever it changes.
  useEffect(() => {
    setCenterLat(location.latitude);
    setCenterLng(location.longitude);
  }, [location]);

  // Drag-to-pan state
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchGestureRef = useRef<{ startX: number; startY: number; axis: 'undecided' | 'vertical' | 'horizontal' } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Dimensions of the map container (measured with ResizeObserver).
  const [dimensions, setDimensions] = useState({ width: 320, height: 280 });
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const containerWidth = dimensions.width;
  const containerHeight = dimensions.height;
  const halfW = containerWidth / 2;
  const halfH = containerHeight / 2;

  const centerTile = useMemo(() => latLngToTileCoords(centerLat, centerLng, zoom), [centerLat, centerLng, zoom]);
  const centerX = centerTile.x;
  const centerY = centerTile.y;

  // Active hour data (fall back to the first hour if out of range).
  const hourData = hourly[mapHour] || hourly[0] || null;
  const windDeg = hourData ? hourData.windDirectionDeg : 0;
  const windMph = hourData ? hourData.windSpeedMph : 0;
  const windText = hourData ? hourData.windDirectionText : getWindDirectionText(windDeg);
  // Wind blows toward the downwind direction — the streaks animate along it.
  const downwindDeg = (windDeg + 180) % 360;

  // Wind flow animation streaks (same visual language as the main Map page):
  // deterministic positions so streaks don't jump unpredictably on hour
  // change; rotation and speed derive from the selected hour's wind. The
  // field is intentionally denser than before and every droplet's path is
  // guaranteed to cross the visible map, so the overlay never looks empty.
  const windStreaks = useMemo(() => {
    const w = Math.max(containerWidth, 320);
    const h = Math.max(containerHeight, 320);
    const margin = 220;
    const mph = windMph || 5;
    const travel = Math.hypot(w, h) + margin * 2;
    const speed = Math.max(45, mph * 34); // px per second
    const dur = travel / speed;
    // Steady, uniform stream: fewer droplets than the previous maximum (the
    // denser field caused measurable lag while scrolling), but with a floor
    // that keeps the card visibly alive even on small screens.
    const count = Math.max(40, Math.min(90, Math.round((w * h) / 1800)));

    // Deterministic hash so droplet sizes/offsets stay put across slider scrubs.
    const hash = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    // The droplets are drawn along the local +x axis and the render-side
    // transform rotates each one by (downwindDeg - 90), so local +x points
    // along (dx, dy) in screen coordinates.
    const rad = ((downwindDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    // Perpendicular axis, used to fan droplets across the full cross-section
    // of the viewport so their paths always pass through the visible map.
    const px = -dy;
    const py = dx;

    // Project the viewport corners onto the travel / perpendicular axes to
    // find where the screen sits in the droplet's rotated frame.
    const corners: [number, number][] = [[0, 0], [w, 0], [0, h], [w, h]];
    let qMin = Infinity;
    let pMin = Infinity;
    let pMax = -Infinity;
    for (const [cx, cy] of corners) {
      const q = cx * dx + cy * dy;
      const p = cx * px + cy * py;
      qMin = Math.min(qMin, q);
      pMin = Math.min(pMin, p);
      pMax = Math.max(pMax, p);
    }

    const streaks: { x: number; y: number; len: number; width: number; opacity: number; delay: number; dur: number; travel: number }[] = [];
    for (let i = 0; i < count; i++) {
      // Every droplet starts the same margin behind the leading edge, then a
      // near-uniform negative delay staggers them along the whole loop. That
      // keeps the stream continuous: at any instant droplets are spread
      // evenly across the screen instead of clustering off to one side.
      const q = qMin - margin;
      const p = pMin + hash(i * 3 + 2) * (pMax - pMin);
      streaks.push({
        x: q * dx + p * px,
        y: q * dy + p * py,
        len: Math.max(12, mph * 3) + hash(i * 3 + 3) * mph * 3,
        width: 0.6 + mph * 0.08 + hash(i * 3 + 4) * (0.9 + mph * 0.05),
        opacity: 0.15 + hash(i * 3 + 5) * 0.18,
        delay: -((i / count) + hash(i * 3 + 6) * 0.5) * dur,
        dur,
        travel,
      });
    }
    return streaks;
  }, [windMph, containerWidth, containerHeight, downwindDeg]);

  // Drag handlers
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: clientX, y: clientY };
  };
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    dragStartRef.current = { x: clientX, y: clientY };
    const dTileX = -dx / 256;
    const dTileY = -dy / 256;
    const newLng = tileXToLng(centerX + dTileX, zoom);
    const newLat = tileYToLat(centerY + dTileY, zoom);
    setCenterLat(newLat);
    setCenterLng(newLng);
  };
  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    handleDragStart(e.clientX, e.clientY);
  };

  // Touch events: leave vertical gestures to the page so scrolling over the
  // map never pans it — `touch-pan-y` on the canvas below lets the browser own
  // vertical swipes while horizontal ones never scroll. Only a gesture that
  // clears a small threshold in the horizontal direction becomes a map drag.
  // (No preventDefault here: React registers touchmove as a passive listener,
  // so it would be a no-op — touch-action is what actually guards scrolling.)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    handleDragEnd();
    touchGestureRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, axis: 'undecided' };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !touchGestureRef.current) return;
    const touch = e.touches[0];
    const gesture = touchGestureRef.current;
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (gesture.axis === 'undecided') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (gesture.axis !== 'horizontal') return;

    if (!isDraggingRef.current) handleDragStart(gesture.startX, gesture.startY);
    handleDragMove(touch.clientX, touch.clientY);
  };
  const handleTouchEnd = () => {
    touchGestureRef.current = null;
    handleDragEnd();
  };

  // Tile list for the current center/zoom/size.
  const tileList = useMemo(() => {
    const tiles: { key: string; url: string; left: number; top: number }[] = [];
    const spanX = Math.ceil(containerWidth / 256) + 1;
    const spanY = Math.ceil(containerHeight / 256) + 1;
    const startX = Math.floor(centerX) - Math.floor(spanX / 2);
    const endX = Math.floor(centerX) + Math.ceil(spanX / 2);
    const startY = Math.floor(centerY) - Math.floor(spanY / 2);
    const endY = Math.floor(centerY) + Math.ceil(spanY / 2);
    const maxTile = Math.pow(2, zoom);
    for (let tx = startX; tx <= endX; tx++) {
      for (let ty = startY; ty <= endY; ty++) {
        const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
        if (ty < 0 || ty >= maxTile) continue;
        tiles.push({
          key: `${zoom}-${tx}-${ty}`,
          url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${wrappedTx}`,
          left: halfW + (tx - centerX) * 256,
          top: halfH + (ty - centerY) * 256,
        });
      }
    }
    return tiles;
  }, [centerX, centerY, zoom, containerWidth, containerHeight]);

  const handleZoomIn = () => setZoom((prev) => Math.min(18, prev + 1));
  const handleZoomOut = () => setZoom((prev) => Math.max(12, prev - 1));
  const handleReset = () => {
    setCenterLat(defaultLat);
    setCenterLng(defaultLng);
  };

  const speedVal = units === 'metric'
    ? Math.round(hourData ? hourData.windSpeedKmh : 0)
    : Math.round(windMph);
  const unitLabel = units === 'metric' ? 'km/h' : 'mph';

  return (
    <div
      /* Scroll target for the hero card's Wind tile. Shares the `wind-plotter`
         id with the detailed view's WindCompass — safe because the two never
         mount at the same time (opening the detailed view unmounts this map). */
      id="wind-plotter"
      className={`flex flex-col rounded-2xl border shadow-md transition-colors overflow-hidden ${
        isDark
          ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-xl' : 'bg-slate-900/90'} border-slate-800 text-slate-100`
          : theme === 'hunting'
          ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-xl border-[#d4c4a8] text-[#2a1b0e]'
          : theme === 'olive'
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-xl border-[#d8d2c0] text-[#1e2e1b]'
          : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-xl' : 'bg-white'} border-slate-200 text-slate-900`
      }`}
    >
      {/* Header — two rows on narrow screens so the title, day badge, and
          wind badge never crowd each other: title + wind badge up top, then
          day badge + location/hour beneath. */}
      <div className={`px-3 sm:px-4 py-2.5 border-b ${
        isDark ? 'border-slate-800' : theme === 'hunting' ? 'border-[#d4c4a8]' : theme === 'olive' ? 'border-[#d8d2c0]' : 'border-slate-100'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isDark ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'
          }`}>
            <Navigation className="w-4 h-4" />
          </div>
          <div className="text-xs font-black uppercase tracking-wider truncate min-w-[132px] flex-1">Wind Map</div>
          <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
            isDark ? 'bg-slate-950/60 border-slate-700 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <Wind className="w-2.5 h-2.5" /> {windText} @ {speedVal} {unitLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          {selectedDayName && (
            <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
              isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
            }`}>
              <CalendarDays className="w-2.5 h-2.5" />
              {selectedDayName}{selectedDateFormatted ? ` (${selectedDateFormatted})` : ''}
            </span>
          )}
          <div className="text-[11px] font-semibold opacity-70 truncate min-w-0">
            Satellite · {location.name} · {getHour12Label(mapHour)}
          </div>
        </div>
      </div>

      {/* Map canvas */}
      <div
        ref={(el) => { mapContainerRef.current = el; viewportRef.current = el; }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`relative w-full h-56 sm:h-64 overflow-hidden select-none touch-pan-y ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {/* Tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tileList.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              className="absolute border-none select-none"
              style={{ left: `${tile.left}px`, top: `${tile.top}px`, width: '256px', height: '256px' }}
              onError={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? '#1e293b' : '#e2e8f0';
              }}
            />
          ))}
        </div>

        {/* Animated wind flow overlay — droplets stream in the downwind
            direction, mirroring the main Map page's wind streaks. */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <g className="pointer-events-none">
            {windStreaks.map((s, i) => (
              <g
                key={`wind-streak-${i}`}
                transform={`translate(${s.x} ${s.y}) rotate(${downwindDeg - 90})`}
              >
                <g
                  opacity={Math.min(0.7, s.opacity + 0.12)}
                  style={{
                    animation: `windFlow ${s.dur}s linear infinite`,
                    animationDelay: `${s.delay}s`,
                    animationFillMode: 'backwards',
                    // Freeze the droplets mid-flight while the card is scrolled
                    // away; resuming picks up exactly where each one left off.
                    animationPlayState: isMapOnScreen ? 'running' : 'paused',
                    ...({ '--travel': `${s.travel}px` } as Record<string, string>),
                  }}
                >
                  {/* Elongated droplet: rounded head leads downwind, tail
                      tapers behind. The near-white body reads as an icy streak;
                      the darker underlay keeps droplets visible over bright
                      satellite tiles. */}
                  <path
                    d={dropletPath(s.len, Math.min((s.width + 3) * 1.3, s.len * 0.4), Math.min((s.width + 3) * 0.8, s.len * 0.3))}
                    fill="#082f49"
                    fillOpacity={0.4}
                  />
                  <path
                    d={dropletPath(s.len, Math.min((s.width + 1) * 1.3, s.len * 0.4), Math.min((s.width + 1) * 0.8, s.len * 0.3))}
                    fill="#f8fafc"
                    fillOpacity={0.6}
                  />
                </g>
              </g>
            ))}
          </g>
          {/* Cardinal labels */}
          <text x={halfW} y={20} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">N</text>
          <text x={containerWidth - 15} y={halfH + 4} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">E</text>
          <text x={halfW} y={containerHeight - 12} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">S</text>
          <text x={15} y={halfH + 4} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">W</text>
        </svg>

        {/* Zoom / reset controls */}
        <div className="absolute bottom-2.5 right-2.5 z-30 flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-emerald-400 flex items-center justify-center shadow-md cursor-pointer transition-colors"
            title="Center on location"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Drag hint */}
        <div className="absolute bottom-2.5 left-2.5 z-30 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[11px] font-black uppercase text-white shadow-sm">
            <MapPin className="w-3 h-3 text-emerald-400" /> Drag to pan
          </span>
        </div>
      </div>

      {/* Compact hour slider — scrub to preview wind direction through the day */}
      <div className={`px-3 sm:px-4 py-2.5 border-t flex items-center gap-2.5 ${
        isDark ? 'border-slate-800 bg-slate-950/[var(--card-opacity)]' : theme === 'hunting' ? 'border-[#d4c4a8] bg-[#eae1cf]/[var(--card-opacity)]' : theme === 'olive' ? 'border-[#d8d2c0] bg-[#efebd9]/[var(--card-opacity)]' : 'border-slate-100 bg-slate-50/[var(--card-opacity)]'
      }`}>
        <span className={`shrink-0 w-[54px] whitespace-nowrap text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-emerald-300' : theme === 'hunting' ? 'text-[#7a3208]' : theme === 'olive' ? 'text-[#3d4f21]' : 'text-emerald-700'}`}>
          {getHour12Label(mapHour)}
        </span>
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={mapHour}
          onChange={(e) => setMapHour(parseInt(e.target.value, 10))}
          aria-label="Wind map hour slider"
          className={`flex-1 min-w-0 h-1.5 cursor-pointer ${isDark ? 'accent-emerald-400' : 'accent-emerald-600'}`}
        />
        <span className={`shrink-0 w-[76px] text-right whitespace-nowrap text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {windText} {speedVal} {unitLabel}
        </span>
      </div>
    </div>
  );
};
