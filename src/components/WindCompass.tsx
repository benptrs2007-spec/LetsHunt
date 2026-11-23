import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Compass, MapPin, Layers, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Map, Crosshair, Wind } from 'lucide-react';
import { ThemeMode, ThemeVariantMode, Location, UnitSystem } from '../types';

interface WindCompassProps {
  deg: number;
  speedMph: number;
  speedKmh?: number;
  directionText: string;
  units?: UnitSystem;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  location?: Location;
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

// Generate an SVG path for a filled sector (cone)
function getSvgArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  // Map angles to compass coordinates (0 is North / Straight Up)
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const angleDiff = (endAngle - startAngle + 360) % 360;
  const largeArcFlag = angleDiff <= 180 ? 0 : 1;

  // Render sector starting at center (cx, cy) to x1, y1, arc to x2, y2, close to center
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

export const WindCompass: React.FC<WindCompassProps> = ({
  deg,
  speedMph,
  speedKmh,
  directionText,
  units = 'imperial',
  theme = 'dark',
  isDark = theme === 'dark',
  hasCustomBackground = false,
  location,
}) => {
  const speedVal = units === 'metric'
    ? (speedKmh !== undefined ? Math.round(speedKmh) : Math.round(speedMph * 1.60934))
    : Math.round(speedMph);
  const unitLabel = units === 'metric' ? 'km/h' : 'mph';
  
  // Tab/View selection: 'map' (interactive GIS map overlay) vs 'compass' (classic circular compass)
  const [activeTab, setActiveTab] = useState<'map' | 'compass'>('map');
  
  // Map parameters
  const [zoom, setZoom] = useState(16); // 16 is optimal for wood cover stand viewing
  const [mapStyle, setMapStyle] = useState<'satellite' | 'topo' | 'street'>('satellite');
  
  // Scent plume spread setting: narrow, standard, or wide swirling
  const [scentSpread, setScentSpread] = useState<15 | 45 | 75>(45);

  // Active map center coordinates, defaults to current location coords
  const defaultLat = location?.latitude ?? 39.8283;
  const defaultLng = location?.longitude ?? -98.5795;
  const [centerLat, setCenterLat] = useState(defaultLat);
  const [centerLng, setCenterLng] = useState(defaultLng);

  // Sync map center if selected location changes
  useEffect(() => {
    if (location) {
      setCenterLat(location.latitude);
      setCenterLng(location.longitude);
    }
  }, [location]);

  // Handle Drag-to-Pan state
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchGestureRef = useRef<{ startX: number; startY: number; axis: 'undecided' | 'vertical' | 'horizontal' } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Dimensions of map container (measured or fallback)
  const [dimensions, setDimensions] = useState({ width: 320, height: 320 });

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        // Ignore the 0×0 report fired when the map unmounts for the Classic
        // Dial tab — otherwise the fallback size re-centers the scent cone
        // away from the stand pin when switching back to the map.
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    resizeObserver.observe(mapContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [activeTab]);

  const containerWidth = dimensions.width;
  const containerHeight = dimensions.height;
  const halfW = containerWidth / 2;
  const halfH = containerHeight / 2;

  // Slippy Map coordinates calculation
  const centerTile = useMemo(() => latLngToTileCoords(centerLat, centerLng, zoom), [centerLat, centerLng, zoom]);
  const centerX = centerTile.x;
  const centerY = centerTile.y;

  // Wind values
  const windToDeg = (deg + 180) % 360; // Downwind direction
  const startAngle = windToDeg - scentSpread / 2;
  const endAngle = windToDeg + scentSpread / 2;

  // Slippy Map drag handlers
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

    // Pixel delta to tile coordinate delta
    const dTileX = -dx / 256;
    const dTileY = -dy / 256;

    const newX = centerX + dTileX;
    const newY = centerY + dTileY;

    // Convert new tile coordinates back to lat/lng
    const newLng = tileXToLng(newX, zoom);
    const newLat = tileYToLat(newY, zoom);

    setCenterLat(newLat);
    setCenterLng(newLng);
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  // Touch events: leave vertical gestures to the page so scrolling over the
  // little map never pans it. A horizontal gesture becomes an intentional map
  // drag only after it clears a small movement threshold.
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    handleDragEnd();
    touchGestureRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      axis: 'undecided',
    };
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

    e.preventDefault();
    if (!isDraggingRef.current) {
      handleDragStart(gesture.startX, gesture.startY);
    }
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    touchGestureRef.current = null;
    handleDragEnd();
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(18, prev + 1));
  const handleZoomOut = () => setZoom((prev) => Math.max(12, prev - 1));

  // Reset to original search location
  const handleResetLocation = () => {
    setCenterLat(defaultLat);
    setCenterLng(defaultLng);
  };

  // Compute absolute map tile render list
  const tileList = useMemo(() => {
    const tiles = [];
    const spanX = Math.ceil(containerWidth / 256) + 1;
    const spanY = Math.ceil(containerHeight / 256) + 1;

    const startX = Math.floor(centerX) - Math.floor(spanX / 2);
    const endX = Math.floor(centerX) + Math.ceil(spanX / 2);
    const startY = Math.floor(centerY) - Math.floor(spanY / 2);
    const endY = Math.floor(centerY) + Math.ceil(spanY / 2);

    const maxTile = Math.pow(2, zoom);

    for (let tx = startX; tx <= endX; tx++) {
      for (let ty = startY; ty <= endY; ty++) {
        // Wrap X longitude coordinate
        const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
        
        // Skip out of bounds latitude coordinate
        if (ty < 0 || ty >= maxTile) continue;

        const posX = halfW + (tx - centerX) * 256;
        const posY = halfH + (ty - centerY) * 256;

        let url = '';
        if (mapStyle === 'satellite') {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${wrappedTx}`;
        } else if (mapStyle === 'topo') {
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${zoom}/${ty}/${wrappedTx}`;
        } else {
          url = `https://tile.openstreetmap.org/${zoom}/${wrappedTx}/${ty}.png`;
        }

        tiles.push({
          key: `${zoom}-${tx}-${ty}-${mapStyle}`,
          url,
          left: posX,
          top: posY,
        });
      }
    }
    return tiles;
  }, [centerX, centerY, zoom, mapStyle, containerWidth, containerHeight]);

  return (
    <div
      id="wind-plotter"
      className={`flex flex-col rounded-2xl border shadow-md transition-colors overflow-hidden scroll-mt-6 ${
        isDark
          ? `${hasCustomBackground ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md' : 'bg-slate-900/90'} border-slate-800 text-slate-100`
          : theme === 'hunting'
          ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] text-[#2a1b0e]'
          : (theme === 'olive' || theme === 'hunting')
          ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0] text-[#1e2e1b]'
          : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-md' : 'bg-white'} border-slate-200 text-slate-900`
      }`}
    >
      {/* Tab Selector & Header */}
      <div className={`p-3 sm:p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
        isDark ? 'border-slate-800 bg-slate-950/[var(--card-opacity)]' : theme === 'hunting' ? 'border-[#d4c4a8] bg-[#eae1cf]/[var(--card-opacity)]' : (theme === 'olive' || theme === 'hunting') ? 'border-[#d8d2c0] bg-[#efebd9]/[var(--card-opacity)]' : 'border-slate-100 bg-slate-50/[var(--card-opacity)]'
      }`}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-black tracking-wider text-emerald-600 dark:text-emerald-400 uppercase">
            Wind & Stand Scent Plotter
          </span>
        </div>

        {/* Dynamic Tab Toggle Button */}
        <div className={`flex p-0.5 rounded-lg border text-xs font-black uppercase tracking-wider self-start sm:self-auto ${
          isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-200/[var(--card-opacity)] border-slate-200'
        }`}>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'map'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Map className="w-3.5 h-3.5" /> Interactive Map
          </button>
          <button
            onClick={() => setActiveTab('compass')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'compass'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" /> Classic Dial
          </button>
        </div>
      </div>

      {/* CORE DISPLAY STAGE */}
      {activeTab === 'map' ? (
        <div className="relative w-full flex flex-col items-center">
          {/* Scent Dispersion & Stand Adjust Controls Floating Panel */}
          <div className="absolute top-2.5 z-30 flex items-center justify-between w-full px-3 pointer-events-none">
            {/* Map Type selector floating */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 shadow-sm pointer-events-auto">
              <button
                onClick={() => setMapStyle('satellite')}
                className={`px-2 py-0.5 text-[11px] font-extrabold rounded-md uppercase transition-all tracking-wider ${
                  mapStyle === 'satellite' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Satellite Imagery"
              >
                Sat
              </button>
              <button
                onClick={() => setMapStyle('topo')}
                className={`px-2 py-0.5 text-[11px] font-extrabold rounded-md uppercase transition-all tracking-wider ${
                  mapStyle === 'topo' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Topographic Features"
              >
                Topo
              </button>
              <button
                onClick={() => setMapStyle('street')}
                className={`px-2 py-0.5 text-[11px] font-extrabold rounded-md uppercase transition-all tracking-wider ${
                  mapStyle === 'street' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Outdoor Street Map"
              >
                Street
              </button>
            </div>

            {/* Scent Spread angle floating selector */}
            <div className="flex items-center gap-1 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-1 rounded-lg shadow-sm pointer-events-auto">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">Scent:</span>
              <button
                onClick={() => setScentSpread(15)}
                className={`px-1.5 py-0.5 text-[11px] font-extrabold rounded-sm uppercase tracking-tight ${
                  scentSpread === 15 ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Steady Breeze - Stable Stream"
              >
                15°
              </button>
              <button
                onClick={() => setScentSpread(45)}
                className={`px-1.5 py-0.5 text-[11px] font-extrabold rounded-sm uppercase tracking-tight ${
                  scentSpread === 45 ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Standard Gusts"
              >
                45°
              </button>
              <button
                onClick={() => setScentSpread(75)}
                className={`px-1.5 py-0.5 text-[11px] font-extrabold rounded-sm uppercase tracking-tight ${
                  scentSpread === 75 ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Swirling Winds"
              >
                75°
              </button>
            </div>
          </div>

          {/* Interactive Slippy Map Canvas */}
          <div
            ref={mapContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className={`relative w-full h-[320px] overflow-hidden select-none touch-pan-y ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            {/* 1. Map Tiles Layer */}
            <div className="absolute inset-0 pointer-events-none">
              {tileList.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  className="absolute object-cover border-none select-none transition-opacity duration-300"
                  style={{
                    left: `${tile.left}px`,
                    top: `${tile.top}px`,
                    width: '256px',
                    height: '256px',
                  }}
                  onError={(e) => {
                    // Fallback visual gray tile in case server tile fails to render
                    e.currentTarget.style.backgroundColor = 'rgb(var(--ui-surface-rgb))';
                  }}
                />
              ))}
            </div>

            {/* 2. Scent Plume Vector Overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
              <defs>
                <radialGradient id="scentFade" cx={halfW} cy={halfH} r={140} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.75" />
                  <stop offset="35%" stopColor="#ef4444" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Diffusing Scent Plume Conic Sector */}
              <path
                d={getSvgArcPath(halfW, halfH, 140, startAngle, endAngle)}
                fill="url(#scentFade)"
              />

              {/* Pulsing Concentric Wind Waves */}
              <g className="animate-pulse duration-1000">
                <path
                  d={getSvgArcPath(halfW, halfH, 65, startAngle, endAngle)}
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="1.2"
                  strokeDasharray="4,4"
                  opacity="0.65"
                />
                <path
                  d={getSvgArcPath(halfW, halfH, 110, startAngle, endAngle)}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.2"
                  strokeDasharray="6,6"
                  opacity="0.45"
                />
              </g>

              {/* Direction Indicator Labels Overlay */}
              <text x={halfW} y={20} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">N</text>
              <text x={containerWidth - 15} y={halfH + 4} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">E</text>
              <text x={halfW} y={containerHeight - 12} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">S</text>
              <text x={15} y={halfH + 4} textAnchor="middle" className="text-xs font-black fill-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.85)]">W</text>
            </svg>

            {/* 3. Center Target Tree Stand Marker */}
            <div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full border-2 border-emerald-400 bg-emerald-950/90 text-sm flex items-center justify-center shadow-lg cursor-help`}
              title="Your Tree Stand Active Marker"
            >
              <Crosshair className="w-4.5 h-4.5" />
            </div>

            {/* Floating Zoom & Snap Back Tools (Bottom Right) */}
            <div className="absolute bottom-2.5 right-2.5 z-30 flex flex-col gap-1.5">
              <button
                onClick={handleZoomIn}
                className="w-8 h-8 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
                title="Zoom In Map"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                className="w-8 h-8 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
                title="Zoom Out Map"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetLocation}
                className="w-8 h-8 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 hover:bg-slate-800 text-emerald-400 flex items-center justify-center shadow-md cursor-pointer transition-colors"
                title="Snap Stand to Default Coordinates"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Drag Help Overlay Badge (Bottom Left) */}
            <div className="absolute bottom-2.5 left-2.5 z-30 pointer-events-none">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[11px] font-black uppercase text-white shadow-sm">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span className="inline-flex items-center gap-1">Drag map to move stand <Crosshair className="w-3 h-3 text-emerald-400" /></span>
              </span>
            </div>
          </div>

          {/* Map Stand GPS Readout Metadata Row */}
          <div className={`w-full px-3.5 py-2.5 border-t flex flex-wrap items-center justify-between gap-1.5 text-xs font-bold ${
            isDark ? 'border-slate-800 bg-slate-950/[var(--card-opacity)] text-slate-400' : 'border-slate-100 bg-slate-50/[var(--card-opacity)] text-slate-500'
          }`}>
            <span>Stand coordinates:</span>
            <span className={`font-mono text-xs font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {Math.abs(centerLat).toFixed(4)}° {centerLat >= 0 ? 'N' : 'S'}, {Math.abs(centerLng).toFixed(4)}° {centerLng >= 0 ? 'E' : 'W'}
            </span>
          </div>
        </div>
      ) : (
        /* CLASSIC DIAL COMPASS COMPONENT */
        <div className="flex flex-col items-center justify-center py-6 px-4">
          <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center my-2">
            {/* Outer Ring */}
            <div
              className={`absolute inset-0 rounded-full border-2 shadow-inner flex items-center justify-center ${
                isDark ? 'border-slate-700 bg-slate-950/[var(--card-opacity)]' : 'border-slate-300 bg-slate-50/[var(--card-opacity)]'
              }`}
            >
              {/* Cardinal Labels */}
              <span className={`absolute top-1 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>N</span>
              <span className={`absolute right-1.5 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>E</span>
              <span className={`absolute bottom-1 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>S</span>
              <span className={`absolute left-1.5 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>W</span>

              {/* Dial ticks */}
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((tick) => (
                <div
                  key={tick}
                  className={`absolute w-0.5 h-1.5 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}
                  style={{
                    transform: `rotate(${tick}deg) translateY(-68px)`,
                  }}
                />
              ))}
            </div>

            {/* Translucent Scent Dispersion Cone */}
            <div
              className="absolute w-32 h-32 pointer-events-none transition-transform duration-700 ease-out flex items-center justify-center"
              style={{ transform: `rotate(${windToDeg}deg)` }}
            >
              <div
                className="w-full h-full rounded-full opacity-35"
                style={{
                  background: `conic-gradient(from -30deg at 50% 50%, rgba(239, 68, 68, 0.8) 0deg, rgba(239, 68, 68, 0.1) 60deg, transparent 60deg)`,
                }}
              />
            </div>

            {/* Center Hunter Stand Marker */}
            <div
              className={`z-10 w-8 h-8 rounded-full border flex items-center justify-center shadow-lg text-xs font-bold ${
                isDark ? 'bg-slate-800/[var(--card-opacity)] border-emerald-500/80 text-emerald-400' : 'bg-white/[var(--card-opacity)] border-emerald-500 text-emerald-700'
              }`}
            >
              <Crosshair className="w-4 h-4" />
            </div>

          </div>
        </div>
      )}

      {/* FOOTER: WIND SPEED & DIRECTION DATA MATRIX */}
      <div className={`p-4 border-t text-center ${isDark ? 'border-slate-800/80 bg-slate-950/[var(--card-opacity)]' : 'border-slate-100 bg-slate-50/[var(--card-opacity)]'}`}>
        <div className={`text-base sm:text-lg font-extrabold flex items-center justify-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <Compass className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
          <span>{directionText}</span>
          <span className="text-amber-500">@ {speedVal} {unitLabel}</span>
        </div>
        
        <p className={`text-xs mt-1.5 flex items-center justify-center gap-1 font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Your scent blows toward:
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 text-xs font-black border border-rose-500/15">
            <Wind className="w-3 h-3" /> {getWindDirectionText(windToDeg)}
          </span>
        </p>

        {/* Tactical Hunter Alert message */}
        <div className={`mt-3.5 p-2 rounded-xl flex items-start gap-1.5 text-xs leading-relaxed text-left border ${
          isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800/80 text-slate-300' : `${hasCustomBackground ? 'bg-white/[var(--card-opacity)] backdrop-blur-md' : 'bg-white/[var(--card-opacity)]'} border-slate-200/80 text-slate-600`
        }`}>
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p>
            Avoid stands downwind of bedding areas or oak flats. Pan the map to plan a quiet entrance and exit.
          </p>
        </div>
      </div>
    </div>
  );
};
