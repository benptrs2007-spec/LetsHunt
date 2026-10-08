import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { AppSelect } from './AppSelect';
import {
  Camera,
  Compass,
  Construction,
  Crosshair,
  Droplets,
  Flag,
  Home,
  MapPin,
  Trash2,
  Edit2,
  Plus,
  Save,
  Search,
  Wind,
  Clock,
  Sparkles,
  Info,
  Check,
  X,
  Navigation,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Shapes,
  Undo,
  CheckCircle2,
  Layers,
  GitBranch,
  LucideIcon,
  Mountain,
  PawPrint,
  Route,
  Ruler,
  Sprout,
  TreeDeciduous,
  TreePine,
  Wheat
} from 'lucide-react';
import {
  ThemeMode,
  Location,
  SavedPin,
  PinType,
  DailyForecast,
  UnitSystem,
  PressureUnit,
  HourlyForecast,
  PolygonType,
  PolygonPoint,
  SavedPolygon,
  PathType,
  SavedPath,
  ThemeVariantMode
} from '../types';
import { fetch5DayHuntingForecast, searchLocations } from '../services/weatherService';
import { getBestStandForWind } from '../utils/huntingEngine';
import { TeachingEmptyState } from './TeachingEmptyState';
import { safeGetString, safeGetJSON, safeSet, safeSetJSON } from '../utils/storage';

// Builds an elongated teardrop path pointing in the +x direction: a rounded head
// at the leading (downwind) edge that tapers to a point at the trailing end.
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

interface MapViewProps {
  location: Location;
  units: UnitSystem;
  pressureUnit: PressureUnit;
  theme?: ThemeVariantMode;
  isDark?: boolean;
  hasCustomBackground?: boolean;
  dailyForecast: DailyForecast[];
  onSelectLocation?: (loc: Location) => void;
  selectedHour?: number;
  onSelectHour?: (hour: number) => void;
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

function getTileUrls(z: number, ty: number, tx: number, style: string): string[] {
  const maxTile = Math.pow(2, z);
  const wrappedTx = ((tx % maxTile) + maxTile) % maxTile;
  const clampedTy = Math.max(0, Math.min(maxTile - 1, ty));

  // Provider order matters: the first URL is the primary and the MapTile
  // fallback chain cycles back to it on retry. Google's /vt/ tile servers
  // 403 outside Google contexts, so they were removed — a 403 used to burn
  // the fallback slot and leave black holes wherever the chain ran out.
  if (style === 'satellite') {
    return [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
    ];
  } else if (style === 'topo') {
    return [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
      `https://tile.opentopomap.org/${z}/${wrappedTx}/${clampedTy}.png`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
    ];
  } else {
    const sub = ['a', 'b', 'c'][Math.abs(tx + ty) % 3];
    return [
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
      `https://${sub}.tile.openstreetmap.org/${z}/${wrappedTx}/${clampedTy}.png`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${clampedTy}/${wrappedTx}`,
    ];
  }
}

// World_Imagery and World_Topo_Map max out at zoom 18: at zoom 19 Esri answers
// every request with an HTTP 200 "Zoom Level Not Supported" error image. Pin
// the map below that so the watermark can never appear.
const MAX_ZOOM = 18;

// Esri's ArcGIS tile services occasionally respond to *valid* tile URLs with an
// HTTP 200 error image instead of real imagery — either a solid light-gray
// no-data tile or the "Zoom Level Not Supported" watermark (near-uniform
// rgb(204,204,204) with faint text). These never trigger onError because the
// response is a successful image. Drawing the tile into a tiny canvas and
// flagging images that are overwhelmingly one light color catches them;
// genuine imagery has texture, so false positives are rare, and a false
// positive only advances the existing fallback chain (re-requesting from a
// mirror) rather than painting anything wrong.
function isEsriErrorTile(img: HTMLImageElement | null): boolean {
  if (!img || !img.complete || !img.naturalWidth || !/arcgisonline\.com/.test(img.currentSrc || img.src)) {
    return false;
  }
  const w = Math.min(32, img.naturalWidth);
  const h = Math.min(32, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return false; // tainted canvas (no CORS) — leave the tile alone
  }
  const n = w * h;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  }
  const mean = sum / n;
  if (mean < 170) return false; // error tiles are light gray; real imagery varies
  let near = 0;
  for (let i = 0; i < n; i++) {
    const lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    if (Math.abs(lum - mean) < 12) near++;
  }
  return near / n > 0.95;
}

interface TileRenderCacheEntry {
  successfulUrl?: string;
  attempt: number;
  loaded: boolean;
  lastUsed: number;
}

// Keep fallback/decoded-state metadata for recently viewed tiles. React still
// mounts only the tiles in the current viewport, but revisiting a zoom level
// can now paint cached tiles immediately instead of waiting for a new load
// cycle (the browser's HTTP cache remains the source of the image bytes).
const TILE_RENDER_CACHE_LIMIT = 384;
const SCENT_CONE_SPREAD = 45;
const tileRenderCache = new Map<string, TileRenderCacheEntry>();

function trimTileRenderCache() {
  while (tileRenderCache.size > TILE_RENDER_CACHE_LIMIT) {
    const oldestKey = [...tileRenderCache.entries()].reduce((oldest, current) =>
      current[1].lastUsed < oldest[1].lastUsed ? current : oldest
    )[0];
    tileRenderCache.delete(oldestKey);
  }
}

function getTileCacheState(tileKey: string, urls: string[]) {
  const cached = tileRenderCache.get(tileKey);
  if (!cached) return { attempt: 0, loaded: false };

  cached.lastUsed = Date.now();
  const successfulIndex = cached.successfulUrl ? urls.indexOf(cached.successfulUrl) : -1;
  return {
    attempt: successfulIndex >= 0 ? successfulIndex : cached.attempt,
    loaded: successfulIndex >= 0 && cached.loaded,
  };
}

function updateTileCache(tileKey: string, update: Partial<TileRenderCacheEntry>) {
  const previous = tileRenderCache.get(tileKey);
  tileRenderCache.set(tileKey, {
    attempt: previous?.attempt ?? 0,
    loaded: previous?.loaded ?? false,
    ...previous,
    ...update,
    lastUsed: Date.now(),
  });
  trimTileRenderCache();
}

interface MapTileProps {
  tileKey: string;
  urls: string[];
  left: number;
  top: number;
  size: number;
  zIndex?: number;
  z: number;
}

const MapTile = React.memo(({ tileKey, urls, left, top, size, zIndex = 1, z }: MapTileProps) => {
  const cachedState = getTileCacheState(tileKey, urls);
  const [attempt, setAttempt] = useState(cachedState.attempt);
  const [loaded, setLoaded] = useState(cachedState.loaded);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Cycle through EVERY fallback URL — a failure never leaves the chain stuck
  // on the last provider. Each full cycle appends a cache-buster so transient
  // network hiccups recover by re-trying from the primary URL again.
  const urlIndex = attempt % urls.length;
  const cycle = Math.floor(attempt / urls.length);
  const currentUrl = urls[urlIndex] || urls[0];
  const src = cycle > 0 ? `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}_r=${cycle}` : currentUrl;

  const handleError = () => {
    if (attempt + 1 < urls.length * 3) {
      const nextAttempt = attempt + 1;
      updateTileCache(tileKey, { attempt: nextAttempt, loaded: false });
      setAttempt(nextAttempt);
    }
  };

  const handleLoad = () => {
    // Esri's ArcGIS services intermittently answer valid tile URLs with an
    // HTTP 200 *error* image (the flat light-gray "Zoom Level Not Supported"
    // watermark, or a solid no-data tile) that never fires onError because the
    // response is a successful image. Detect those and advance the fallback
    // chain instead of painting a bright box over the map.
    // Error-image inspection requires a synchronous canvas readback. Esri's
    // unsupported-zoom response is only relevant at the service ceiling, so
    // avoid paying that main-thread cost for every normal tile load.
    if (z >= MAX_ZOOM && isEsriErrorTile(imgRef.current)) {
      handleError();
      return;
    }
    updateTileCache(tileKey, {
      successfulUrl: currentUrl,
      attempt,
      loaded: true,
    });
    setLoaded(true);
  };

  // Opacity stays at zero until the tile decodes so a failed request reveals
  // the low-resolution overview instead of painting a black hole.
  // fetchPriority=high on the primary satellite URL tells the browser to
  // schedule these tile requests ahead of other background work.
  const isPrimarySatellite = urlIndex === 0 && /World_Imagery/.test(currentUrl);
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      decoding="async"
      fetchPriority={isPrimarySatellite ? 'high' : 'auto'}
      crossOrigin="anonymous"
      ref={imgRef}
      onLoad={handleLoad}
      onError={handleError}
      className="absolute object-cover border-none select-none pointer-events-none"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.ceil(size + 2.5)}px`,
        height: `${Math.ceil(size + 2.5)}px`,
        zIndex,
        opacity: loaded ? 1 : 0,
      }}
    />
  );
});

function getWindDirectionText(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

const DIRECTION_DEGREES: Record<string, number> = {
  'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5, 'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
  'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5, 'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
};

// Generate an SVG path for a filled sector (cone) centered at (cx, cy)
function getSvgArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const angleDiff = (endAngle - startAngle + 360) % 360;
  const largeArcFlag = angleDiff <= 180 ? 0 : 1;

  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

// Polygon Centroid Calculator
function getPolygonCentroid(points: PolygonPoint[]): PolygonPoint {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const pt of points) {
    sumLat += pt.lat;
    sumLng += pt.lng;
  }
  return {
    lat: sumLat / points.length,
    lng: sumLng / points.length,
  };
}

// Point in Polygon Ray-Casting Algorithm
function isPointInPolygon(lat: number, lng: number, polygonPoints: PolygonPoint[]): boolean {
  if (!polygonPoints || polygonPoints.length < 3) return false;
  let inside = false;
  const py = lat;
  const px = lng;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].lng;
    const yi = polygonPoints[i].lat;
    const xj = polygonPoints[j].lng;
    const yj = polygonPoints[j].lat;

    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Distance from point to line segment in degrees
function distanceToSegmentDeg(lat: number, lng: number, lat1: number, lng1: number, lat2: number, lng2: number): number {
  const l2 = (lat2 - lat1) * (lat2 - lat1) + (lng2 - lng1) * (lng2 - lng1);
  if (l2 === 0) return Math.hypot(lat - lat1, lng - lng1);
  let t = ((lat - lat1) * (lat2 - lat1) + (lng - lng1) * (lng2 - lng1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(lat - (lat1 + t * (lat2 - lat1)), lng - (lng1 + t * (lng2 - lng1)));
}

// Helper to find the closest point on a pixel line segment
function closestPointOnSegmentPx(
  pt: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return p1;
  let t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };
}

// Helper to find the closest point on a pixel polygon boundary (with optional safety validation)
function closestPointOnPolygonBoundaryPx(
  pt: { x: number; y: number },
  polyPx: { x: number; y: number }[],
  isSafeCallback?: (point: { x: number; y: number }) => boolean
): { x: number; y: number } {
  let closestPt = polyPx[0];
  let minDistanceSq = Infinity;
  for (let i = 0; i < polyPx.length; i++) {
    const p1 = polyPx[i];
    const p2 = polyPx[(i + 1) % polyPx.length];
    const cp = closestPointOnSegmentPx(pt, p1, p2);
    
    if (isSafeCallback && !isSafeCallback(cp)) {
      continue;
    }
    
    const distSq = (pt.x - cp.x) ** 2 + (pt.y - cp.y) ** 2;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestPt = cp;
    }
  }
  
  // Fallback: if no point is "safe", return the closest point regardless of safety
  if (minDistanceSq === Infinity) {
    for (let i = 0; i < polyPx.length; i++) {
      const p1 = polyPx[i];
      const p2 = polyPx[(i + 1) % polyPx.length];
      const cp = closestPointOnSegmentPx(pt, p1, p2);
      const distSq = (pt.x - cp.x) ** 2 + (pt.y - cp.y) ** 2;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestPt = cp;
      }
    }
  }
  return closestPt;
}

// Find the closest snap candidate (path vertex / pin / draft point) within a pixel radius
function findSnapPoint(
  lat: number,
  lng: number,
  zoom: number,
  candidates: PolygonPoint[],
  pixelRadius = 18
): PolygonPoint | null {
  if (!candidates || candidates.length === 0) return null;
  const tileSize = 256;
  const pixelsPerDegree = (tileSize * Math.pow(2, zoom)) / 360;
  const radiusDeg = pixelRadius / pixelsPerDegree;
  let best: PolygonPoint | null = null;
  let bestDist = radiusDeg;
  for (const c of candidates) {
    const dist = Math.hypot(c.lat - lat, c.lng - lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

// Polygon Area & Perimeter Calculator
function getPolygonAreaAndPerimeter(points: PolygonPoint[], unitSystem: UnitSystem) {
  if (!points || points.length < 3) return { areaStr: '0.00 Acres', acresStr: '0.00 Acres', perimeterStr: '0 ft' };

  const centroid = getPolygonCentroid(points);
  const latRad = (centroid.lat * Math.PI) / 180;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(latRad);

  const localMeters = points.map((p) => ({
    x: (p.lng - centroid.lng) * metersPerLng,
    y: (p.lat - centroid.lat) * metersPerLat,
  }));

  let areaM2 = 0;
  let perimeterM = 0;
  const n = localMeters.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    areaM2 += localMeters[i].x * localMeters[j].y;
    areaM2 -= localMeters[j].x * localMeters[i].y;

    const dx = localMeters[j].x - localMeters[i].x;
    const dy = localMeters[j].y - localMeters[i].y;
    perimeterM += Math.hypot(dx, dy);
  }

  areaM2 = Math.abs(areaM2) / 2;

  const sqFeet = areaM2 * 10.7639;
  const acres = sqFeet / 43560;

  if (unitSystem === 'metric') {
    const perimeterKm = perimeterM / 1000;
    const perimStr = perimeterM >= 1000 ? `${perimeterKm.toFixed(2)} km` : `${Math.round(perimeterM)} m`;
    const areaStr = `${acres.toFixed(2)} Acres`;
    return { areaStr, acresStr: `${acres.toFixed(2)} Acres`, perimeterStr: perimStr };
  } else {
    const perimFt = perimeterM * 3.28084;
    const perimStr = perimFt >= 5280 ? `${(perimFt / 5280).toFixed(2)} mi` : `${Math.round(perimFt)} ft`;
    const areaStr = `${acres.toFixed(2)} Acres`;
    return { areaStr, acresStr: `${acres.toFixed(2)} Acres`, perimeterStr: perimStr };
  }
}

// Metadata for Marker Types
// Renders the icon stored in PIN/POLYGON/PATH metadata, with a safe fallback.

// Shared helper for clamping a number into a [lo, hi] range.
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
const MetaIcon = ({ icon, fallback, className }: { icon?: LucideIcon; fallback: LucideIcon; className?: string }) => {
  const Icon = icon ?? fallback;
  return <Icon className={className} />;
};

export const PIN_METADATA: Record<
  PinType,
  { label: string; icon: LucideIcon; color: string; bg: string; border: string }
> = {
  stand: { label: 'Tree Stand', icon: Crosshair, color: 'bg-emerald-600 text-white', bg: 'bg-emerald-900/90 text-emerald-200', border: 'border-emerald-500' },
  trail_cam: { label: 'Trail Camera', icon: Camera, color: 'bg-sky-600 text-white', bg: 'bg-sky-900/90 text-sky-200', border: 'border-sky-500' },
  bedding: { label: 'Bedding Sanctuary', icon: PawPrint, color: 'bg-purple-600 text-white', bg: 'bg-purple-900/90 text-purple-200', border: 'border-purple-500' },
  food_plot: { label: 'Primary Food Plot', icon: Wheat, color: 'bg-lime-600 text-white', bg: 'bg-lime-900/90 text-lime-200', border: 'border-lime-500' },
  scrape: { label: 'Scrape / Rub', icon: TreeDeciduous, color: 'bg-amber-700 text-white', bg: 'bg-amber-900/90 text-amber-200', border: 'border-amber-600' },
  home: { label: 'Home / Cabin', icon: Home, color: 'bg-orange-600 text-white', bg: 'bg-orange-900/90 text-orange-200', border: 'border-orange-500' },
  other: { label: 'Other Landmark', icon: MapPin, color: 'bg-slate-500 text-white', bg: 'bg-slate-950/90 text-slate-300', border: 'border-slate-400' },
};

// Metadata for Polygon Types
export const POLYGON_METADATA: Record<
  PolygonType,
  { label: string; icon: LucideIcon; color: string; stroke: string; fill: string; fillOpacity: number; border: string; bg: string }
> = {
  crop_field: {
    label: 'Crop Field',
    icon: Sprout,
    color: '#eab308',
    stroke: '#eab308',
    fill: '#fef08a',
    fillOpacity: 0.3,
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10 text-amber-300',
  },
  food_plot: {
    label: 'Food Plot',
    icon: Wheat,
    color: '#22c55e',
    stroke: '#22c55e',
    fill: '#86efac',
    fillOpacity: 0.35,
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10 text-emerald-300',
  },
  bedding_zone: {
    label: 'Bedding Sanctuary',
    icon: PawPrint,
    color: '#a855f7',
    stroke: '#a855f7',
    fill: '#d8b4fe',
    fillOpacity: 0.35,
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/10 text-purple-300',
  },
  water_source: {
    label: 'Water Source / Creek',
    icon: Droplets,
    color: '#06b6d4',
    stroke: '#06b6d4',
    fill: '#67e8f9',
    fillOpacity: 0.35,
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500/10 text-cyan-300',
  },
  timber_woods: {
    label: 'Timber / Hardwoods',
    icon: TreePine,
    color: '#15803d',
    stroke: '#15803d',
    fill: '#4ade80',
    fillOpacity: 0.25,
    border: 'border-green-600/50',
    bg: 'bg-green-600/10 text-green-300',
  },
  custom: {
    label: 'Custom Zone',
    icon: Flag,
    color: '#f97316',
    stroke: '#f97316',
    fill: '#fdba74',
    fillOpacity: 0.3,
    border: 'border-orange-500/50',
    bg: 'bg-orange-500/10 text-orange-300',
  },
  property_boundary: {
    label: 'Property Boundary',
    icon: Home,
    color: '#f43f5e',
    stroke: '#f43f5e',
    fill: '#fda4af',
    fillOpacity: 0.0,
    border: 'border-rose-500/50',
    bg: 'bg-rose-500/10 text-rose-300',
  },
};

// Metadata for Path / Polyline Types
export const PATH_METADATA: Record<
  PathType,
  { label: string; icon: LucideIcon; color: string; stroke: string; border: string; bg: string; dash: string }
> = {
  travel_route: {
    label: 'Travel Route',
    icon: Route,
    color: '#f59e0b',
    stroke: '#f59e0b',
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10 text-amber-300',
    dash: '14 5',
  },
  deer_trail: {
    label: 'Deer Trail',
    icon: PawPrint,
    color: '#22c55e',
    stroke: '#22c55e',
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10 text-emerald-300',
    dash: '3 3',
  },
  fence_line: {
    label: 'Fence Line',
    icon: Construction,
    color: '#f43f5e',
    stroke: '#f43f5e',
    border: 'border-rose-500/50',
    bg: 'bg-rose-500/10 text-rose-300',
    dash: '8 3 2 3',
  },
  creek: {
    label: 'Creek / Waterway',
    icon: Droplets,
    color: '#06b6d4',
    stroke: '#06b6d4',
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500/10 text-cyan-300',
    dash: '10 4',
  },
  ridge: {
    label: 'Ridge Line',
    icon: Mountain,
    color: '#a855f7',
    stroke: '#a855f7',
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/10 text-purple-300',
    dash: '6 2 1 2',
  },
  custom: {
    label: 'Custom Path',
    icon: Ruler,
    color: '#f97316',
    stroke: '#f97316',
    border: 'border-orange-500/50',
    bg: 'bg-orange-500/10 text-orange-300',
    dash: '10 4',
  },
};

// Path (polyline) length in meters + formatted string
function getPathLength(points: PolygonPoint[], unitSystem: UnitSystem): string {
  if (!points || points.length < 2) return '0 ft';

  const centroid = getPolygonCentroid(points);
  const latRad = (centroid.lat * Math.PI) / 180;
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(latRad);

  let lengthM = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = (points[i + 1].lng - points[i].lng) * metersPerLng;
    const dy = (points[i + 1].lat - points[i].lat) * metersPerLat;
    lengthM += Math.hypot(dx, dy);
  }

  if (unitSystem === 'metric') {
    if (lengthM >= 1000) return `${(lengthM / 1000).toFixed(2)} km`;
    return `${Math.round(lengthM)} m`;
  }
  const feet = lengthM * 3.28084;
  return feet >= 5280 ? `${(feet / 5280).toFixed(2)} mi` : `${Math.round(feet).toLocaleString()} ft`;
}

// Midpoint along a path (vertex at ~half distance) for label placement
function getPathMidpoint(points: PolygonPoint[]): PolygonPoint {
  if (!points || points.length === 0) return { lat: 0, lng: 0 };
  return points[Math.floor((points.length - 1) / 2)];
}

// Approximate distance in meters between two lat/lng points (flat-earth approx, fine for hunting areas)
function approxDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat1 - lat2) * 111320;
  const dLng = (lng1 - lng2) * 111320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Compute bearing (0-360) from point a to point b
function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Absolute angular difference (0-180)
function angleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

// Point-in-polygon via ray casting
function pointInPolygon(pt: PolygonPoint, polygon: PolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lng,
      yj = polygon[j].lng;
    if (yi > pt.lng !== yj > pt.lng && pt.lat < ((polygon[j].lat - polygon[i].lat) * (pt.lng - yi)) / (yj - yi) + polygon[i].lat) {
      inside = !inside;
    }
  }
  return inside;
}

// Polygon centroid
function polygonCentroid(points: PolygonPoint[]): PolygonPoint {
  let cx = 0,
    cy = 0;
  for (const pt of points) {
    cx += pt.lat;
    cy += pt.lng;
  }
  return { lat: cx / points.length, lng: cy / points.length };
}

interface SegmentProjection {
  point: PolygonPoint;
  t: number;
  distance: number;
}

interface SegmentClosestPoints {
  first: PolygonPoint;
  second: PolygonPoint;
  distance: number;
  firstT: number;
  secondT: number;
}

function projectPointOntoSegment(point: PolygonPoint, start: PolygonPoint, end: PolygonPoint): SegmentProjection {
  const dx = end.lat - start.lat;
  const dy = end.lng - start.lng;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.lat - start.lat) * dx + (point.lng - start.lng) * dy) / lengthSq));
  const projected = { lat: start.lat + dx * t, lng: start.lng + dy * t };
  return { point: projected, t, distance: approxDistance(point.lat, point.lng, projected.lat, projected.lng) };
}

function getSegmentIntersection(
  a: PolygonPoint,
  b: PolygonPoint,
  c: PolygonPoint,
  d: PolygonPoint
): { point: PolygonPoint; firstT: number; secondT: number } | null {
  const rLat = b.lat - a.lat;
  const rLng = b.lng - a.lng;
  const sLat = d.lat - c.lat;
  const sLng = d.lng - c.lng;
  const denominator = rLat * sLng - rLng * sLat;
  if (Math.abs(denominator) < 1e-12) return null;

  const cMinusALat = c.lat - a.lat;
  const cMinusALng = c.lng - a.lng;
  const firstT = (cMinusALat * sLng - cMinusALng * sLat) / denominator;
  const secondT = (cMinusALat * rLng - cMinusALng * rLat) / denominator;
  if (firstT < -1e-8 || firstT > 1 + 1e-8 || secondT < -1e-8 || secondT > 1 + 1e-8) return null;

  return {
    point: { lat: a.lat + firstT * rLat, lng: a.lng + firstT * rLng },
    firstT: Math.max(0, Math.min(1, firstT)),
    secondT: Math.max(0, Math.min(1, secondT)),
  };
}

// Returns the closest points on two path segments. This lets the route join paths
// where they cross or pass close to each other, even when neither connection is a vertex.
function closestPointsOnSegments(
  a: PolygonPoint,
  b: PolygonPoint,
  c: PolygonPoint,
  d: PolygonPoint
): SegmentClosestPoints {
  const intersection = getSegmentIntersection(a, b, c, d);
  if (intersection) {
    return {
      first: intersection.point,
      second: intersection.point,
      distance: 0,
      firstT: intersection.firstT,
      secondT: intersection.secondT,
    };
  }

  const candidates: SegmentClosestPoints[] = [];
  const fromA = projectPointOntoSegment(a, c, d);
  candidates.push({ first: a, second: fromA.point, distance: fromA.distance, firstT: 0, secondT: fromA.t });
  const fromB = projectPointOntoSegment(b, c, d);
  candidates.push({ first: b, second: fromB.point, distance: fromB.distance, firstT: 1, secondT: fromB.t });
  const fromC = projectPointOntoSegment(c, a, b);
  candidates.push({ first: fromC.point, second: c, distance: fromC.distance, firstT: fromC.t, secondT: 0 });
  const fromD = projectPointOntoSegment(d, a, b);
  candidates.push({ first: fromD.point, second: d, distance: fromD.distance, firstT: fromD.t, secondT: 1 });
  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

function pointsAreSame(a: PolygonPoint, b: PolygonPoint, toleranceMeters = 0.5): boolean {
  return approxDistance(a.lat, a.lng, b.lat, b.lng) <= toleranceMeters;
}

export const MapView: React.FC<MapViewProps> = ({
  location,
  units,
  pressureUnit,
  theme,
  isDark = theme === 'dark',
  hasCustomBackground = false,
  dailyForecast,
  onSelectLocation,
  selectedHour: propSelectedHour,
  onSelectHour: propOnSelectHour,
}) => {

  // State: Saved Pins loaded from localStorage
  const [pins, setPins] = useState<SavedPin[]>(() => {
    return safeGetJSON<SavedPin[]>('letshunt_saved_pins', []);
  });

  // State: Saved Polygons loaded from localStorage
  const [polygons, setPolygons] = useState<SavedPolygon[]>(() => {
    return safeGetJSON<SavedPolygon[]>('letshunt_saved_polygons', []);
  });

  // State: Saved Paths (polylines / routes) loaded from localStorage
  const [paths, setPaths] = useState<SavedPath[]>(() => {
    return safeGetJSON<SavedPath[]>('letshunt_saved_paths', []);
  });

  // Floating Dropdown Controls on Map
  const [showLayersDropdown, setShowLayersDropdown] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [activeLayersTab, setActiveLayersTab] = useState<'pins' | 'polygons' | 'paths'>('pins');

  // Interactive Pin Placement mode
  const [isPlacingMarkerMode, setIsPlacingMarkerMode] = useState(false);

  // Preferred Wind Overlay toggle
  const [showPreferredWind, setShowPreferredWind] = useState(() => {
    const saved = safeGetString('letshunt_show_preferred_wind');
    return saved ? saved === 'true' : true;
  });
  const [showScentCone, setShowScentCone] = useState(() => {
    const saved = safeGetString('letshunt_show_scent_cone');
    return saved ? saved === 'true' : true;
  });
  // Currently selected pin / polygon
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [bestPathActive, setBestPathActive] = useState(false);
  const [bestPathError, setBestPathError] = useState<string | null>(null);
  const [bestRouteGeometry, setBestRouteGeometry] = useState<PolygonPoint[] | null>(null);

  // Form inputs for active editing pin
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<PinType>('stand');
  const [editNotes, setEditNotes] = useState('');
  const [editPreferredWindDeg, setEditPreferredWindDeg] = useState<number>(0);

  // Polygon creation & editing
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState<PolygonPoint[]>([]);
  const [isSavingNewPolygonModal, setIsSavingNewPolygonModal] = useState(false);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(null);
  const [polygonEditName, setPolygonEditName] = useState('');
  const [polygonEditType, setPolygonEditType] = useState<PolygonType>('food_plot');
  const [polygonEditNotes, setPolygonEditNotes] = useState('');

  // Path creation & editing
  const [isDrawingPath, setIsDrawingPath] = useState(false);
  const [currentPathPoints, setCurrentPathPoints] = useState<PolygonPoint[]>([]);
  const [isSavingNewPathModal, setIsSavingNewPathModal] = useState(false);
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [pathEditName, setPathEditName] = useState('');
  const [pathEditType, setPathEditType] = useState<PathType>('travel_route');
  const [pathEditNotes, setPathEditNotes] = useState('');

  // Snap target preview while drawing a path (highlights the vertex the next click will stick to)
  const [pathSnapPreview, setPathSnapPreview] = useState<PolygonPoint | null>(null);

  // Map view parameters
  const [zoom, setZoom] = useState(16);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'topo' | 'street'>(() => {
    const saved = safeGetString('letshunt_map_style');
    return (saved as 'satellite' | 'topo' | 'street') || 'satellite';
  });
  const [isScentPanelCollapsed, setIsScentPanelCollapsed] = useState(true);
  const [activeForecasterTab, setActiveForecasterTab] = useState<'hourly' | 'details'>('hourly');

  // One shared hourly weather control for wind + forecast precipitation.
  const [showHourlyWeather, setShowHourlyWeather] = useState(false);

  // Tile images remain available through the browser's HTTP cache. Avoiding a
  // second in-memory <img> cache layer keeps hundreds of stale DOM images from
  // competing with the current tile set and eliminates cache-load re-renders of
  // the entire map overlay.

  useEffect(() => {
    safeSet('letshunt_show_preferred_wind', showPreferredWind.toString());
  }, [showPreferredWind]);

  useEffect(() => {
    safeSet('letshunt_show_scent_cone', showScentCone.toString());
  }, [showScentCone]);

  useEffect(() => {
    safeSet('letshunt_map_style', mapStyle);
  }, [mapStyle]);

  const defaultLat = location.latitude;
  const defaultLng = location.longitude;
  const [centerLat, setCenterLat] = useState(defaultLat);
  const [centerLng, setCenterLng] = useState(defaultLng);
  // Refs let throttled gesture tile refreshes use the latest committed view
  // without forcing a React render for every finger/mouse movement.
  const centerLatRef = useRef(centerLat);
  const centerLngRef = useRef(centerLng);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    centerLatRef.current = centerLat;
    centerLngRef.current = centerLng;
  }, [centerLat, centerLng]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // When location changes, update map center
  useEffect(() => {
    setCenterLat(location.latitude);
    setCenterLng(location.longitude);
  }, [location]);

  // Keyboard shortcut listener: ESC key exits modes & closes dropdowns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingPolygon) {
          setIsDrawingPolygon(false);
          setCurrentPolygonPoints([]);
        } else if (isDrawingPath) {
          setIsDrawingPath(false);
          setCurrentPathPoints([]);
          setPathSnapPreview(null);
        } else if (isPlacingMarkerMode) {
          setIsPlacingMarkerMode(false);
        } else {
          setShowLayersDropdown(false);
          setShowAddDropdown(false);
          setShowHourlyWeather(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawingPolygon, isDrawingPath, isPlacingMarkerMode]);

  // Scent analysis parameters (forecast day and hour selection)
  const [forecastDays, setForecastDays] = useState<DailyForecast[]>(dailyForecast);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [localSelectedHour, setLocalSelectedHour] = useState<number>(() => new Date().getHours());
  const selectedHour = propSelectedHour !== undefined ? propSelectedHour : localSelectedHour;
  const setSelectedHour = propOnSelectHour || setLocalSelectedHour;
  const [showBestWindBadge, setShowBestWindBadge] = useState(true);

  // Individual pin weather forecasts cache
  const [pinWeatherCache, setPinWeatherCache] = useState<Record<string, DailyForecast[]>>({});
  const [loadingPinWeather, setLoadingPinWeather] = useState(false);

  useEffect(() => {
    setForecastDays(dailyForecast);
  }, [dailyForecast]);

  // Drag-to-Pan & Pinch state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const touchTapHandledRef = useRef(false);
  const pinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const hasMovedRef = useRef<boolean>(false);
  // CSS-transform panning: offset accumulates during drag and is applied
  // directly to the DOM (bypassing React state) for 60fps smoothness.
  const panOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Gesture tile refreshes periodically commit the currently visible map view
  // while the CSS transform continues moving it. This keeps new tiles loading
  // during a long pan/pinch instead of waiting for release.
  const panTileRefreshRafRef = useRef<number | null>(null);
  const pinchTileRefreshRafRef = useRef<number | null>(null);
  const lastPanTileRefreshRef = useRef(0);
  const lastPinchTileRefreshRef = useRef(0);
  const latestPinchDistanceRef = useRef<number | null>(null);
  // CSS-transform zooming: scale accumulates during wheel/pinch and is applied
  // directly to the DOM. State is synced only after the gesture ends.
  const zoomScaleRef = useRef<number>(1);
  const wheelZoomRafRef = useRef<number | null>(null);
  const wheelZoomCommitTimerRef = useRef<number | null>(null);
  const wheelZoomBaseRef = useRef<number | null>(null);
  const wheelZoomDeltaRef = useRef(0);
  // CSS-transform rotation: angle in degrees, applied directly to the DOM
  // during two-finger rotation gestures for instant visual feedback.
  const rotationRef = useRef<number>(0);
  const [rotationDisplay, setRotationDisplay] = useState(0);
  const initialPinchAngleRef = useRef<number | null>(null);
  // Track the last frame's angle between the two fingers so rotation can
  // accumulate in small normalized deltas instead of diffing against the
  // gesture-start angle — atan2 wraps discontinuously at +/-180° and fingers
  // can swap order mid-gesture, both of which produced embarrassing 360°
  // jumps that snapped the map to a wildly wrong orientation.
  const lastRotationAngleRef = useRef<number | null>(null);
  // Marker visuals inherit these DOM-updated variables during gestures. The
  // geographic position remains inside the transformed map; only each marker's
  // visual is counter-scaled/counter-rotated so it stays anchored, upright, and
  // the same size while the map moves.
  const pinVisualsRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 640,
    height: typeof window !== 'undefined' ? window.innerHeight : 480,
  }));

  // Location Search inside Map
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  // Search field is collapsed to an icon by default; it only expands while
  // in use so the toolbar never crowds the Layers button on the right edge.
  const [showSearchBox, setShowSearchBox] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Wind droplets only animate while the map itself is on screen. Freezing
  // via animationPlayState keeps every droplet mid-flight, so returning to
  // the map resumes the flow instantly instead of restarting it.
  const [isMapVisible, setIsMapVisible] = useState(true);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsMapVisible(entry.isIntersecting),
      { rootMargin: '120px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (panTileRefreshRafRef.current !== null) cancelAnimationFrame(panTileRefreshRafRef.current);
      if (pinchTileRefreshRafRef.current !== null) cancelAnimationFrame(pinchTileRefreshRafRef.current);
      if (wheelZoomRafRef.current !== null) cancelAnimationFrame(wheelZoomRafRef.current);
      if (wheelZoomCommitTimerRef.current !== null) window.clearTimeout(wheelZoomCommitTimerRef.current);
    };
  }, []);

  // Measure map container size dynamically
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const updateSize = () => {
      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Location search effect
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchLocations(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Search location error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener for search & dropdowns. Clicking elsewhere on
  // the map also tucks the search field away again once you're done with it.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        if (showSearchBox && searchQuery.trim() === '') {
          setShowSearchBox(false);
          setSearchResults([]);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearchBox, searchQuery]);

  // Save pins to localStorage
  const savePinsToStorage = (updatedPins: SavedPin[]) => {
    setPins(updatedPins);
    safeSetJSON('letshunt_saved_pins', updatedPins);
  };

  // Save polygons to localStorage
  const savePolygonsToStorage = (updatedPolygons: SavedPolygon[]) => {
    setPolygons(updatedPolygons);
    safeSetJSON('letshunt_saved_polygons', updatedPolygons);
  };

  // Save paths to localStorage
  const savePathsToStorage = (updatedPaths: SavedPath[]) => {
    setPaths(updatedPaths);
    safeSetJSON('letshunt_saved_paths', updatedPaths);
  };

  // Layer & Element Visibility Toggles
  const [showPropertyBoundaries, setShowPropertyBoundaries] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_property_boundaries');
    return saved ? saved === 'true' : true;
  });
  const [showZones, setShowZones] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_zones');
    return saved ? saved === 'true' : true;
  });
  const [showPaths, setShowPaths] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_paths');
    return saved ? saved === 'true' : true;
  });
  const [showPins, setShowPins] = useState(() => {
    const saved = localStorage.getItem('letshunt_show_pins');
    return saved ? saved === 'true' : true;
  });
  const [hiddenPinIds, setHiddenPinIds] = useState<string[]>([]);

  useEffect(() => {
    safeSet('letshunt_show_property_boundaries', showPropertyBoundaries.toString());
  }, [showPropertyBoundaries]);

  useEffect(() => {
    safeSet('letshunt_show_zones', showZones.toString());
  }, [showZones]);

  useEffect(() => {
    safeSet('letshunt_show_paths', showPaths.toString());
  }, [showPaths]);

  useEffect(() => {
    safeSet('letshunt_show_pins', showPins.toString());
  }, [showPins]);

  // Pin name labels on the map (default off: the selected pin and hover
  // still reveal a label; this toggle restores always-on names).
  const [showPinLabels, setShowPinLabels] = useState(() => {
    const saved = safeGetString('letshunt_show_pin_labels');
    return saved ? saved === 'true' : false;
  });

  useEffect(() => {
    safeSet('letshunt_show_pin_labels', showPinLabels.toString());
  }, [showPinLabels]);
  const [hiddenPolygonIds, setHiddenPolygonIds] = useState<string[]>([]);
  const [hiddenPathIds, setHiddenPathIds] = useState<string[]>([]);

  const lastPinchTimeRef = useRef<number>(0);

  const visiblePolygons = useMemo(() => {
    return polygons.filter((poly) => {
      if (poly.type === 'property_boundary' && !showPropertyBoundaries) return false;
      if (poly.type !== 'property_boundary' && !showZones) return false;
      if (hiddenPolygonIds.includes(poly.id)) return false;
      return true;
    });
  }, [polygons, showPropertyBoundaries, showZones, hiddenPolygonIds]);

  const visiblePaths = useMemo(() => {
    if (!showPaths) return [];
    return paths.filter((p) => !hiddenPathIds.includes(p.id));
  }, [paths, showPaths, hiddenPathIds]);

  const visiblePins = useMemo(() => {
    if (!showPins) return [];
    return pins.filter((p) => !hiddenPinIds.includes(p.id));
  }, [pins, showPins, hiddenPinIds]);

  // Currently active pin
  const selectedPin = useMemo(() => {
    return pins.find((p) => p.id === selectedPinId) || null;
  }, [pins, selectedPinId]);

  // Currently active polygon
  const selectedPolygon = useMemo(() => {
    return polygons.find((p) => p.id === selectedPolygonId) || null;
  }, [polygons, selectedPolygonId]);

  const selectedPolyStats = useMemo(() => {
    if (!selectedPolygon) return null;
    return getPolygonAreaAndPerimeter(selectedPolygon.points, units);
  }, [selectedPolygon, units]);

  // Currently active path
  const selectedPath = useMemo(() => {
    return paths.find((p) => p.id === selectedPathId) || null;
  }, [paths, selectedPathId]);

  const selectedPathStats = useMemo(() => {
    if (!selectedPath) return null;
    return { lengthStr: getPathLength(selectedPath.points, units) };
  }, [selectedPath, units]);

  // Snap candidates while drawing: vertices of all visible paths, draft points, and pin locations
  const pathSnapCandidates = useMemo(() => {
    const cands: PolygonPoint[] = [];
    for (const path of visiblePaths) {
      for (const pt of path.points) cands.push(pt);
    }
    for (const pt of currentPathPoints) cands.push(pt);
    for (const pin of visiblePins) cands.push({ lat: pin.lat, lng: pin.lng });
    return cands;
  }, [visiblePaths, currentPathPoints, visiblePins]);

  // Center the map on the user's current GPS location
  const [isLocating, setIsLocating] = useState(false);
  // Live GPS fix captured by the locate button — drives the blue "my location"
  // dot on the map instead of the dot being pinned to the forecast location.
  const [gpsFix, setGpsFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const gpsWatchIdRef = useRef<number | null>(null);
  const hasInitialGpsFixRef = useRef(false);

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }

    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    }

    setIsLocating(true);
    hasInitialGpsFixRef.current = false;
    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setGpsFix({ lat: latitude, lng: longitude, accuracy: accuracy || 25 });

        // Center and zoom only on the first fix. Later fixes keep the marker
        // current without pulling the hunter's manually panned map away.
        if (!hasInitialGpsFixRef.current) {
          hasInitialGpsFixRef.current = true;
          setCenterLat(latitude);
          setCenterLng(longitude);
          setZoom(16);
        }
        setIsLocating(false);
      },
      (error) => {
        console.warn('GPS position request notice:', error?.message || error);
        setIsLocating(false);
        alert('Could not access your location. Please allow location access for LetsHunt and try again.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  // Fetch pin-specific weather if selected
  useEffect(() => {
    if (!selectedPin) return;

    const isNearMain =
      Math.abs(selectedPin.lat - location.latitude) < 0.015 &&
      Math.abs(selectedPin.lng - location.longitude) < 0.015;

    if (isNearMain) return;

    if (pinWeatherCache[selectedPin.id]) return;

    const fetchPinWeather = async () => {
      setLoadingPinWeather(true);
      try {
        const pinLocation: Location = {
          name: selectedPin.name,
          latitude: selectedPin.lat,
          longitude: selectedPin.lng,
        };
        const data = await fetch5DayHuntingForecast(pinLocation, units, pressureUnit);
        if (data && data.length > 0) {
          setPinWeatherCache((prev) => ({
            ...prev,
            [selectedPin.id]: data,
          }));
        }
      } catch (err) {
        console.error('Failed to fetch pin weather:', err);
      } finally {
        setLoadingPinWeather(false);
      }
    };

    fetchPinWeather();
  }, [selectedPin, location, units, pressureUnit, pinWeatherCache]);

  const activeForecasts = useMemo(() => {
    if (selectedPin && pinWeatherCache[selectedPin.id]) {
      return pinWeatherCache[selectedPin.id];
    }
    return forecastDays;
  }, [selectedPin, pinWeatherCache, forecastDays]);

  const activeDayForecast = activeForecasts[selectedDayIndex] || activeForecasts[0];

  const currentHourForecast: HourlyForecast | undefined = useMemo(() => {
    if (!activeDayForecast || !activeDayForecast.hourly || activeDayForecast.hourly.length === 0) return undefined;
    
    // Direct 0-23 index lookup (since daily hourly array always contains 24 hours indexed 0..23)
    const clampedHour = Math.max(0, Math.min(23, selectedHour));
    if (activeDayForecast.hourly[clampedHour]) {
      return activeDayForecast.hourly[clampedHour];
    }
    
    // Fallback match by timestamp hour
    return activeDayForecast.hourly.find((h) => {
      if (h.timestamp) {
        const d = new Date(h.timestamp);
        if (!isNaN(d.getTime())) return d.getHours() === clampedHour;
      }
      return false;
    }) || activeDayForecast.hourly[0];
  }, [activeDayForecast, selectedHour]);

  const windDeg = currentHourForecast ? currentHourForecast.windDirectionDeg : location ? 0 : 0;
  const windDirText = currentHourForecast ? currentHourForecast.windDirectionText : 'N';
  const windMph = currentHourForecast ? currentHourForecast.windSpeedMph : 5;

  const displayWindSpeed = useMemo(() => {
    if (units === 'metric') {
      const kmh = currentHourForecast ? currentHourForecast.windSpeedKmh : Math.round(windMph * 1.60934);
      return `${kmh} km/h`;
    }
    return `${windMph} mph`;
  }, [units, currentHourForecast, windMph]);

  const displayPrecipAmount = currentHourForecast
    ? units === 'imperial'
      ? `${(currentHourForecast.precipMm * 0.0393701).toFixed(2)} in`
      : `${currentHourForecast.precipMm.toFixed(1)} mm`
    : units === 'imperial' ? '0.00 in' : '0.0 mm';
  const precipProbability = currentHourForecast?.precipProbability ?? 0;

  const downwindDeg = (windDeg + 180) % 360;
  const downwindDirText = getWindDirectionText(downwindDeg);

  // Day stepper state for the hourly sliders: step the wind animation (and all
  // hourly stats) across forecast days. The forecast window always starts
  // today, so "previous day" from the first day is simply disabled.
  const stepForecastDay = (direction: -1 | 1) => {
    setSelectedDayIndex((prev) => Math.min(activeForecasts.length - 1, Math.max(0, prev + direction)));
  };
  const dayNav = activeDayForecast ? {
    label: activeDayForecast.dayName === 'Today' ? 'Today' : activeDayForecast.dayName === 'Tomorrow' ? 'Tmrw' : activeDayForecast.dayName,
    date: activeDayForecast.dateFormatted,
    hasPrev: selectedDayIndex > 0,
    hasNext: selectedDayIndex < activeForecasts.length - 1,
  } : null;
  const dayStepper = dayNav ? (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        onClick={() => stepForecastDay(-1)}
        disabled={!dayNav.hasPrev}
        className={`p-0.5 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
          dayNav.hasPrev ? (isDark ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-emerald-500/10') : 'text-slate-400'
        }`}
        title="Previous day"
        aria-label="Show previous forecast day"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
        {dayNav.label}
        <span className={`hidden sm:inline ${isDark ? 'text-slate-400' : 'text-slate-500'}`}> · {dayNav.date}</span>
      </span>
      <button
        onClick={() => stepForecastDay(1)}
        disabled={!dayNav.hasNext}
        className={`p-0.5 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
          dayNav.hasNext ? (isDark ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-emerald-500/10') : 'text-slate-400'
        }`}
        title="Next day"
        aria-label="Show next forecast day"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : null;

  // Compute one ordered route geometry instead of merely coloring whole paths.
  // The graph is split at path crossings and pin projections, so the highlight
  // uses only coordinates that are actually on the user's drawn paths.
  useEffect(() => {
    // A route belongs to one selected stand. Selecting another marker starts a
    // fresh Best Path calculation instead of leaving the old route on screen.
    setBestPathActive(false);
    setBestPathError(null);
    setBestRouteGeometry(null);
  }, [selectedPinId]);

  const computeBestPathsToStand = useCallback((): PolygonPoint[] | null => {
    if (!selectedPin || visiblePaths.length === 0) return null;
    const homeMarker = pins.find((pin) => pin.type === 'home');
    if (!homeMarker) return null;

    type RouteNode = { id: string; point: PolygonPoint; edges: Map<string, number> };
    type RouteSegment = { start: PolygonPoint; end: PolygonPoint; nodes: { id: string; t: number }[] };
    const nodes = new Map<string, RouteNode>();
    let nextNodeId = 0;

    const addNode = (point: PolygonPoint): string => {
      for (const node of nodes.values()) {
        if (pointsAreSame(node.point, point)) return node.id;
      }
      const id = `route-node-${nextNodeId++}`;
      nodes.set(id, { id, point, edges: new Map() });
      return id;
    };

    const addEdge = (firstId: string, secondId: string, extraCost = 0) => {
      if (firstId === secondId) return;
      const first = nodes.get(firstId);
      const second = nodes.get(secondId);
      if (!first || !second) return;
      const distance = approxDistance(first.point.lat, first.point.lng, second.point.lat, second.point.lng);
      const cost = distance + extraCost;
      if (!Number.isFinite(cost)) return;
      const oldForward = first.edges.get(secondId);
      const oldReverse = second.edges.get(firstId);
      if (oldForward === undefined || cost < oldForward) first.edges.set(secondId, cost);
      if (oldReverse === undefined || cost < oldReverse) second.edges.set(firstId, cost);
    };

    const scentPenalty = (from: PolygonPoint, to: PolygonPoint): number => {
      const edgeDistance = approxDistance(from.lat, from.lng, to.lat, to.lng);
      const sampleCount = Math.max(2, Math.ceil(edgeDistance / 25));
      let penalty = 0;
      const beddingPolygons = visiblePolygons.filter((polygon) => polygon.type === 'bedding_zone');

      // Check several points along the entire edge. This prevents a long path
      // segment from crossing the downwind cone or a bedding zone while its
      // midpoint happens to look safe.
      for (let index = 0; index <= sampleCount; index++) {
        const t = index / sampleCount;
        const sample = {
          lat: from.lat + (to.lat - from.lat) * t,
          lng: from.lng + (to.lng - from.lng) * t,
        };
        const towardStand = angleDiff(downwindDeg, computeBearing(sample.lat, sample.lng, selectedPin.lat, selectedPin.lng));
        // Strongly penalize, but never forbid, a segment inside the downwind
        // cone. Best Path must always return the least-bad available option for
        // this hour instead of disappearing when every route has some scent risk.
        if (towardStand < 30) penalty += 10000 / sampleCount;
        else if (towardStand < 60) penalty += 90 / sampleCount;
        else if (towardStand < 90) penalty += 25 / sampleCount;

        for (const bedding of beddingPolygons) {
          const center = polygonCentroid(bedding.points);
          if (angleDiff(downwindDeg, computeBearing(sample.lat, sample.lng, center.lat, center.lng)) < 50) {
            penalty += 130 / sampleCount;
          }
          if (pointInPolygon(sample, bedding.points)) penalty += 260 / sampleCount;
        }
      }
      return penalty;
    };

    const routeSegments = visiblePaths
      .filter((path) => path.points.length >= 2)
      .flatMap((path) => path.points.slice(0, -1).map((point, index) => {
        const segment: RouteSegment = {
          start: point,
          end: path.points[index + 1],
          nodes: [],
        };
        segment.nodes.push({ id: addNode(segment.start), t: 0 });
        segment.nodes.push({ id: addNode(segment.end), t: 1 });
        return segment;
      }));

    // Split both paths wherever they cross or pass within 35m. This is the key
    // difference from the old endpoint-only graph.
    for (let firstIndex = 0; firstIndex < routeSegments.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < routeSegments.length; secondIndex++) {
        const first = routeSegments[firstIndex];
        const second = routeSegments[secondIndex];
        const closest = closestPointsOnSegments(first.start, first.end, second.start, second.end);
        // Only true crossings/shared endpoints become graph connections.
        // Nearby parallel paths are intentionally left untouched so the route
        // can never manufacture an off-path shortcut.
        if (closest.distance <= 0.5) {
          const intersectionId = addNode(closest.first);
          first.nodes.push({ id: intersectionId, t: closest.firstT });
          second.nodes.push({ id: intersectionId, t: closest.secondT });
        }
      }
    }

    // Add each pin's nearest point on a drawn segment as a graph anchor. There
    // is intentionally no pin-to-path edge: the marker must already be on the
    // drawn path. Only sub-meter coordinate rounding is tolerated; the route
    // never draws a connector from the path to an off-path marker.
    // A Best Path endpoint must be on the drawn path. This tiny tolerance is
    // only for floating-point rounding; no connector is ever drawn to a pin.
    const pinSnapLimit = 0.5;
    const findPathAnchor = (pin: PolygonPoint): string | null => {
      let nearest: { segment: RouteSegment; projection: SegmentProjection } | null = null;
      for (const segment of routeSegments) {
        const projection = projectPointOntoSegment(pin, segment.start, segment.end);
        if (projection.distance > pinSnapLimit) continue;
        if (!nearest || projection.distance < nearest.projection.distance) {
          nearest = { segment, projection };
        }
      }
      if (!nearest) return null;

      // Split only the nearest segment. Adding pin projections to every nearby
      // segment creates orphan nodes and can make the graph look connected when
      // the marker actually touches just one path.
      const projectedId = addNode(nearest.projection.point);
      nearest.segment.nodes.push({ id: projectedId, t: nearest.projection.t });
      return projectedId;
    };
    const homeId = findPathAnchor(homeMarker);
    const standId = findPathAnchor(selectedPin);
    if (!homeId || !standId) return null;

    // Join consecutive split points on each original segment, preserving the
    // original path geometry and allowing partial-path traversal.
    for (const segment of routeSegments) {
      const uniqueNodes = new Map<string, number>();
      for (const item of segment.nodes) uniqueNodes.set(item.id, item.t);
      const ordered = [...uniqueNodes.entries()].sort((a, b) => a[1] - b[1]);
      for (let index = 0; index < ordered.length - 1; index++) {
        const firstNode = nodes.get(ordered[index][0]);
        const secondNode = nodes.get(ordered[index + 1][0]);
        if (!firstNode || !secondNode) continue;
        const extraCost = scentPenalty(firstNode.point, secondNode.point);
        addEdge(firstNode.id, secondNode.id, extraCost);
      }
    }

    // Dijkstra over the split path network. Every edge below is a portion of a
    // saved path, so the route cannot leave the drawn geometry.
    const distance = new Map<string, number>([[homeId, 0]]);
    const previous = new Map<string, string>();
    const queue: { id: string; cost: number }[] = [{ id: homeId, cost: 0 }];
    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      if (current.cost !== distance.get(current.id)) continue;
      if (current.id === standId) break;
      const currentNode = nodes.get(current.id);
      if (!currentNode) continue;
      for (const [nextId, edgeCost] of currentNode.edges) {
        const nextCost = current.cost + edgeCost;
        if (nextCost < (distance.get(nextId) ?? Infinity)) {
          distance.set(nextId, nextCost);
          previous.set(nextId, current.id);
          queue.push({ id: nextId, cost: nextCost });
        }
      }
    }

    // If the drawn network cannot connect the on-path Home and stand anchors,
    // there is no valid path-only route to display. This does not happen merely
    // because scent is unfavorable: scent risk is always finite and selectable.
    if (!distance.has(standId)) return null;

    const route: PolygonPoint[] = [];
    let currentId: string | undefined = standId;
    while (currentId) {
      const node = nodes.get(currentId);
      if (!node) break;
      route.push(node.point);
      currentId = previous.get(currentId);
    }
    route.reverse();
    return route;
  }, [selectedPin, visiblePaths, visiblePolygons, downwindDeg, pins]);

  // Keep an active Best Path live while the selected hour changes. The route
  // recomputes from the current wind direction instead of disappearing.
  useEffect(() => {
    if (!bestPathActive) {
      setBestRouteGeometry(null);
      setBestPathError(null);
      // Keep the shared hourly weather slider open while its hour changes.
      // Explicit close actions and Best Path toggle-off still hide it.
      return;
    }

    const route = computeBestPathsToStand();
    setBestRouteGeometry(route);
    // Keep Best Path mode and the wind visualization active. The route itself
    // is always the least-scent-risk connected option available for this hour;
    // an error is reserved for genuinely disconnected/off-path anchors.
    setBestPathError(route ? null : 'Home and this stand must both touch connected drawn paths.');
    setShowHourlyWeather(true);
  }, [bestPathActive, computeBestPathsToStand]);

  // Polygon drawing handlers
  const handleStartDrawPolygon = () => {
    setIsDrawingPolygon(true);
    setIsDrawingPath(false);
    setIsPlacingMarkerMode(false);
    setCurrentPolygonPoints([]);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setSelectedPathId(null);
    setShowAddDropdown(false);
  };

  const handleStartDrawPropertyBoundary = () => {
    setIsDrawingPolygon(true);
    setIsDrawingPath(false);
    setIsPlacingMarkerMode(false);
    setCurrentPolygonPoints([]);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setSelectedPathId(null);
    setPolygonEditType('property_boundary');
    setPolygonEditName('Property Line Boundary');
    setShowAddDropdown(false);
  };

  const handleStartDrawPath = () => {
    setIsDrawingPath(true);
    setIsDrawingPolygon(false);
    setIsPlacingMarkerMode(false);
    setCurrentPathPoints([]);
    setPathSnapPreview(null);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setSelectedPathId(null);
    setShowAddDropdown(false);
  };

  const handleUndoPathPoint = () => {
    setCurrentPathPoints((prev) => prev.slice(0, -1));
  };

  const handleFinishDrawPath = () => {
    if (currentPathPoints.length < 2) {
      alert('A path requires at least 2 points.');
      return;
    }
    setPathSnapPreview(null);
    setPathEditName(`Path #${paths.length + 1}`);
    setPathEditType('travel_route');
    setPathEditNotes('');
    setIsSavingNewPathModal(true);
  };

  const handleSaveNewPath = () => {
    if (currentPathPoints.length < 2) return;
    const newId = `path-${Date.now()}`;
    const newPath: SavedPath = {
      id: newId,
      name: pathEditName.trim() || `Path #${paths.length + 1}`,
      type: pathEditType,
      points: currentPathPoints,
      notes: pathEditNotes.trim(),
      createdAt: Date.now(),
    };
    const updated = [...paths, newPath];
    savePathsToStorage(updated);
    setIsSavingNewPathModal(false);
    setIsDrawingPath(false);
    setCurrentPathPoints([]);
    setPathSnapPreview(null);
    setSelectedPathId(newId);
  };

  const handleDeletePath = (pathId: string) => {
    const updated = paths.filter((p) => p.id !== pathId);
    savePathsToStorage(updated);
    if (selectedPathId === pathId) {
      setSelectedPathId(null);
    }
  };

  const handleSavePathEdit = () => {
    if (!editingPathId) return;
    const updated = paths.map((p) => {
      if (p.id === editingPathId) {
        return {
          ...p,
          name: pathEditName.trim() || p.name,
          type: pathEditType,
          notes: pathEditNotes.trim(),
        };
      }
      return p;
    });
    savePathsToStorage(updated);
    setEditingPathId(null);
  };

  const handleUndoPolygonPoint = () => {
    setCurrentPolygonPoints((prev) => prev.slice(0, -1));
  };

  const handleFinishDrawPolygon = () => {
    if (currentPolygonPoints.length < 3) {
      alert('A polygon zone requires at least 3 points.');
      return;
    }
    if (polygonEditType !== 'property_boundary') {
      setPolygonEditName(`Field Zone #${polygons.length + 1}`);
      setPolygonEditType('food_plot');
    }
    setPolygonEditNotes('');
    setIsSavingNewPolygonModal(true);
  };

  const handleSaveNewPolygon = () => {
    if (currentPolygonPoints.length < 3) return;
    const newId = `poly-${Date.now()}`;
    const newPoly: SavedPolygon = {
      id: newId,
      name: polygonEditName.trim() || `Zone #${polygons.length + 1}`,
      type: polygonEditType,
      points: currentPolygonPoints,
      notes: polygonEditNotes.trim(),
      createdAt: Date.now(),
    };
    const updated = [...polygons, newPoly];
    savePolygonsToStorage(updated);
    setIsSavingNewPolygonModal(false);
    setIsDrawingPolygon(false);
    setCurrentPolygonPoints([]);
    setSelectedPolygonId(newId);
  };

  const handleDeletePolygon = (polyId: string) => {
    const updated = polygons.filter((p) => p.id !== polyId);
    savePolygonsToStorage(updated);
    if (selectedPolygonId === polyId) {
      setSelectedPolygonId(null);
    }
  };

  const handleSavePolygonEdit = () => {
    if (!editingPolygonId) return;
    const updated = polygons.map((p) => {
      if (p.id === editingPolygonId) {
        return {
          ...p,
          name: polygonEditName.trim() || p.name,
          type: polygonEditType,
          notes: polygonEditNotes.trim(),
        };
      }
      return p;
    });
    savePolygonsToStorage(updated);
    setEditingPolygonId(null);
  };

  const handleDeletePin = (pinId: string) => {
    const updated = pins.filter((p) => p.id !== pinId);
    savePinsToStorage(updated);
    if (selectedPinId === pinId) {
      setSelectedPinId(null);
    }
    if (editingPinId === pinId) {
      setEditingPinId(null);
    }
  };

  const handleSavePinDetails = () => {
    if (!editingPinId) return;
    const updated = pins.map((p) => {
      if (p.id === editingPinId) {
        return {
          ...p,
          name: editName.trim() || p.name,
          type: editType,
          notes: editNotes.trim(),
          preferredWindDeg: editPreferredWindDeg,
        };
      }
      return p;
    });
    savePinsToStorage(updated);
    setEditingPinId(null);
  };

  // Center on map helpers
  const centerOnPin = (pin: SavedPin) => {
    setCenterLat(pin.lat);
    setCenterLng(pin.lng);
    setSelectedPinId(pin.id);
    setSelectedPolygonId(null);
    setSelectedPathId(null);
    setShowHourlyWeather(false);
  };

  const selectPolygon = (poly: SavedPolygon) => {
    setSelectedPolygonId(poly.id);
    setSelectedPinId(null);
    setSelectedPathId(null);
    setShowHourlyWeather(false);
  };

  const selectPolygonAndCenter = (poly: SavedPolygon) => {
    const centroid = getPolygonCentroid(poly.points);
    setCenterLat(centroid.lat);
    setCenterLng(centroid.lng);
    setSelectedPolygonId(poly.id);
    setSelectedPinId(null);
    setSelectedPathId(null);
    setShowHourlyWeather(false);
  };

  const selectPath = (path: SavedPath) => {
    setSelectedPathId(path.id);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setShowHourlyWeather(false);
  };

  const selectPathAndCenter = (path: SavedPath) => {
    const mid = getPathMidpoint(path.points);
    setCenterLat(mid.lat);
    setCenterLng(mid.lng);
    setSelectedPathId(path.id);
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setShowHourlyWeather(false);
  };

  // Handle map canvas clicks
  const handleMapClick = (lat: number, lng: number) => {
    if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 400) return;

    if (isDrawingPolygon) {
      setCurrentPolygonPoints((prev) => [...prev, { lat, lng }]);
      return;
    }

    if (isDrawingPath) {
      const snapped = findSnapPoint(lat, lng, zoom, pathSnapCandidates);
      // Clone the snapped vertex so the draft never aliases another saved path's point object
      setCurrentPathPoints((prev) => [...prev, snapped ? { lat: snapped.lat, lng: snapped.lng } : { lat, lng }]);
      return;
    }

    if (isPlacingMarkerMode) {
      const newId = `pin-${Date.now()}`;
      const newPin: SavedPin = {
        id: newId,
        name: `Stand Location #${pins.length + 1}`,
        lat,
        lng,
        type: 'stand',
        notes: 'Scent cone plotting active.',
        preferredWindDeg: 0,
        createdAt: Date.now(),
      };
      const updated = [...pins, newPin];
      savePinsToStorage(updated);
      setSelectedPinId(newId);
      setSelectedPolygonId(null);
      setSelectedPathId(null);
      setShowHourlyWeather(false);
      setEditingPinId(newId);
      setEditName(newPin.name);
      setEditType(newPin.type);
      setEditNotes(newPin.notes || '');
      setEditPreferredWindDeg(0);
      setIsPlacingMarkerMode(false);
      return;
    }

    // Check if clicked near existing visible pin
    const threshold = 0.0008;
    const clickedPin = visiblePins.find((p) => Math.abs(p.lat - lat) < threshold && Math.abs(p.lng - lng) < threshold);
    if (clickedPin) {
      setSelectedPinId(clickedPin.id);
      setSelectedPolygonId(null);
      setSelectedPathId(null);
      setShowHourlyWeather(false);
      setEditingPinId(null);
      return;
    }

    // 1. Check if clicked near any path polyline FIRST (~20 screen pixels) so paths
    //    drawn inside property boundaries / zones remain clickable (fills would swallow them)
    const tileSize = 256;
    const pixelsPerDegree = (tileSize * Math.pow(2, zoom)) / 360;
    const clickedPath = visiblePaths.find((path) => {
      const pts = path.points;
      if (pts.length < 2) return false;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const distDeg = distanceToSegmentDeg(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng);
        const distPx = distDeg * pixelsPerDegree;
        if (distPx < 20) return true;
      }
      return false;
    });
    if (clickedPath) {
      selectPath(clickedPath);
      return;
    }

    // 2. Check if clicked inside existing field/zone polygon (excluding property_boundary)
    const clickedFieldPoly = visiblePolygons.find(
      (poly) => poly.type !== 'property_boundary' && isPointInPolygon(lat, lng, poly.points)
    );
    if (clickedFieldPoly) {
      selectPolygon(clickedFieldPoly);
      return;
    }

    // 3. Check if clicked inside property boundary polygon next
    const clickedPropPoly = visiblePolygons.find((poly) => poly.type === 'property_boundary' && isPointInPolygon(lat, lng, poly.points));
    if (clickedPropPoly) {
      selectPolygon(clickedPropPoly);
      return;
    }

    // 4. Check if clicked near any polygon border line segment (~25 screen pixels)
    const clickedBorderPoly = visiblePolygons.find((poly) => {
      const pts = poly.points;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const distDeg = distanceToSegmentDeg(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng);
        const distPx = distDeg * pixelsPerDegree;
        if (distPx < 25) return true;
      }
      return false;
    });
    if (clickedBorderPoly) {
      selectPolygon(clickedBorderPoly);
      return;
    }

    // Deselect if clicking empty terrain
    setSelectedPinId(null);
    setSelectedPolygonId(null);
    setSelectedPathId(null);
  };

  // Helper to check if event target is an interactive UI control (button, slider, input, modal)
  const isUiControlTarget = (target: HTMLElement | null) => {
    if (!target) return false;
    return !!target.closest('.ui-control, button, input, select, textarea, [role="button"], a');
  };

  // Mouse / Touch Dragging & Panning logic
  const handleMouseDown = (e: React.MouseEvent) => {
    // Mobile browsers synthesize mouse events after a touch. Ignore that
    // compatibility sequence or a single tap can place the same path point a
    // second time through handleMouseUp.
    if (Date.now() - lastTouchTimeRef.current < 500) return;
    if (isUiControlTarget(e.target as HTMLElement)) return;
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  // Convert client/viewport coordinates to map lat/lng (shared by click + snap-preview math).
  // IMPORTANT: the tile canvas can be CSS-rotated during/after a two-finger gesture.
  // Its transformed bounding rect is not the map's actual top-left, so use the
  // untransformed parent bounds and inverse-rotate the finger coordinate first.
  // The conversion zoom and tile size also must match the rounded zoom used by the
  // tile renderer; otherwise fractional zooms place points noticeably off target.
  const clientToLatLng = (
    clientX: number,
    clientY: number,
    mapCenter: { lat: number; lng: number } = { lat: centerLat, lng: centerLng }
  ) => {
    if (!mapContainerRef.current) return mapCenter;

    const map = mapContainerRef.current;
    const layoutRect = map.parentElement?.getBoundingClientRect() || map.getBoundingClientRect();
    const mapX = clientX - layoutRect.left;
    const mapY = clientY - layoutRect.top;
    const halfMapWidth = dimensions.width / 2;
    const halfMapHeight = dimensions.height / 2;

    // CSS transforms use the center of this full-screen canvas as their origin.
    // Convert the viewport point back into the canvas's unrotated coordinate space.
    const radians = (-rotationRef.current * Math.PI) / 180;
    const screenX = mapX - halfMapWidth;
    const screenY = mapY - halfMapHeight;
    const clickX = halfMapWidth + screenX * Math.cos(radians) - screenY * Math.sin(radians);
    const clickY = halfMapHeight + screenX * Math.sin(radians) + screenY * Math.cos(radians);

    const renderBaseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(zoom)));
    const tileSize = 256 * Math.pow(2, zoom - renderBaseZoom);
    const centerTile = latLngToTileCoords(mapCenter.lat, mapCenter.lng, renderBaseZoom);
    const mouseTileX = centerTile.x + (clickX - halfMapWidth) / tileSize;
    const mouseTileY = centerTile.y + (clickY - halfMapHeight) / tileSize;

    return {
      lat: tileYToLat(mouseTileY, renderBaseZoom),
      lng: tileXToLng(mouseTileX, renderBaseZoom),
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) {
      // While drawing a path, preview which snap target the next click will stick to.
      // Bail out when the target is unchanged so the map doesn't re-render on every pixel.
      if (isDrawingPath) {
        const { lat: mouseLat, lng: mouseLng } = clientToLatLng(e.clientX, e.clientY);
        setPathSnapPreview((prev) => {
          const next = findSnapPoint(mouseLat, mouseLng, zoom, pathSnapCandidates);
          if (next === null && prev === null) return prev;
          if (next && prev && next.lat === prev.lat && next.lng === prev.lng) return prev;
          return next;
        });
      } else if (pathSnapPreview) {
        setPathSnapPreview(null);
      }
      return;
    }
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    // Accumulate pixel offset and apply directly to DOM for 60fps smooth panning.
    // No React state update = no re-render during drag.
    panOffsetRef.current.x += dx;
    panOffsetRef.current.y += dy;
    applyMapTransform(1, panOffsetRef.current.x, panOffsetRef.current.y, rotationRef.current);
    schedulePanTileRefresh();

    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  // Convert the screen-space CSS translation back into the map's local
  // (unrotated) tile coordinates before baking it into the geographic center.
  // Without this inverse rotation, releasing a pan after rotating the map
  // shifts the center along the wrong axis.
  const getPannedCenterTile = (
    centerTile: { x: number; y: number },
    offset: { x: number; y: number },
    tileSize: number,
    rotation: number
  ) => {
    const radians = (-rotation * Math.PI) / 180;
    const localX = offset.x * Math.cos(radians) - offset.y * Math.sin(radians);
    const localY = offset.x * Math.sin(radians) + offset.y * Math.cos(radians);
    return {
      x: centerTile.x - localX / tileSize,
      y: centerTile.y - localY / tileSize,
    };
  };

  // Commit a slice of the live CSS pan into geographic state at a low rate.
  // The transform is cleared only after the new center renders, so tiles can
  // be requested during a long drag without making the finger movement janky.
  const commitPanForTileRefresh = () => {
    const offset = panOffsetRef.current;
    if (offset.x === 0 && offset.y === 0) return;

    const currentZoom = zoomRef.current;
    const panBaseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(currentZoom)));
    const tileSize = 256 * Math.pow(2, currentZoom - panBaseZoom);
    const centerTile = latLngToTileCoords(centerLatRef.current, centerLngRef.current, panBaseZoom);
    const pannedCenter = getPannedCenterTile(centerTile, offset, tileSize, rotationRef.current);
    const nextCenter = {
      lng: tileXToLng(pannedCenter.x, panBaseZoom),
      lat: tileYToLat(pannedCenter.y, panBaseZoom),
    };

    panOffsetRef.current = { x: 0, y: 0 };
    centerLatRef.current = nextCenter.lat;
    centerLngRef.current = nextCenter.lng;
    flushSync(() => {
      setCenterLat(nextCenter.lat);
      setCenterLng(nextCenter.lng);
    });
    applyMapTransform(1, 0, 0, rotationRef.current);
  };

  const schedulePanTileRefresh = () => {
    if (panTileRefreshRafRef.current !== null) return;
    const refresh = () => {
      panTileRefreshRafRef.current = null;
      const now = Date.now();
      if (now - lastPanTileRefreshRef.current < 90) {
        panTileRefreshRafRef.current = requestAnimationFrame(refresh);
        return;
      }
      lastPanTileRefreshRef.current = now;
      commitPanForTileRefresh();
    };
    panTileRefreshRafRef.current = requestAnimationFrame(refresh);
  };

  // Commit the current pinch zoom baseline periodically. Resetting the CSS
  // scale and pinch baseline after each commit lets React render the new zoom
  // tiles while the next pinch segment continues smoothly from that point.
  const commitPinchForTileRefresh = () => {
    const initialZoom = initialZoomRef.current;
    const latestDistance = latestPinchDistanceRef.current;
    if (initialZoom === null || latestDistance === null) return;

    // Rotation-only gestures still need to invalidate the tile grid. The CSS
    // transform updates every touch frame, but this throttled state update is
    // what lets React mount the extra corner tiles needed by the rotated view.
    setRotationDisplay(rotationRef.current);

    const zoomOffset = Math.log2(zoomScaleRef.current);
    if (Math.abs(zoomOffset) < 0.08) return;

    const nextZoom = Math.min(MAX_ZOOM, Math.max(3, initialZoom + zoomOffset));
    initialZoomRef.current = nextZoom;
    pinchDistRef.current = latestDistance;
    zoomScaleRef.current = 1;
    zoomRef.current = nextZoom;
    flushSync(() => setZoom(nextZoom));
    applyMapTransform(1, panOffsetRef.current.x, panOffsetRef.current.y, rotationRef.current);
  };

  const schedulePinchTileRefresh = () => {
    if (pinchTileRefreshRafRef.current !== null) return;
    const refresh = () => {
      pinchTileRefreshRafRef.current = null;
      const now = Date.now();
      if (now - lastPinchTileRefreshRef.current < 90) {
        pinchTileRefreshRafRef.current = requestAnimationFrame(refresh);
        return;
      }
      lastPinchTileRefreshRef.current = now;
      commitPinchForTileRefresh();
    };
    pinchTileRefreshRafRef.current = requestAnimationFrame(refresh);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Ignore the compatibility mouseup emitted after a touch gesture.
    if (Date.now() - lastTouchTimeRef.current < 500) return;
    if (!isDragging) return;
    setIsDragging(false);

    // Bake the accumulated pan offset into the geographic center so the
    // rendered tiles naturally land at the panned position WITHOUT the
    // CSS transform. Sign is positive: dragging content rightward
    // (panOffset.x > 0) reveals what's further east, so the new center
    // moves west, not east. The rendered tile math is:
    // tileLeft = center + (tile - centerTile) * tileSize, so a positive
    // CSS translation must be baked into the center with a MINUS sign.
    // The old positive sign applied the gesture twice and caused the map
    // to jump away from the finger on release.
    const currentZoom = zoomRef.current;
    const panBaseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(currentZoom)));
    const tileSize = 256 * Math.pow(2, currentZoom - panBaseZoom);
    const centerTile = latLngToTileCoords(centerLatRef.current, centerLngRef.current, panBaseZoom);
    const pannedCenter = getPannedCenterTile(centerTile, panOffsetRef.current, tileSize, rotationRef.current);
    const newX = pannedCenter.x;
    const newY = pannedCenter.y;
    panOffsetRef.current = { x: 0, y: 0 };

    // ORDER MATTERS: COMMIT FIRST, then clear the CSS translate.
    // flushSync() forces all queued React state updates inside it to
    // commit synchronously inside this microtask — that means the
    // browser paints the next frame with tiles already in their NEW
    // positions while the container still carries the old translate.
    // Only AFTER that commit do we clear the translate via
    // applyMapTransform. The two DOM mutations happen back-to-back
    // inside a single JS turn, so the browser never paints an
    // intermediate frame where tiles are at OLD center coords with
    // identity translate — which is the "snap back then snap forward"
    // glitch (looks like the map races off on release).
    const nextCenter = {
      lng: tileXToLng(newX, panBaseZoom),
      lat: tileYToLat(newY, panBaseZoom),
    };
    centerLatRef.current = nextCenter.lat;
    centerLngRef.current = nextCenter.lng;
    flushSync(() => {
      setCenterLng(nextCenter.lng);
      setCenterLat(nextCenter.lat);
    });
    applyMapTransform(1, 0, 0, rotationRef.current);

    if (!hasMovedRef.current && mapContainerRef.current) {
      const { lat: clickedLat, lng: clickedLng } = clientToLatLng(e.clientX, e.clientY, nextCenter);
      handleMapClick(clickedLat, clickedLng);
    }
  };

  // Apply combined pan + zoom + rotation CSS transform directly to the DOM.
  const applyMapTransform = (scale: number, px: number, py: number, rotation = 0) => {
    if (mapContainerRef.current) {
      mapContainerRef.current.style.transform = `translate(${px}px, ${py}px) scale(${scale}) rotate(${rotation}deg)`;
    }
    // Update marker visual compensation on every DOM-only gesture frame. This
    // must not be React state: React intentionally does not re-render while a
    // pan/pinch is in progress.
    const visuals = pinVisualsRef.current;
    if (visuals) {
      visuals.style.setProperty('--map-pin-inverse-scale', String(1 / scale));
      visuals.style.setProperty('--map-pin-inverse-rotation', `${-rotation}deg`);
    }
  };

  // Wheel zoom stays in a CSS transform while the wheel is active. React only
  // commits once the gesture settles, so zooming through several levels does
  // not rebuild the tile grid on every wheel tick; the tile render cache then
  // makes revisited levels paint immediately.
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (wheelZoomBaseRef.current === null) wheelZoomBaseRef.current = zoomRef.current;
    wheelZoomDeltaRef.current += e.deltaY < 0 ? 0.5 : -0.5;

    if (wheelZoomRafRef.current === null) {
      wheelZoomRafRef.current = requestAnimationFrame(() => {
        wheelZoomRafRef.current = null;
        const scale = Math.max(0.25, Math.min(4, Math.pow(2, wheelZoomDeltaRef.current)));
        applyMapTransform(scale, panOffsetRef.current.x, panOffsetRef.current.y, rotationRef.current);
      });
    }

    if (wheelZoomCommitTimerRef.current !== null) {
      window.clearTimeout(wheelZoomCommitTimerRef.current);
    }
    wheelZoomCommitTimerRef.current = window.setTimeout(() => {
      wheelZoomCommitTimerRef.current = null;
      const baseZoom = wheelZoomBaseRef.current;
      if (baseZoom === null) return;

      const nextZoom = Math.min(MAX_ZOOM, Math.max(3, baseZoom + wheelZoomDeltaRef.current));
      wheelZoomBaseRef.current = null;
      wheelZoomDeltaRef.current = 0;
      zoomRef.current = nextZoom;
      flushSync(() => setZoom(nextZoom));
      applyMapTransform(1, panOffsetRef.current.x, panOffsetRef.current.y, rotationRef.current);
    }, 140);
  };

  // Keep browser viewport gestures from competing with the map's React
  // gesture owner. The previous implementation also handled pinch movement
  // and touchend here while React handled the same events below, so a single
  // finger release could be committed twice and jump by roughly 2x.
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const preventViewportGesture = (e: TouchEvent) => {
      if (isUiControlTarget(e.target as HTMLElement)) return;
      if (e.touches.length >= 2 && e.cancelable) e.preventDefault();
    };

    el.addEventListener('touchstart', preventViewportGesture, { passive: false });
    el.addEventListener('touchmove', preventViewportGesture, { passive: false });

    return () => {
      el.removeEventListener('touchstart', preventViewportGesture);
      el.removeEventListener('touchmove', preventViewportGesture);
    };
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isUiControlTarget(e.target as HTMLElement)) return;
    if (e.touches.length === 2) {
      touchTapHandledRef.current = true;
      // If a second finger joins while a one-finger pan is still active,
      // commit that first pan before switching gesture modes. Resetting the
      // temporary offset here would otherwise throw away the visible pan and
      // make the map jump as pinch begins.
      if (isDragging && (panOffsetRef.current.x !== 0 || panOffsetRef.current.y !== 0)) {
        const panBaseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(zoom)));
        const tileSize = 256 * Math.pow(2, zoom - panBaseZoom);
        const centerTile = latLngToTileCoords(centerLat, centerLng, panBaseZoom);
        const pannedCenter = getPannedCenterTile(centerTile, panOffsetRef.current, tileSize, rotationRef.current);
        flushSync(() => {
          setIsDragging(false);
          setCenterLng(tileXToLng(pannedCenter.x, panBaseZoom));
          setCenterLat(tileYToLat(pannedCenter.y, panBaseZoom));
        });
        panOffsetRef.current = { x: 0, y: 0 };
        applyMapTransform(1, 0, 0, rotationRef.current);
      } else if (isDragging) {
        setIsDragging(false);
      }
      isPinchingRef.current = true;
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      pinchDistRef.current = dist;
      initialZoomRef.current = zoom;
      // Record the initial angle between the two fingers for rotation tracking.
      initialPinchAngleRef.current = Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      ) * (180 / Math.PI);
      lastRotationAngleRef.current = initialPinchAngleRef.current;
      return;
    }

    if (e.touches.length === 1) {
      isPinchingRef.current = false;
      touchTapHandledRef.current = false;
      // The previous pinch-end path has already committed and cleared any
      // temporary transform. Do not clear a live one-finger pan here.
      if (panOffsetRef.current.x === 0 && panOffsetRef.current.y === 0) {
        applyMapTransform(1, 0, 0, rotationRef.current);
      }
      const now = Date.now();
      if (now - lastTouchTimeRef.current < 300) {
        setZoom((prev) => Math.min(MAX_ZOOM, prev + 1));
      }
      lastTouchTimeRef.current = now;

      setIsDragging(true);
      hasMovedRef.current = false;
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length === 2 && pinchDistRef.current && initialZoomRef.current) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      // --- Pinch-to-zoom ---
      const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const zoomFactor = currentDist / pinchDistRef.current;
      // Allow scale below 1.0 for zoom-out visual feedback; clamp to
      // reasonable bounds so the map doesn't vanish or explode.
      const newScale = Math.max(0.25, Math.min(4, zoomFactor));
      zoomScaleRef.current = newScale;
      // --- Two-finger rotation ---
      if (initialPinchAngleRef.current !== null) {
        const currentAngle = Math.atan2(
          touch2.clientY - touch1.clientY,
          touch2.clientX - touch1.clientX
        ) * (180 / Math.PI);
        // Incremental-delta rotation: same wrap-safe logic as the native path,
        // necessary for React-synthetic TouchEvents too (otherwise the same
        // 360° snap appears here on touchscreens that route through React).
        if (lastRotationAngleRef.current !== null) {
          let delta = currentAngle - lastRotationAngleRef.current;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          rotationRef.current += delta * 0.5;
        }
        lastRotationAngleRef.current = currentAngle;
      }
      // Apply combined scale + rotation as CSS transform — no React re-render.
      applyMapTransform(newScale, panOffsetRef.current.x, panOffsetRef.current.y, rotationRef.current);
      latestPinchDistanceRef.current = currentDist;
      schedulePinchTileRefresh();
      return;
    }

    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    // Accumulate pixel offset and apply directly to DOM for 60fps smooth panning.
    panOffsetRef.current.x += dx;
    panOffsetRef.current.y += dy;
    applyMapTransform(1, panOffsetRef.current.x, panOffsetRef.current.y, rotationRef.current);
    schedulePanTileRefresh();

    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // A cancelled touch is not a completed pan. Drop the temporary CSS
    // translation instead of baking a partial/stale offset into the center,
    // and make the cleanup idempotent if the browser also emits touchend.
    if (e.type === 'touchcancel') {
      touchTapHandledRef.current = true;
      isPinchingRef.current = false;
      setIsDragging(false);
      pinchDistRef.current = null;
      initialZoomRef.current = null;
      initialPinchAngleRef.current = null;
      lastRotationAngleRef.current = null;
      panOffsetRef.current = { x: 0, y: 0 };
      zoomScaleRef.current = 1;
      applyMapTransform(1, 0, 0, rotationRef.current);
      return;
    }

    if (isPinchingRef.current) {
      isPinchingRef.current = false;
      pinchDistRef.current = null;
      initialZoomRef.current = null;
      initialPinchAngleRef.current = null;
      lastRotationAngleRef.current = null;
      // Sync any accumulated pan offset into React state using the same
      // screen-to-map conversion as one-finger release. This also keeps a
      // pinch that began after a short pan from carrying a stale offset.
      const currentZoom = zoomRef.current;
      const panBaseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(currentZoom)));
      const tileSize = 256 * Math.pow(2, currentZoom - panBaseZoom);
      const centerTile = latLngToTileCoords(centerLatRef.current, centerLngRef.current, panBaseZoom);
      const pannedCenter = getPannedCenterTile(centerTile, panOffsetRef.current, tileSize, rotationRef.current);
      const newX = pannedCenter.x;
      const newY = pannedCenter.y;
      panOffsetRef.current = { x: 0, y: 0 };
      // Sync accumulated CSS scale into React state.
      const scaleRatio = zoomScaleRef.current;
      const zoomOffset = Math.log2(scaleRatio);
      const nextZoom = (prev: number) => Math.min(MAX_ZOOM, Math.max(3, Math.round((prev + zoomOffset) * 2) / 2));
      zoomScaleRef.current = 1;
      // Sync rotation display for the UI indicator.
      const nextRotation = rotationRef.current;
      // Commit React state BEFORE clearing the CSS translate + scale.
      // flushSync forces both setZoom + setCenter to commit in this
      // microtask, so the browser paints a single frame where tiles
      // are already at their new (center, zoom, rotation) positions
      // and only then we strip the translate + scale via
      // applyMapTransform. Without flushSync the order was
      //   applyMapTransform(identity) → setCenter → setZoom → render
      // which leaves a stale frame showing OLD tile coords with no
      // translate, producing the "snap back + snap forward" ghost
      // pan users saw on release.
      flushSync(() => {
        setZoom(nextZoom);
        setRotationDisplay(nextRotation);
        setCenterLng(tileXToLng(newX, panBaseZoom));
        setCenterLat(tileYToLat(newY, panBaseZoom));
      });
      applyMapTransform(1, 0, 0, rotationRef.current);
      return;
    }
    if (!isDragging) return;
    setIsDragging(false);

    // Bake the accumulated pan offset into the geographic center. The
    // geographic center moves opposite to the finger's temporary CSS
    // translation: drag right => center west, drag down => center north.
    const currentZoom = zoomRef.current;
    const panBaseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(currentZoom)));
    const tileSize = 256 * Math.pow(2, currentZoom - panBaseZoom);
    const centerTile = latLngToTileCoords(centerLatRef.current, centerLngRef.current, panBaseZoom);
    const pannedCenter = getPannedCenterTile(centerTile, panOffsetRef.current, tileSize, rotationRef.current);
    const newX = pannedCenter.x;
    const newY = pannedCenter.y;
    panOffsetRef.current = { x: 0, y: 0 };
    // Commit React's setCenter updates FIRST (flushSync) so the
    // browser never paints the intermediate frame where tiles are at
    // OLD coords and the container has no translate — that frame was
    // the "map races across the screen on release" artifact. Only
    // after React has placed tiles at the new center do we strip the
    // translate. The two DOM updates collapse into a single paint.
    const nextCenter = {
      lng: tileXToLng(newX, panBaseZoom),
      lat: tileYToLat(newY, panBaseZoom),
    };
    centerLatRef.current = nextCenter.lat;
    centerLngRef.current = nextCenter.lng;
    flushSync(() => {
      setCenterLng(nextCenter.lng);
      setCenterLat(nextCenter.lat);
    });
    applyMapTransform(1, 0, 0, rotationRef.current);

    if (!hasMovedRef.current && mapContainerRef.current && e.changedTouches.length > 0) {
      const { lat: clickedLat, lng: clickedLng } = clientToLatLng(
        e.changedTouches[0].clientX,
        e.changedTouches[0].clientY,
        nextCenter
      );
      if (!touchTapHandledRef.current) {
        touchTapHandledRef.current = true;
        handleMapClick(clickedLat, clickedLng);
      }
    }
  };

  // Map Tile Calculations
  const baseZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(zoom)));
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;

  // Keep tile-element allocation isolated from unrelated map UI state. The
  // browser HTTP cache handles revisited tiles; only the current viewport and
  // one low-resolution overview layer are mounted in the DOM.
  const allTileElements = useMemo<React.ReactNode[]>(() => {
    const tiles: React.ReactNode[] = [];
    // A rotated viewport exposes the corners of this local, axis-aligned tile
    // rectangle. Expand each half-axis by the rotated rectangle's projection
    // instead of assuming the unrotated viewport bounds are sufficient.
    const rotationRadians = (rotationDisplay * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(rotationRadians));
    const absSin = Math.abs(Math.sin(rotationRadians));
    const renderedHalfWidth = absCos * halfWidth + absSin * halfHeight;
    const renderedHalfHeight = absSin * halfWidth + absCos * halfHeight;

    // Low-zoom regional overview layer (zIndex: 1)
  // Guarantees 100% background satellite coverage for the entire region. The
  // zoom is capped relative to the current level so the scaled tiles never
  // exceed ~2.9k CSS px — the old fixed z12 cap blew up to 32k px at z19,
  // which iOS Safari drops (black areas on mobile) and every device rasterizes
  // as a giant blur.
  const overviewZoom = Math.max(2, Math.min(baseZoom - 3, Math.floor(zoom) - 3));
  if (overviewZoom < baseZoom) {
    const ovScale = Math.pow(2, zoom - overviewZoom);
    const ovTileSize = 256 * ovScale;
    const ovCoords = latLngToTileCoords(centerLat, centerLng, overviewZoom);

    const ovMinX = Math.floor(ovCoords.x - renderedHalfWidth / ovTileSize) - 2;
    const ovMaxX = Math.ceil(ovCoords.x + renderedHalfWidth / ovTileSize) + 2;
    const ovMinY = Math.floor(ovCoords.y - renderedHalfHeight / ovTileSize) - 2;
    const ovMaxY = Math.ceil(ovCoords.y + renderedHalfHeight / ovTileSize) + 2;

    for (let tx = ovMinX; tx <= ovMaxX; tx++) {
      for (let ty = ovMinY; ty <= ovMaxY; ty++) {
        const tileLeft = halfWidth + (tx - ovCoords.x) * ovTileSize;
        const tileTop = halfHeight + (ty - ovCoords.y) * ovTileSize;
        const urls = getTileUrls(overviewZoom, ty, tx, mapStyle);
        const tileKey = `overview-${overviewZoom}-${tx}-${ty}-${mapStyle}`;

        tiles.push(
          <MapTile
            key={tileKey}
            tileKey={tileKey}
            urls={urls}
            left={tileLeft}
            top={tileTop}
            size={ovTileSize}
            zIndex={1}
            z={overviewZoom}
          />
        );
      }
    }
  }

  // Active current zoom level layer (zIndex: 5)
  const actScale = Math.pow(2, zoom - baseZoom);
  const actTileSize = 256 * actScale;
  const actCoords = latLngToTileCoords(centerLat, centerLng, baseZoom);
  // Keep a two-tile loading ring around the viewport so ordinary pans reveal
  // already-requested imagery instead of a blank edge. This is substantially
  // smaller than the old four-tile ring while still behaving like a slippy map.
  const TILE_OVERSCAN = 2;
  const actMinX = Math.floor(actCoords.x - renderedHalfWidth / actTileSize) - TILE_OVERSCAN;
  const actMaxX = Math.ceil(actCoords.x + renderedHalfWidth / actTileSize) + TILE_OVERSCAN;
  const actMinY = Math.floor(actCoords.y - renderedHalfHeight / actTileSize) - TILE_OVERSCAN;
  const actMaxY = Math.ceil(actCoords.y + renderedHalfHeight / actTileSize) + TILE_OVERSCAN;

  for (let tx = actMinX; tx <= actMaxX; tx++) {
    for (let ty = actMinY; ty <= actMaxY; ty++) {
      const tileLeft = halfWidth + (tx - actCoords.x) * actTileSize;
      const tileTop = halfHeight + (ty - actCoords.y) * actTileSize;
      const urls = getTileUrls(baseZoom, ty, tx, mapStyle);
      const tileKey = `active-${baseZoom}-${tx}-${ty}-${mapStyle}`;
      tiles.push(
        <MapTile
          key={tileKey}
          tileKey={tileKey}
          urls={urls}
          left={tileLeft}
          top={tileTop}
          size={actTileSize}
          zIndex={5}
          z={baseZoom}
        />
      );
    }
  }

    return tiles;
  }, [centerLat, centerLng, zoom, rotationDisplay, dimensions.width, dimensions.height, mapStyle, halfWidth, halfHeight]);

  // Convert lat/lng to map container pixel coordinates
  const latLngToPixel = useCallback(
    (lat: number, lng: number) => {
      const currentTileZoom = Math.min(MAX_ZOOM, Math.max(2, Math.round(zoom)));
      const zoomScale = Math.pow(2, zoom - currentTileZoom);
      const scaledTileSize = 256 * zoomScale;

      const centerTile = latLngToTileCoords(centerLat, centerLng, currentTileZoom);
      const pt = latLngToTileCoords(lat, lng, currentTileZoom);

      const x = halfWidth + (pt.x - centerTile.x) * scaledTileSize;
      const y = halfHeight + (pt.y - centerTile.y) * scaledTileSize;
      return { x, y };
    },
    [centerLat, centerLng, halfWidth, halfHeight, zoom]
  );

  // Stand Scent Plume Cone Path Calculation
  const scentConePath = useMemo(() => {
    if (!selectedPin || !showScentCone) return null;

    const startDeg = (downwindDeg - SCENT_CONE_SPREAD / 2 + 360) % 360;
    const endDeg = (downwindDeg + SCENT_CONE_SPREAD / 2 + 360) % 360;

    const pinPixel = latLngToPixel(selectedPin.lat, selectedPin.lng);
    const radiusPixels = Math.min(260, Math.max(90, (windMph || 5) * 12 * (zoom / 15)));

    return getSvgArcPath(pinPixel.x, pinPixel.y, radiusPixels, startDeg, endDeg);
  }, [selectedPin, showScentCone, downwindDeg, latLngToPixel, windMph, zoom]);

  // Preferred Wind Vector Sector Paths for all markers
  const preferredWindPaths = useMemo(() => {
    if (!showPreferredWind) return [];
    return pins
      .filter((p) => p.preferredWindDeg !== undefined)
      .map((pin) => {
        const prefWind = pin.preferredWindDeg!;
        const prefDownwind = (prefWind + 180) % 360;
        const startDeg = (prefDownwind - 35 + 360) % 360;
        const endDeg = (prefDownwind + 35 + 360) % 360;

        const pinPixel = latLngToPixel(pin.lat, pin.lng);
        const radius = selectedPinId === pin.id ? 130 : 85;
        const path = getSvgArcPath(pinPixel.x, pinPixel.y, radius, startDeg, endDeg);
        return { id: pin.id, path, isSelected: selectedPinId === pin.id };
      });
  }, [pins, showPreferredWind, selectedPinId, latLngToPixel]);

  // Wind flow animation streaks: deterministic positions so streaks don't jump on hour change;
  // rotation + speed derive from the currently selected hour's wind (downwindDeg / windMph).
  const windStreaks = useMemo(() => {
    if (!showHourlyWeather && !bestPathActive) return [];
    const w = Math.max(dimensions.width, 320);
    const h = Math.max(dimensions.height, 320);
    const margin = 220;
    const mph = windMph || 5;
    const travel = Math.hypot(w, h) + margin * 2;
    const speed = Math.max(45, mph * 34); // px per second
    const dur = travel / speed;
    // SVG animation is the most expensive optional map overlay: each streak
    // contains two paths and its own compositor animation. A steady, uniform
    // field — denser than the original but well under the previous maximum
    // that caused scroll lag — with a floor so the map never looks empty.
    const count = Math.max(48, Math.min(110, Math.round((w * h) / 6000)));
    // deterministic hash so streak positions stay put across slider scrubs
    const hash = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const streaks: { x: number; y: number; len: number; width: number; opacity: number; delay: number; dur: number; travel: number }[] = [];
    for (let i = 0; i < count; i++) {
      streaks.push({
        x: hash(i * 3 + 1) * (w + margin * 2) - margin,
        y: hash(i * 3 + 2) * (h + margin * 2) - margin,
        len: Math.max(12, mph * 3) + hash(i * 3 + 3) * mph * 3,
        width: 0.6 + mph * 0.08 + hash(i * 3 + 4) * (0.9 + mph * 0.05),
        opacity: 0.15 + hash(i * 3 + 5) * 0.18,
        delay: -hash(i * 3 + 6) * dur,
        dur,
        travel,
      });
    }
    return streaks;
  }, [showHourlyWeather, bestPathActive, windMph, dimensions.width, dimensions.height]);

  return (
    <>
      {/* Map ALWAYS Full-Screen Container */}
      <div
        className={`relative w-full h-full overflow-hidden transition-all ${
          mapStyle === 'satellite' ? 'bg-slate-950' : mapStyle === 'topo' ? 'bg-slate-900' : 'bg-slate-100'
        }`}
      >
        {/* Slippy Tile Canvas. Paint containment is intentionally disabled so
            rotated tiles can extend beyond the unrotated canvas and be clipped
            only by the outer map viewport. */}
        <div
          ref={mapContainerRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ willChange: 'transform', transformOrigin: 'center center', contain: 'layout' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {allTileElements}

          {/* SVG Overlay: Polygons, Scent Cones & Routes */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            <defs>
              <radialGradient id="scentPlumeGradient" cx="0%" cy="0%" r="100%">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#f97316" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#fef08a" stopOpacity="0.05" />
              </radialGradient>
            </defs>

            {/* Polygon Zones */}
            {visiblePolygons.map((poly) => {
              if (poly.points.length < 3) return null;
              const polyMeta = POLYGON_METADATA[poly.type] || POLYGON_METADATA.custom;
              const isSelected = selectedPolygonId === poly.id;

              const svgPoints = poly.points
                .map((pt) => {
                  const px = latLngToPixel(pt.lat, pt.lng);
                  return `${px.x},${px.y}`;
                })
                .join(' ');

              return (
                <g key={poly.id} className="pointer-events-none">
                  <polygon
                    points={svgPoints}
                    fill={poly.type === 'property_boundary' ? 'none' : polyMeta.fill}
                    fillOpacity={poly.type === 'property_boundary' ? 0 : isSelected ? Math.min(0.7, polyMeta.fillOpacity + 0.25) : polyMeta.fillOpacity}
                    stroke={poly.type === 'property_boundary' ? '#f43f5e' : polyMeta.stroke}
                    strokeWidth={isSelected ? 4 : poly.type === 'property_boundary' ? 3.5 : 2.5}
                    strokeDasharray={poly.type === 'property_boundary' ? '6 4' : undefined}
                    className="transition-all duration-200 pointer-events-none"
                  />
                  {/* Label at Centroid */}
                  {(() => {
                    const centroid = getPolygonCentroid(poly.points);
                    const centroidPx = latLngToPixel(centroid.lat, centroid.lng);
                    return (
                      <g transform={`translate(${centroidPx.x}, ${centroidPx.y})`} className="pointer-events-none">
                        <rect
                          x={-40}
                          y={-12}
                          width={80}
                          height={22}
                          rx={6}
                          fill={isDark ? '#020617' : '#ffffff'}
                          fillOpacity={0.9}
                          stroke={polyMeta.stroke}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          fill={isDark ? '#f8fafc' : '#0f172a'}
                          fontSize={10}
                          fontWeight="bold"
                        >
                          {poly.name.length > 10 ? poly.name.substring(0, 10) + '…' : poly.name}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* Polygon Drawing Active Draft */}
            {isDrawingPolygon && currentPolygonPoints.length > 0 && (
              <g>
                {currentPolygonPoints.length >= 2 && (
                  <polygon
                    points={currentPolygonPoints
                      .map((pt) => {
                        const px = latLngToPixel(pt.lat, pt.lng);
                        return `${px.x},${px.y}`;
                      })
                      .join(' ')}
                    fill={polygonEditType === 'property_boundary' ? '#f43f5e' : '#22c55e'}
                    fillOpacity={0.25}
                    stroke={polygonEditType === 'property_boundary' ? '#f43f5e' : '#22c55e'}
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                  />
                )}
                {currentPolygonPoints.map((pt, idx) => {
                  const px = latLngToPixel(pt.lat, pt.lng);
                  return (
                    <circle
                      key={idx}
                      cx={px.x}
                      cy={px.y}
                      r={5}
                      fill={polygonEditType === 'property_boundary' ? '#f43f5e' : '#22c55e'}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            )}

            {/* Saved Paths (Polylines / Routes) */}
            {visiblePaths.map((path) => {
              if (path.points.length < 2) return null;
              const pathMeta = PATH_METADATA[path.type] || PATH_METADATA.custom;
              const isSelected = selectedPathId === path.id;
              const svgPoints = path.points
                .map((pt) => {
                  const px = latLngToPixel(pt.lat, pt.lng);
                  return `${px.x},${px.y}`;
                })
                .join(' ');

              return (
                <g key={path.id} className="pointer-events-none">
                  {/* Casing (outer glow) for visibility */}
                  <polyline
                    points={svgPoints}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={0.35}
                    strokeWidth={isSelected ? 9 : 6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all duration-200 pointer-events-none"
                  />
                  {/* Main colored line — green when best path */}
                  <polyline
                    points={svgPoints}
                    fill="none"
                    stroke={pathMeta.stroke}
                    strokeOpacity={isSelected ? 1 : 0.85}
                    strokeWidth={isSelected ? 5 : 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={pathMeta.dash}
                    className="transition-all duration-200 pointer-events-none"
                  />
                  {/* Vertex dots */}
                  {path.points.map((pt, idx) => {
                    const px = latLngToPixel(pt.lat, pt.lng);
                    return (
                      <circle
                        key={idx}
                        cx={px.x}
                        cy={px.y}
                        r={isSelected ? 4 : 3}
                        fill={pathMeta.stroke}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        className="pointer-events-none"
                      />
                    );
                  })}
                  {/* Label at Midpoint — only shows when selected */}
                  {isSelected && (() => {
                    const mid = getPathMidpoint(path.points);
                    const midPx = latLngToPixel(mid.lat, mid.lng);
                    return (
                      <g transform={`translate(${midPx.x}, ${midPx.y - 14})`} className="pointer-events-none">
                        <rect
                          x={-42}
                          y={-12}
                          width={84}
                          height={22}
                          rx={6}
                          fill={isDark ? '#020617' : '#ffffff'}
                          fillOpacity={0.9}
                          stroke={pathMeta.stroke}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                        <text
                          x={0}
                          y={3}
                          textAnchor="middle"
                          fill={isDark ? '#f8fafc' : '#0f172a'}
                          fontSize={10}
                          fontWeight="bold"
                        >
                          {path.name.length > 12 ? path.name.substring(0, 12) + '…' : path.name}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* Best Path route — one continuous green line from Home to the selected stand. */}
            {bestRouteGeometry && bestRouteGeometry.length >= 2 && (
              <g className="pointer-events-none" key="best-route-geometry">
                <polyline
                  points={bestRouteGeometry
                    .map((pt) => {
                      const px = latLngToPixel(pt.lat, pt.lng);
                      return `${px.x},${px.y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#052e16"
                  strokeOpacity={0.9}
                  strokeWidth={11}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={bestRouteGeometry
                    .map((pt) => {
                      const px = latLngToPixel(pt.lat, pt.lng);
                      return `${px.x},${px.y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_5px_rgba(34,197,94,0.9)]"
                />
              </g>
            )}

            {/* Path Drawing Active Draft */}
            {isDrawingPath && currentPathPoints.length > 0 && (
              <g>
                {currentPathPoints.length >= 2 && (
                  <polyline
                    points={currentPathPoints
                      .map((pt) => {
                        const px = latLngToPixel(pt.lat, pt.lng);
                        return `${px.x},${px.y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="6 3"
                  />
                )}
                {currentPathPoints.map((pt, idx) => {
                  const px = latLngToPixel(pt.lat, pt.lng);
                  return (
                    <circle
                      key={idx}
                      cx={px.x}
                      cy={px.y}
                      r={5}
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            )}

            {/* Path Snap Target Preview Ring */}
            {isDrawingPath && pathSnapPreview && (() => {
              const px = latLngToPixel(pathSnapPreview.lat, pathSnapPreview.lng);
              return (
                <g className="pointer-events-none">
                  <circle
                    cx={px.x}
                    cy={px.y}
                    r={13}
                    fill="#0ea5e9"
                    fillOpacity={0.2}
                    stroke="#0ea5e9"
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                    className="animate-pulse"
                  />
                  <circle cx={px.x} cy={px.y} r={4} fill="#0ea5e9" stroke="#ffffff" strokeWidth={2} />
                </g>
              );
            })()}

            {/* Scent Plume Cone Path */}
            {scentConePath && (
              <path
                d={scentConePath}
                fill="url(#scentPlumeGradient)"
                fillOpacity={0.45}
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            {/* Preferred Wind Vector Paths for stand pins */}
            {preferredWindPaths.map((p) => (
              <path
                key={`pref-wind-${p.id}`}
                d={p.path}
                fill="#10b981"
                fillOpacity={p.isSelected ? 0.35 : 0.2}
                stroke="#34d399"
                strokeWidth={p.isSelected ? 2 : 1}
                strokeDasharray="4 3"
              />
            ))}

            {/* Animated Wind Flow Streaks — intentionally above route/polygon layers
                so wind direction remains readable over dark satellite imagery. */}
            {(showHourlyWeather || bestPathActive) && windStreaks.length > 0 && (
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
                        // Droplets freeze mid-flight whenever the map is
                        // covered by another app view (the overlay unmounts
                        // with this SVG), so returning to the map resumes
                        // instantly without a visible restart.
                        animationPlayState: isMapVisible ? 'running' : 'paused',
                        ...({ '--travel': `${s.travel}px` } as Record<string, string>),
                      }}
                    >
                      {/* Elongated droplet: rounded head leads downwind, tail tapers behind. The
                          near-white body reads as an icy streak; the darker underlay is softened
                          to a subtle rim so the droplets stay visible over bright map tiles too. */}
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
            )}


            {/* Gradients now defined at top of SVG */}
          </svg>

          {/* Marker Pins Overlay — inverse scale + inverse rotation applied
              directly via DOM in applyMapTransform (every animation frame)
              so pins stay the same size and upright *while* the user pinches
              and twists, not just after React decides to re-render at the
              end of the gesture. */}
          <div
            ref={pinVisualsRef}
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              '--map-pin-inverse-scale': '1',
              '--map-pin-inverse-rotation': '0deg',
            } as React.CSSProperties}
          >
            {/* User's Current Location Marker — blue dot tracks the live GPS fix
                once the locate button is used; falls back to the forecast location
                before that. A translucent halo visualizes GPS accuracy. */}
            {(() => {
              const myLat = gpsFix ? gpsFix.lat : location.latitude;
              const myLng = gpsFix ? gpsFix.lng : location.longitude;
              const myPx = latLngToPixel(myLat, myLng);
              // Keep the GPS marker mounted during an active transform. Its
              // committed pixel position can temporarily be outside the normal
              // viewport while the DOM transform is moving the map underneath it.
              // Convert GPS accuracy (meters) to pixel radius at the current zoom
              // so the halo roughly matches real-world uncertainty.
              const metersPerPixel = (156543.03392 * Math.cos((myLat * Math.PI) / 180)) / Math.pow(2, zoom);
              const accuracyRadiusPx = gpsFix ? Math.max(10, gpsFix.accuracy / metersPerPixel) : 0;
              return (
                <div
                  key="user-current-location"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasMovedRef.current || isDrawingPolygon || isDrawingPath || (Date.now() - lastPinchTimeRef.current < 400)) return;
                    setCenterLat(myLat);
                    setCenterLng(myLng);
                  }}
                  className={`absolute left-0 top-0 group ${
                    isDrawingPolygon || isDrawingPath ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
                  }`}
                  style={{ left: `${myPx.x}px`, top: `${myPx.y}px`, transform: 'translate(-50%, -50%)' }}
                  title={gpsFix ? `My GPS Location (±${Math.round(gpsFix.accuracy)} m)` : 'My Current Location'}
                >
                  <div
                    style={{
                      transform: 'scale(var(--map-pin-inverse-scale)) rotate(var(--map-pin-inverse-rotation))',
                      transformOrigin: 'center center',
                    }}
                  >
                    <div className="relative flex items-center justify-center">
                      {gpsFix && (
                        <div
                          className="absolute rounded-full bg-sky-500/20 border border-sky-400/40"
                          style={{ width: `${accuracyRadiusPx * 2}px`, height: `${accuracyRadiusPx * 2}px` }}
                        />
                      )}
                      <div className="absolute -inset-2 bg-sky-500/30 rounded-full animate-ping" />
                      <div className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-2xl ring-2 ring-white border border-sky-400 font-extrabold text-xs z-10 hover:scale-110 transition-transform">
                        <Navigation className="w-4 h-4 fill-white text-sky-200" />
                      </div>
                    </div>
                    <div className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-1 whitespace-nowrap bg-sky-950/95 text-sky-200 text-xs font-black px-2 py-0.5 rounded-md border border-sky-600 shadow-md pointer-events-none transition-opacity ${showPinLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <MapPin className="w-3 h-3 inline-block mr-1 -mt-0.5" />{gpsFix ? `My GPS Location (±${Math.round(gpsFix.accuracy)} m)` : `My Location (${location.name})`}
                    </div>
                  </div>
                </div>
              );
            })()}

            {visiblePins.map((pin) => {
              const px = latLngToPixel(pin.lat, pin.lng);
              if (px.x < -40 || px.x > dimensions.width + 40 || px.y < -40 || px.y > dimensions.height + 40) {
                return null;
              }

              const isSelected = selectedPinId === pin.id;
              const pinMeta = PIN_METADATA[pin.type] || PIN_METADATA.stand;

              return (
                <div
                  key={pin.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasMovedRef.current || isDrawingPolygon || isDrawingPath || (Date.now() - lastPinchTimeRef.current < 400)) return;
                    setSelectedPinId(pin.id);
                    setSelectedPolygonId(null);
                    setShowHourlyWeather(false);
                  }}
                  className={`absolute left-0 top-0 group ${
                    isDrawingPolygon || isDrawingPath ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
                  }`}
                  style={{ left: `${px.x}px`, top: `${px.y}px`, transform: 'translate(-50%, -50%)' }}
                >
                  <div
                    style={{
                      transform: 'scale(var(--map-pin-inverse-scale)) rotate(var(--map-pin-inverse-rotation))',
                      transformOrigin: 'center center',
                    }}
                  >
                    <div
                      className={`relative flex items-center justify-center rounded-full shadow-xl transition-all ${
                        isSelected
                          ? 'w-10 h-10 ring-4 ring-emerald-400 scale-125 z-30'
                          : 'w-8 h-8 hover:scale-110 z-20'
                      } ${pinMeta.color}`}
                    >
                      <span className="text-sm"><MetaIcon icon={pinMeta.icon} fallback={Crosshair} className="w-4 h-4" /></span>
                    </div>

                    {/* Pin Name Label — always visible when the Labels toggle
                        is on or the pin is selected; otherwise it appears on
                        hover so a busy map stays readable. */}
                    <div className={`absolute top-full left-1/2 transform -translate-x-1/2 mt-1 whitespace-nowrap bg-slate-950/90 text-white text-xs font-black px-2 py-0.5 rounded-md border border-slate-700 shadow-md pointer-events-none transition-opacity ${showPinLabels || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {pin.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>



        {/* TOP LEFT FLOATING BAR: "+ Add" tools and location search.
            The search field stays collapsed to a compact icon so the bar
            never crowds the Layers button on the right edge; it expands
            only while you're actually using it. */}
        <div className="absolute top-3 left-3 z-50 flex items-center pointer-events-auto ui-control max-w-[calc(100%-140px)]" ref={searchContainerRef}>
          <div className={`relative flex items-stretch rounded-xl border shadow-xl backdrop-blur-md ${
            isDark ? 'bg-slate-950/85 border-slate-800 focus-within:border-emerald-500' : 'bg-white/95 border-slate-200 focus-within:border-emerald-600'
          }`}>
            <button
              onClick={() => {
                setShowAddDropdown((prev) => !prev);
                setShowLayersDropdown(false);
              }}
              className="pl-3 pr-2.5 py-2 rounded-l-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Add markers, zones and routes"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAddDropdown ? 'rotate-180' : ''}`} />
            </button>
            <div className={`w-px ${isDark ? 'bg-emerald-300/25' : 'bg-emerald-900/20'}`} />
            {showSearchBox ? (
              <div className="flex items-center px-2.5 py-1.5 min-w-0">
                <Search className={`w-3.5 h-3.5 mr-1.5 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Jump to location..."
                  className={`w-32 sm:w-48 bg-transparent text-xs focus:outline-none ${
                    isDark ? 'text-white placeholder-slate-400' : 'text-slate-900 placeholder-slate-500'
                  }`}
                />
                {isSearching && (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin ml-1.5 flex-shrink-0" />
                )}
                <button
                  onClick={() => {
                    setShowSearchBox(false);
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowDropdown(false);
                  }}
                  className={`ml-1 p-0.5 rounded-md flex-shrink-0 cursor-pointer transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Close search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowSearchBox(true);
                  setShowAddDropdown(false);
                  setShowLayersDropdown(false);
                }}
                className={`px-2.5 py-2 rounded-r-xl flex items-center transition-colors cursor-pointer ${
                  isDark ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Jump to location"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            {/* Add Dropdown Menu */}
            {showAddDropdown && (
              <div
                className={`absolute top-full left-0 mt-2 w-56 rounded-2xl border shadow-2xl p-2 z-[60] animate-fadeIn backdrop-blur-md ${
                  isDark ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
                }`}
              >
                <div className="text-xs font-black uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-800/20 mb-1">
                  Map Plotter Tools
                </div>

                <button
                  onClick={() => {
                    setIsPlacingMarkerMode(true);
                    setIsDrawingPolygon(false);
                    setIsDrawingPath(false);
                    setShowAddDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-transparent hover:bg-transparent transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                >
                  <Crosshair className="w-5 h-5" />
                  <div>
                    <div>Add Marker</div>
                    <div className="text-[11px] text-slate-400 font-normal">Drop Stand / Trail Cam Pin</div>
                  </div>
                </button>

                <button
                  onClick={handleStartDrawPolygon}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-transparent hover:bg-transparent transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                >
                  <Wheat className="w-5 h-5" />
                  <div>
                    <div>Add Polygon Zone</div>
                    <div className="text-[11px] text-slate-400 font-normal">Plot Food Plot / Bedding Zone</div>
                  </div>
                </button>

                <button
                  onClick={handleStartDrawPropertyBoundary}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-transparent hover:bg-transparent transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                >
                  <Home className="w-5 h-5" />
                  <div>
                    <div>Add Property Boundary</div>
                    <div className="text-[11px] text-slate-400 font-normal">Draw Land Perimeter Line</div>
                  </div>
                </button>

                <button
                  onClick={handleStartDrawPath}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-transparent hover:bg-transparent transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                >
                  <Route className="w-5 h-5" />
                  <div>
                    <div>Add Path / Route</div>
                    <div className="text-[11px] text-slate-400 font-normal">Draw Deer Trail / Travel Route Line</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Location Search Results Popup */}
          {showSearchBox && showDropdown && searchResults.length > 0 && (
            <div
              className={`absolute top-full left-12 mt-1.5 w-60 border rounded-xl shadow-2xl overflow-hidden z-40 max-h-60 overflow-y-auto divide-y ${
                isDark ? 'bg-slate-900 border-slate-700 divide-slate-800 text-slate-200' : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
              }`}
            >
              {searchResults.map((loc, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCenterLat(loc.latitude);
                    setCenterLng(loc.longitude);
                    setShowDropdown(false);
                    setSearchQuery('');
                    setShowSearchBox(false);
                    setSearchResults([]);
                    if (onSelectLocation) onSelectLocation(loc);
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center justify-between text-xs cursor-pointer ${
                    isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">
                    {loc.name}, {loc.admin1}
                  </span>
                </button>
              ))}
            </div>
          )}

        </div>

        {/* BOTTOM LEFT: Best stand for the current wind — a compact chip kept
            out of the toolbar row so the map reads calm. Hidden while a bottom
            panel owns the screen (the hourly bar and scent panel carry the
            same wind context). Tap it to center the map on that stand. */}
        {showBestWindBadge && !showHourlyWeather && !selectedPin && !selectedPolygon && !selectedPath && (() => {
            const best = getBestStandForWind(windDeg);
            const matchingPin = best ? pins.find(p => p.name === best.name) : null;
            const pinMeta = matchingPin ? PIN_METADATA[matchingPin.type] || PIN_METADATA.stand : null;
            const hasNonHomePins = pins.some(p => p.type !== 'home');
            const hourLabel = selectedHour === 0 ? '12 AM' : selectedHour === 12 ? '12 PM' : selectedHour > 12 ? `${selectedHour - 12} PM` : `${selectedHour} AM`;
            const isHunting = theme === 'hunting';
            const isOlive = theme === 'olive' || theme === 'hunting';

            return (
              <div
                className={`absolute bottom-16 sm:bottom-4 left-4 z-30 max-w-[min(60%,320px)] px-2 py-1 rounded-xl border shadow-lg backdrop-blur-md flex items-center gap-1.5 text-xs font-bold transition-all ui-control ${
                  best
                    ? isDark
                      ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-200 shadow-emerald-950/40'
                      : isHunting
                      ? 'bg-[#eae1cf]/95 border-[#c85a17]/60 text-[#2a1b0e] shadow-[#c85a17]/20'
                      : isOlive
                      ? 'bg-[#f7f5ed]/95 border-[#556b2f]/60 text-[#1e2e1b] shadow-[#556b2f]/20'
                      : 'bg-emerald-50 border-emerald-500/80 text-emerald-900 shadow-emerald-500/20'
                    : isDark
                    ? 'bg-slate-950/90 border-slate-800 text-slate-200 shadow-slate-950/40'
                    : isHunting
                    ? 'bg-[#eae1cf]/90 border-[#d4c4a8] text-[#2a1b0e] shadow-[#d4c4a8]/30'
                    : isOlive
                    ? 'bg-[#f7f5ed]/90 border-[#d8d2c0] text-[#1e2e1b] shadow-[#d8d2c0]/30'
                    : 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50'
                }`}
              >
                <div
                  onClick={() => {
                    if (matchingPin) {
                      setCenterLat(matchingPin.lat);
                      setCenterLng(matchingPin.lng);
                      setSelectedPinId(matchingPin.id);
                      setSelectedPolygonId(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 truncate ${matchingPin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  title={matchingPin ? `Click to center on ${matchingPin.name}` : 'Set preferred wind on stand pins to see recommendations'}
                >
                  <span className="flex-shrink-0 flex items-center"><MetaIcon icon={pinMeta?.icon} fallback={Crosshair} className="w-4 h-4" /></span>
                  <span className={`text-xs font-extrabold uppercase tracking-wider ${best ? (isDark ? 'text-emerald-400' : isHunting ? 'text-[#c85a17]' : isOlive ? 'text-[#556b2f]' : 'text-emerald-600') : (isDark ? 'text-slate-400' : isHunting ? 'text-[#8b7355]' : isOlive ? 'text-[#6e6a5e]' : 'text-slate-500')}`}>
                    Best:
                  </span>
                  <span className={`font-black truncate max-w-[100px] sm:max-w-[140px] ${isDark ? 'text-white' : isHunting ? 'text-[#2a1b0e]' : isOlive ? 'text-[#1e2e1b]' : 'text-slate-900'}`}>
                    {best ? best.name : (pins.length === 0 || !hasNonHomePins ? 'No Stands' : 'No Pref Wind')}
                  </span>
                  {best && (
                    <span className={`text-xs font-normal truncate ${isDark ? 'text-emerald-300/80' : isHunting ? 'text-[#c85a17]/80' : isOlive ? 'text-[#556b2f]/80' : 'text-emerald-700/80'}`}>
                      ({windDirText}@{hourLabel})
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBestWindBadge(false);
                  }}
                  className={`p-0.5 rounded-md transition-colors cursor-pointer flex-shrink-0 ${
                    best
                      ? (isDark ? 'text-emerald-300 hover:text-white hover:bg-emerald-900/50' : isHunting ? 'text-[#c85a17] hover:text-[#2a1b0e] hover:bg-[#d4c4a8]/50' : isOlive ? 'text-[#556b2f] hover:text-[#1e2e1b] hover:bg-[#d8d2c0]/50' : 'text-emerald-700 hover:text-emerald-950 hover:bg-emerald-200/50')
                      : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : isHunting ? 'text-[#8b7355] hover:text-[#2a1b0e] hover:bg-[#d4c4a8]/50' : isOlive ? 'text-[#6e6a5e] hover:text-[#1e2e1b] hover:bg-[#d8d2c0]/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200')
                  }`}
                  title="Dismiss badge"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()}

        {/* TOP RIGHT FLOATING BAR: "Layers" Button & Dropdown Menu */}
        <div className="absolute top-3 right-3 z-[60] pointer-events-auto ui-control">
          <button
            onClick={() => {
              setShowLayersDropdown((prev) => !prev);
              setShowAddDropdown(false);
            }}
            className={`px-3 py-1.5 rounded-xl border shadow-xl flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider backdrop-blur-md transition-all cursor-pointer ${
              showLayersDropdown
                ? 'bg-emerald-600 text-white border-emerald-400'
                : isDark
                ? 'bg-slate-950/85 border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800'
                : 'bg-white/95 border-slate-200 text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Layers</span>
            <span className="ml-1 px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-md text-xs font-black">
              {pins.length + polygons.length + paths.length}
            </span>
          </button>

          {/* FLOATING LAYERS & MARKERS DROPDOWN POPOVER */}
          {showLayersDropdown && (
            <div
              className={`absolute top-full right-0 mt-2 w-80 sm:w-88 rounded-2xl border shadow-2xl p-4 z-50 animate-fadeIn backdrop-blur-md max-h-[80vh] overflow-y-auto ${
                isDark ? 'bg-slate-900/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2 mb-3 border-slate-800/40">
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  Map Layers & Saved Items
                </h3>
                <button
                  onClick={() => setShowLayersDropdown(false)}
                  className="text-slate-400 hover:text-rose-400 font-extrabold text-xs p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Map Style Switcher */}
              <div className="mb-3 space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Map Satellite Style</span>
                <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl border ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  {(['satellite', 'topo', 'street'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setMapStyle(style)}
                      className={`py-1 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                        mapStyle === style
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : isDark
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {style === 'satellite' ? 'Sat' : style === 'topo' ? 'Topo' : 'Road'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layer Display Feature Toggles */}
              <div className="mb-3 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Layer Overlays</span>
                
                {/* Preferred Wind Arc Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPreferredWind((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPreferredWind
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span>Preferred Wind Sector Arc</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showPreferredWind ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPreferredWind ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Live Scent Plume Toggle */}
                <button
                  type="button"
                  onClick={() => setShowScentCone((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showScentCone
                      ? 'bg-orange-500/15 border-orange-500/50 text-orange-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-orange-400" />
                    <span>Live Weather Scent Plume</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showScentCone ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showScentCone ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Markers Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPins((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPins
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Show Stand Markers</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showPins ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPins ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Pin Name Labels Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPinLabels((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPinLabels
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span>Pin Name Labels</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showPinLabels ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPinLabels ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Property Boundaries Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPropertyBoundaries((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPropertyBoundaries
                      ? 'bg-rose-500/15 border-rose-500/50 text-rose-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-nowrap">
                    <Home className="w-4 h-4" />
                    <span>Show Property Boundaries</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showPropertyBoundaries ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPropertyBoundaries ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Fields/Zones Toggle */}
                <button
                  type="button"
                  onClick={() => setShowZones((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showZones
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shapes className="w-4 h-4 text-amber-400" />
                    <span>Show Field Zones</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showZones ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showZones ? 'ON' : 'OFF'}
                  </span>
                </button>

                {/* Paths / Routes Toggle */}
                <button
                  type="button"
                  onClick={() => setShowPaths((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showPaths
                      ? 'bg-sky-500/15 border-sky-500/50 text-sky-400'
                      : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4" />
                    <span>Show Paths & Trails</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    showPaths ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {showPaths ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Segmented Items Switcher Tabs */}
              <div className="flex border-b border-slate-800/40 mb-3">
                <button
                  onClick={() => setActiveLayersTab('pins')}
                  className={`flex-1 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    activeLayersTab === 'pins'
                      ? 'border-emerald-500 text-emerald-400'
                      : `border-transparent text-slate-400 ${isDark ? 'hover:text-slate-200' : 'hover:text-slate-700'}`
                  }`}
                >
                  <span>Pins ({pins.length})</span>
                </button>
                <button
                  onClick={() => setActiveLayersTab('polygons')}
                  className={`flex-1 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    activeLayersTab === 'polygons'
                      ? 'border-amber-500 text-amber-400'
                      : `border-transparent text-slate-400 ${isDark ? 'hover:text-slate-200' : 'hover:text-slate-700'}`
                  }`}
                >
                  <span>Zones ({polygons.length})</span>
                </button>
                <button
                  onClick={() => setActiveLayersTab('paths')}
                  className={`flex-1 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    activeLayersTab === 'paths'
                      ? 'border-sky-500 text-sky-400'
                      : `border-transparent text-slate-400 ${isDark ? 'hover:text-slate-200' : 'hover:text-slate-700'}`
                  }`}
                >
                  <span>Paths ({paths.length})</span>
                </button>
              </div>

              {/* Tab 1: Pins List */}
              {activeLayersTab === 'pins' && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {pins.length === 0 ? (
                    <TeachingEmptyState
                      theme={theme}
                      isDark={isDark}
                      icon={<MapPin className="w-5 h-5" />}
                      title="No Stand Pins Yet"
                      description="Pins mark the exact spots that matter — stands, trail cameras, bedding, food plots & scrapes."
                      steps={[
                        { title: 'Tap the + Add button', description: 'Pick a pin type like Tree Stand or Trail Camera.' },
                        { title: 'Drop it on your property', description: 'Tap the map where the spot sits — zoom in for precision.' },
                        { title: 'Add preferred wind', description: 'Set your ideal wind and the forecast will recommend this stand when the wind matches.' },
                      ]}
                      ctaLabel="Add a Pin"
                      onCta={() => {
                        setShowLayersDropdown(false);
                        setShowAddDropdown(true);
                      }}
                      compact
                    />
                  ) : (
                    pins.map((pin) => {
                      const pinMeta = PIN_METADATA[pin.type] || PIN_METADATA.stand;
                      const isSelected = selectedPinId === pin.id;
                      return (
                        <div
                          key={pin.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? `bg-emerald-500/15 border-emerald-500/60 ${isDark ? 'text-white' : 'text-emerald-950'}`
                              : isDark
                              ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                          onClick={() => centerOnPin(pin)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="flex-shrink-0 flex items-center"><MetaIcon icon={pinMeta.icon} fallback={Crosshair} className="w-5 h-5" /></span>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{pin.name}</div>
                              <div className="text-xs text-slate-400 truncate">{pinMeta.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingPinId(pin.id);
                                setEditName(pin.name);
                                setEditType(pin.type);
                                setEditNotes(pin.notes || '');
                                setEditPreferredWindDeg(pin.preferredWindDeg || 0);
                              }}
                              className="p-2 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                              title="Edit Pin"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePin(pin.id)}
                              className="p-2 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Pin"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 3: Paths List */}
              {activeLayersTab === 'paths' && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {paths.length === 0 ? (
                    <TeachingEmptyState
                      theme={theme}
                      isDark={isDark}
                      icon={<GitBranch className="w-5 h-5" />}
                      title="No Paths or Trails Yet"
                      description="Paths map the routes deer actually travel — trails, travel corridors, fence lines & creeks."
                      steps={[
                        { title: 'Tap + Add → Path', description: 'Switch into path-drawing mode.' },
                        { title: 'Trace the route on the map', description: 'Click points along the trail; snap to pins & other paths automatically.' },
                        { title: 'Name and save it', description: 'Connect paths from Home to a stand and Best Path finds the safest scent route.' },
                      ]}
                      ctaLabel="Draw a Path"
                      onCta={() => {
                        setShowLayersDropdown(false);
                        setShowAddDropdown(true);
                      }}
                      compact
                    />
                  ) : (
                    paths.map((path) => {
                      const pathMeta = PATH_METADATA[path.type] || PATH_METADATA.custom;
                      const isSelected = selectedPathId === path.id;
                      return (
                        <div
                          key={path.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? `bg-sky-500/15 border-sky-500/60 ${isDark ? 'text-white' : 'text-sky-950'}`
                              : isDark
                              ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                          onClick={() => selectPathAndCenter(path)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="flex-shrink-0 flex items-center"><MetaIcon icon={pathMeta.icon} fallback={Route} className="w-5 h-5" /></span>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{path.name}</div>
                              <div className="text-xs text-sky-400 font-semibold truncate">{pathMeta.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingPathId(path.id);
                                setPathEditName(path.name);
                                setPathEditType(path.type);
                                setPathEditNotes(path.notes || '');
                              }}
                              className="p-2 text-slate-400 hover:text-sky-400 transition-colors cursor-pointer"
                              title="Edit Path"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePath(path.id)}
                              className="p-2 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Path"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Polygons List */}
              {activeLayersTab === 'polygons' && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {polygons.length === 0 ? (
                    <TeachingEmptyState
                      theme={theme}
                      isDark={isDark}
                      icon={<Shapes className="w-5 h-5" />}
                      title="No Zones or Boundaries Yet"
                      description="Zones outline your food plots, bedding sanctuaries, water sources, timber & property lines."
                      steps={[
                        { title: 'Tap + Add → Zone', description: 'Choose a zone type like Food Plot or Bedding Sanctuary.' },
                        { title: 'Click the corners', description: 'Place points around the area — acreage & perimeter are calculated automatically.' },
                        { title: 'Use zones in planning', description: 'Scent-cone and Best Path routing avoid downwind bedding zones automatically.' },
                      ]}
                      ctaLabel="Draw a Zone"
                      onCta={() => {
                        setShowLayersDropdown(false);
                        setShowAddDropdown(true);
                      }}
                      compact
                    />
                  ) : (
                    polygons.map((poly) => {
                      const polyMeta = POLYGON_METADATA[poly.type] || POLYGON_METADATA.custom;
                      const isSelected = selectedPolygonId === poly.id;
                      return (
                        <div
                          key={poly.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? `bg-amber-500/15 border-amber-500/60 ${isDark ? 'text-white' : 'text-amber-950'}`
                              : isDark
                              ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-200'
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                          onClick={() => selectPolygonAndCenter(poly)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="flex-shrink-0 flex items-center"><MetaIcon icon={polyMeta.icon} fallback={Flag} className="w-5 h-5" /></span>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{poly.name}</div>
                              <div className="text-xs text-amber-400 font-semibold truncate">{polyMeta.label}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingPolygonId(poly.id);
                                setPolygonEditName(poly.name);
                                setPolygonEditType(poly.type);
                                setPolygonEditNotes(poly.notes || '');
                              }}
                              className="p-2 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                              title="Edit Zone"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePolygon(poly.id)}
                              className="p-2 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TOP FLOATING CREATION TOOLBAR: Active Polygon / Path Drawing OR Pin Placing Mode */}
        {(isDrawingPolygon || isDrawingPath || isPlacingMarkerMode) && (
          <div className="absolute top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 z-[70] bg-slate-950/95 text-white border border-emerald-500/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-center gap-3 animate-fadeIn pointer-events-auto ui-control">
            {isPlacingMarkerMode ? (
              <>
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <MapPin className="w-4 h-4 animate-bounce" />
                  <span>Click anywhere on map to drop Stand Pin</span>
                </div>
                <button
                  onClick={() => setIsPlacingMarkerMode(false)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : isDrawingPath ? (
              <>
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                  <Shapes className="w-4 h-4 animate-pulse" />
                  <span>Drawing Path ({currentPathPoints.length} points)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleUndoPathPoint}
                    disabled={currentPathPoints.length === 0}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Undo className="w-3 h-3" /> Undo
                  </button>
                  <button
                    onClick={handleFinishDrawPath}
                    disabled={currentPathPoints.length < 2}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-extrabold uppercase rounded-lg flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Finish
                  </button>
                  <button
                    onClick={() => {
                      setIsDrawingPath(false);
                      setCurrentPathPoints([]);
                      setPathSnapPreview(null);
                    }}
                    className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Shapes className="w-4 h-4 animate-pulse" />
                  <span>Drawing {POLYGON_METADATA[polygonEditType]?.label || 'Zone'} ({currentPolygonPoints.length} points)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleUndoPolygonPoint}
                    disabled={currentPolygonPoints.length === 0}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Undo className="w-3 h-3" /> Undo
                  </button>
                  <button
                    onClick={handleFinishDrawPolygon}
                    disabled={currentPolygonPoints.length < 3}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-extrabold uppercase rounded-lg flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Finish
                  </button>
                  <button
                    onClick={() => {
                      setIsDrawingPolygon(false);
                      setCurrentPolygonPoints([]);
                    }}
                    className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* BOTTOM RIGHT FLOATING CONTROLS: Hourly weather toggle, rotation
            reset and GPS locate — one tidy corner stack instead of controls
            scattered along the bottom edge. */}
        <div className="absolute bottom-16 sm:bottom-4 right-4 z-30 pointer-events-auto flex flex-col items-end gap-2">
          {/* Hourly weather toggle — the old bottom-center pill, folded into
              the corner stack. Opens the hourly slider; tap again to close. */}
          {!selectedPin && !selectedPolygon && !selectedPath && (
            <button
              onClick={() => {
                if (showHourlyWeather) {
                  setShowHourlyWeather(false);
                } else {
                  setSelectedHour(new Date().getHours());
                  setShowHourlyWeather(true);
                }
              }}
              className={`p-2.5 rounded-2xl border shadow-xl backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5 ${
                showHourlyWeather
                  ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-950/50'
                  : isDark
                  ? 'bg-slate-950/85 border-slate-800 text-emerald-400 hover:bg-slate-800 hover:text-white'
                  : 'bg-white/95 border-slate-200 text-emerald-600 hover:bg-slate-50'
              }`}
              title="Inspect forecast wind and precipitation hour by hour"
              aria-expanded={showHourlyWeather}
              aria-controls="map-hourly-weather-control"
            >
              <span className="relative flex items-center">
                <Clock className="w-4 h-4" />
                <Droplets className={`w-2.5 h-2.5 absolute -right-1.5 -bottom-1 ${showHourlyWeather ? 'text-emerald-200' : 'text-sky-400'}`} />
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider leading-none">Weather</span>
            </button>
          )}
          {/* Rotation indicator — shows current map rotation and allows reset */}
          {rotationDisplay !== 0 && (
            <button
              onClick={() => {
                rotationRef.current = 0;
                setRotationDisplay(0);
                // applyMapTransform also clears the pins overlay's inverse
                // transform to 'none', so both the tiles and the pins return
                // to north-up & full size together.
                applyMapTransform(zoomScaleRef.current, panOffsetRef.current.x, panOffsetRef.current.y, 0);
              }}
              className={`p-2 rounded-2xl border shadow-xl backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-950/85 border-sky-500/50 text-sky-400 hover:bg-slate-800 hover:text-white'
                  : 'bg-white/95 border-sky-200 text-sky-600 hover:bg-slate-50'
              }`}
              title="Tap to reset map rotation to North-up"
            >
              <Compass className="w-4 h-4" style={{ transform: `rotate(${-rotationDisplay}deg)` }} />
              <span className="text-xs font-black">{Math.round(rotationDisplay)}°</span>
            </button>
          )}
          <button
            onClick={handleGetCurrentLocation}
            className={`p-2.5 rounded-2xl border shadow-xl backdrop-blur-md transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-950/85 border-slate-800 text-emerald-400 hover:bg-slate-800 hover:text-white'
                : 'bg-white/95 border-slate-200 text-emerald-600 hover:bg-slate-50'
            }`}
            title="Center map on my current GPS location"
          >
            {isLocating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* HOURLY WEATHER SLIDER (standalone): shown only while nothing is
            selected. When a pin is selected the same slider lives inside the
            scent panel's "Hourly Scent" tab, so the map never stacks two
            floating panels at once. */}
        {showHourlyWeather && !selectedPin && !selectedPolygon && !selectedPath && (
          <div
            id="map-hourly-weather-control"
            className="absolute bottom-16 sm:bottom-3 left-2 right-2 sm:left-3 sm:right-3 z-50 pointer-events-auto animate-fadeIn"
            role="region"
            aria-label="Hourly weather forecast"
          >
            <div
              className={`rounded-xl border shadow-2xl backdrop-blur-md px-2 py-1 ${
                isDark ? 'bg-slate-950/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                {dayStepper}
                <Clock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-black whitespace-nowrap tabular-nums">
                  {selectedHour === 0 ? '12 AM' : selectedHour === 12 ? '12 PM' : selectedHour > 12 ? `${selectedHour - 12} PM` : `${selectedHour} AM`}
                </span>
                {bestPathActive && (
                  <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30 whitespace-nowrap hidden sm:inline-flex items-center gap-0.5">
                    <GitBranch className="w-2.5 h-2.5" />Best Path
                  </span>
                )}
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={selectedHour}
                  onChange={(e) => setSelectedHour(parseInt(e.target.value, 10))}
                  className={`flex-1 min-w-0 accent-emerald-500 cursor-pointer h-1 border rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}
                  style={{ backgroundColor: isDark ? '#334155' : '#cbd5e1' }}
                  aria-label="Hourly weather slider"
                />
                <button
                  onClick={() => setShowHourlyWeather(false)}
                  className="p-2 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer flex-shrink-0"
                  title="Close hourly weather slider"
                  aria-label="Close hourly weather forecast"
                  aria-expanded={showHourlyWeather}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Single-row weather stats — gapless inline pills that scroll
                  horizontally on cramped screens so the bar never wraps into
                  multiple lines. */}
              <div className="flex items-center gap-1 mt-1 overflow-x-auto whitespace-nowrap text-[11px] font-bold scrollbar-none">
                <span className="inline-flex items-center gap-0.5 text-emerald-400"><Wind className="w-2.5 h-2.5" />{windDirText} {displayWindSpeed}</span>
                <span className="text-slate-500">·</span>
                <span className="inline-flex items-center gap-0.5 text-sky-400"><Droplets className="w-2.5 h-2.5" />{precipProbability}% · {displayPrecipAmount}</span>
                <span className="text-slate-500">·</span>
                <span className="inline-flex items-center gap-0.5 text-sky-400">
                  Scent: {downwindDirText}
                </span>
                <span className="text-slate-500">·</span>
                <span className={`inline-flex items-center gap-0.5 ${currentHourForecast?.isPrimeWindow ? 'text-amber-500' : 'text-slate-400'}`}>
                  <Sparkles className="w-2.5 h-2.5" />
                  {currentHourForecast?.isPrimeWindow ? 'Best movement window' : `${currentHourForecast?.temp ?? '--'}°`}
                </span>
              </div>
            </div>
          </div>
        )}



        {/* CONDENSED BOTTOM FLOATING SCENT FORECASTER PANEL WITH TABS */}
        {selectedPin && (
          <div
            className={`absolute bottom-16 sm:bottom-3 left-2 right-2 sm:left-3 sm:right-3 z-40 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md pointer-events-auto ui-control overflow-hidden ${
              isDark ? 'bg-slate-950/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
            }`}
          >
            {/* Header Bar — single tight row: icon, name, type/wind pill,
                then the actions. Saves a full line of vertical space. */}
            <div className="flex items-center gap-2 p-2 border-b border-slate-800/30 bg-slate-950/20">
              <span className="text-xl flex-shrink-0 flex items-center"><MetaIcon icon={PIN_METADATA[selectedPin.type]?.icon} fallback={Crosshair} className="w-5 h-5" /></span>
              <h4 className="text-xs font-black truncate flex-shrink">{selectedPin.name}</h4>
              <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap flex-shrink-0 ${
                isDark ? 'bg-slate-800/70 text-emerald-300' : 'bg-emerald-500/10 text-emerald-700'
              }`}>
                {PIN_METADATA[selectedPin.type]?.label}
              </span>
              <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap flex-shrink-0 ${
                isDark ? 'bg-slate-800/70 text-sky-300' : 'bg-sky-500/10 text-sky-700'
              }`}>
                <Wind className="w-2.5 h-2.5" />{windDirText} {displayWindSpeed}
              </span>

              <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                <button
                  onClick={() => setIsScentPanelCollapsed((prev) => !prev)}
                  className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  title={isScentPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
                >
                  {isScentPanelCollapsed ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (bestPathActive) {
                      setBestPathActive(false);
                      setBestPathError(null);
                      setBestRouteGeometry(null);
                      setShowHourlyWeather(false);
                    } else {
                      const route = computeBestPathsToStand();
                      setBestRouteGeometry(route);
                      setBestPathActive(true);
                      setBestPathError(route ? null : 'Home and this stand must both touch connected drawn paths.');
                      setShowHourlyWeather(true);
                      setIsScentPanelCollapsed(false);
                      setActiveForecasterTab('hourly');
                    }
                  }}
                  className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1.5 px-2.5 cursor-pointer transition-all shadow-sm text-white ${
                    bestPathActive
                      ? 'bg-emerald-500 shadow-emerald-500/30'
                      : 'bg-emerald-600/70 hover:bg-emerald-500 shadow-emerald-900/30'
                  }`}
                  title={bestPathActive ? 'Clear best path highlights' : 'Find a connected path from Home to this stand avoiding scent'}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Best Path</span>
                </button>
                {bestPathError && (
                  <span className="max-w-48 text-xs font-semibold leading-tight text-amber-300" role="status">
                    {bestPathError}
                  </span>
                )}
                <button
                  onClick={() => setSelectedPinId(null)}
                  className="p-2 text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Collapsed Minimalist Preview Bar */}
            {isScentPanelCollapsed ? (
              <div className="p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase text-sky-400 truncate">
                    <Wind className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Scent: {downwindDirText} ({Math.round(downwindDeg)}°)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsScentPanelCollapsed(false); setShowHourlyWeather(true); setActiveForecasterTab('hourly'); }}
                    className="px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-400 text-xs font-black uppercase tracking-wide hover:bg-sky-500/25 transition-colors"
                    aria-expanded={showHourlyWeather}
                  >
                    Hourly
                  </button>
                </div>
              </div>
            ) : (
              /* Uncollapsed Expanded View with 2 Condensed TABS */
              <div className="p-2 space-y-2">
                {/* Segmented Tab Buttons */}
                <div className="flex border-b border-slate-800/40">
                  <button
                    onClick={() => setActiveForecasterTab('hourly')}
                    className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeForecasterTab === 'hourly'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Hourly</span>
                  </button>



                  <button
                    onClick={() => setActiveForecasterTab('details')}
                    className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeForecasterTab === 'details'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>
                </div>

                {/* TAB 1: Hourly Scent Controls — the hour scrubber and weather
                    stats live in this one compact panel so a selected pin shows
                    a single bottom card. */}
                {activeForecasterTab === 'hourly' && (
                  <div className="space-y-1.5">
                    {/* Hour scrubber — scent cone and stats below track this hour */}
                    <div className={`p-2 rounded-xl border ${
                      isDark ? 'border-slate-800/40 bg-slate-950/40' : 'border-slate-200 bg-slate-100/50'
                    }`}>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {dayStepper}
                        <Clock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="text-xs font-black whitespace-nowrap tabular-nums">
                          {selectedHour === 0 ? '12 AM' : selectedHour === 12 ? '12 PM' : selectedHour > 12 ? `${selectedHour - 12} PM` : `${selectedHour} AM`}
                        </span>
                        {bestPathActive && (
                          <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30 whitespace-nowrap hidden sm:inline-flex items-center gap-0.5">
                            <GitBranch className="w-2.5 h-2.5" />Best Path
                          </span>
                        )}
                        <input
                          type="range"
                          min="0"
                          max="23"
                          value={selectedHour}
                          onChange={(e) => setSelectedHour(parseInt(e.target.value, 10))}
                          className={`flex-1 min-w-0 accent-emerald-500 cursor-pointer h-1 border rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}
                          style={{ backgroundColor: isDark ? '#334155' : '#cbd5e1' }}
                          aria-label="Hourly weather slider"
                        />
                      </div>
                      {/* Compact stats row — wind, rain and movement window for
                          this hour. Scent direction is shown in the collapsed
                          preview bar and on the map itself. */}
                      <div className="flex items-center gap-1 mt-1 overflow-x-auto whitespace-nowrap text-[11px] font-bold scrollbar-none">
                        <span className="inline-flex items-center gap-0.5 text-emerald-400"><Wind className="w-2.5 h-2.5" />{windDirText} {displayWindSpeed}</span>
                        <span className="text-slate-500">·</span>
                        <span className="inline-flex items-center gap-0.5 text-sky-400"><Droplets className="w-2.5 h-2.5" />{precipProbability}% · {displayPrecipAmount}</span>
                        <span className="text-slate-500">·</span>
                        <span className="inline-flex items-center gap-0.5 text-amber-500"><Sparkles className="w-2.5 h-2.5" />{currentHourForecast?.temp ?? '--'}°</span>
                        {currentHourForecast?.isPrimeWindow && (
                          <span className="inline-flex items-center gap-0.5 text-amber-500">
                            · Best movement window
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Marker Details & Notes */}
                {activeForecasterTab === 'details' && (
                  <div className="space-y-1.5">
                    <div className={`p-2 rounded-xl border space-y-1 text-xs ${
                      isDark ? 'border-slate-800/40 bg-slate-950/40' : 'border-slate-200 bg-slate-100/50'
                    }`}>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">GPS Coordinates:</span>
                        <span className={`font-mono font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          {selectedPin.lat.toFixed(5)}°N, {selectedPin.lng.toFixed(5)}°W
                        </span>
                      </div>

                      {selectedPin.notes ? (
                        <p className={`text-xs italic border-l-2 border-emerald-500 pl-2 py-0.5 ${
                          isDark ? 'text-slate-300' : 'text-slate-600'
                        }`}>
                          "{selectedPin.notes}"
                        </p>
                      ) : (
                        <p className="text-xs italic text-slate-500">No notes added to this marker yet.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingPinId(selectedPin.id);
                          setEditName(selectedPin.name);
                          setEditType(selectedPin.type);
                          setEditNotes(selectedPin.notes || '');
                          setEditPreferredWindDeg(selectedPin.preferredWindDeg || 0);
                        }}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Edit Marker
                      </button>
                      <button
                        onClick={() => handleDeletePin(selectedPin.id)}
                        className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CONDENSED BOTTOM FLOATING SELECTED POLYGON / BOUNDARY INFORMATION PANEL */}
        {selectedPolygon && !selectedPin && selectedPolyStats && (
          <div
            className={`absolute bottom-16 sm:bottom-3 left-2 right-2 sm:left-3 sm:right-3 z-40 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md pointer-events-auto ui-control overflow-hidden animate-fadeIn ${
              isDark ? 'bg-slate-950/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
            }`}
          >
            {/* Header Bar */}
            <div className={`flex items-center justify-between p-3 border-b ${
              isDark ? 'border-slate-800/30 bg-slate-950/20' : 'border-slate-200 bg-slate-100/60'
            }`}>
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xl flex-shrink-0 flex items-center">
                  <MetaIcon icon={POLYGON_METADATA[selectedPolygon.type]?.icon} fallback={Flag} className="w-5 h-5" />
                </span>
                <div className="truncate">
                  <h4 className="text-xs font-black truncate">{selectedPolygon.name}</h4>
                  <span
                    className="text-xs font-bold block truncate"
                    style={{ color: POLYGON_METADATA[selectedPolygon.type]?.color || '#eab308' }}
                  >
                    {POLYGON_METADATA[selectedPolygon.type]?.label || 'Land Zone'} • {selectedPolygon.points.length} Boundary Points
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    setEditingPolygonId(selectedPolygon.id);
                    setPolygonEditName(selectedPolygon.name);
                    setPolygonEditType(selectedPolygon.type);
                    setPolygonEditNotes(selectedPolygon.notes || '');
                  }}
                  className="p-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-bold flex items-center gap-1.5 px-3 cursor-pointer transition-colors border border-amber-500/30"
                  title="Edit Zone / Boundary Details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  onClick={() => setSelectedPolygonId(null)}
                  className="p-2 text-slate-400 hover:text-rose-400 cursor-pointer"
                  title="Close Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Polygon Details Body */}
            <div className="p-3 space-y-2.5 text-xs">
              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase font-black text-slate-400 block">Total Area</span>
                  <span className="text-xs font-black text-amber-400">{selectedPolyStats.areaStr}</span>
                </div>

                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase font-black text-slate-400 block">Perimeter</span>
                  <span className="text-xs font-black text-emerald-400">{selectedPolyStats.perimeterStr}</span>
                </div>

                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase font-black text-slate-400 block">Current Wind</span>
                  <span className="text-xs font-black text-sky-400">{windDirText} @ {displayWindSpeed}</span>
                </div>
              </div>

              {/* Scouting Notes */}
              <div className={`p-2.5 rounded-xl border space-y-1 ${isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Scouting Strategy Notes</span>
                {selectedPolygon.notes ? (
                  <p className={`text-xs italic ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>"{selectedPolygon.notes}"</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No notes added to this boundary or zone yet.</p>
                )}
              </div>

              {/* Quick Action Footer */}
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={() => {
                    setEditingPolygonId(selectedPolygon.id);
                    setPolygonEditName(selectedPolygon.name);
                    setPolygonEditType(selectedPolygon.type);
                    setPolygonEditNotes(selectedPolygon.notes || '');
                  }}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Zone / Boundary
                </button>
                <button
                  onClick={() => handleDeletePolygon(selectedPolygon.id)}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selected Path Details Panel */}
        {selectedPath && !selectedPin && !selectedPolygon && selectedPathStats && (
          <div
            className={`absolute bottom-16 sm:bottom-3 left-2 right-2 sm:left-3 sm:right-3 z-40 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-md pointer-events-auto ui-control overflow-hidden animate-fadeIn ${
              isDark ? 'bg-slate-950/95 border-slate-800 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
            }`}
          >
            {/* Header Bar */}
            <div className={`flex items-center justify-between p-3 border-b ${
              isDark ? 'border-slate-800/30 bg-slate-950/20' : 'border-slate-200 bg-slate-100/60'
            }`}>
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-xl flex-shrink-0 flex items-center">
                  <MetaIcon icon={PATH_METADATA[selectedPath.type]?.icon} fallback={Route} className="w-5 h-5" />
                </span>
                <div className="truncate">
                  <h4 className="text-xs font-black truncate">{selectedPath.name}</h4>
                  <span
                    className="text-xs font-bold block truncate"
                    style={{ color: PATH_METADATA[selectedPath.type]?.color || '#0ea5e9' }}
                  >
                    {PATH_METADATA[selectedPath.type]?.label || 'Path'} • {selectedPath.points.length} Route Points
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    setEditingPathId(selectedPath.id);
                    setPathEditName(selectedPath.name);
                    setPathEditType(selectedPath.type);
                    setPathEditNotes(selectedPath.notes || '');
                  }}
                  className="p-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 text-xs font-bold flex items-center gap-1.5 px-3 cursor-pointer transition-colors border border-sky-500/30"
                  title="Edit Path Details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  onClick={() => setSelectedPathId(null)}
                  className="p-2 text-slate-400 hover:text-rose-400 cursor-pointer"
                  title="Close Panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Path Details Body */}
            <div className="p-3 space-y-2.5 text-xs">
              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase font-black text-slate-400 block">Total Length</span>
                  <span className="text-xs font-black text-sky-400">{selectedPathStats.lengthStr}</span>
                </div>

                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase font-black text-slate-400 block">Route Points</span>
                  <span className="text-xs font-black text-emerald-400">{selectedPath.points.length}</span>
                </div>

                <div className={`p-2 rounded-xl border text-center ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase font-black text-slate-400 block">Current Wind</span>
                  <span className="text-xs font-black text-sky-400">{windDirText} @ {displayWindSpeed}</span>
                </div>
              </div>

              {/* Scouting Notes */}
              <div className={`p-2.5 rounded-xl border space-y-1 ${isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Route Strategy Notes</span>
                {selectedPath.notes ? (
                  <p className={`text-xs italic ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>"{selectedPath.notes}"</p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No notes added to this path yet.</p>
                )}
              </div>

              {/* Quick Action Footer */}
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={() => {
                    setEditingPathId(selectedPath.id);
                    setPathEditName(selectedPath.name);
                    setPathEditType(selectedPath.type);
                    setPathEditNotes(selectedPath.notes || '');
                  }}
                  className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Path
                </button>
                <button
                  onClick={() => handleDeletePath(selectedPath.id)}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Save New Polygon Zone */}
      {isSavingNewPolygonModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsSavingNewPolygonModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Shapes className="w-3.5 h-3.5" />
                Save Land Polygon Zone
              </h3>
              <button
                onClick={() => setIsSavingNewPolygonModal(false)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Name
                </label>
                <input
                  type="text"
                  value={polygonEditName}
                  onChange={(e) => setPolygonEditName(e.target.value)}
                  placeholder="e.g. North Clover Food Plot"
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Classification
                </label>
                <AppSelect
                  value={polygonEditType}
                  onChange={(e) => setPolygonEditType(e.target.value as PolygonType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                >
                  {Object.entries(POLYGON_METADATA).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.label}
                    </option>
                  ))}
                </AppSelect>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scouting Notes
                </label>
                <textarea
                  value={polygonEditNotes}
                  onChange={(e) => setPolygonEditNotes(e.target.value)}
                  placeholder="e.g. Planted winter rye & clover..."
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveNewPolygon}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Zone
                </button>
                <button
                  onClick={() => setIsSavingNewPolygonModal(false)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Existing Polygon Details */}
      {editingPolygonId && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setEditingPolygonId(null)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" />
                Edit Polygon Zone
              </h3>
              <button
                onClick={() => setEditingPolygonId(null)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Name
                </label>
                <input
                  type="text"
                  value={polygonEditName}
                  onChange={(e) => setPolygonEditName(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Zone Classification
                </label>
                <AppSelect
                  value={polygonEditType}
                  onChange={(e) => setPolygonEditType(e.target.value as PolygonType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                >
                  {Object.entries(POLYGON_METADATA).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.label}
                    </option>
                  ))}
                </AppSelect>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scouting Notes
                </label>
                <textarea
                  value={polygonEditNotes}
                  onChange={(e) => setPolygonEditNotes(e.target.value)}
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSavePolygonEdit}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
                <button
                  onClick={() => setEditingPolygonId(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Save New Path */}
      {isSavingNewPathModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsSavingNewPathModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-sky-500 flex items-center gap-1.5">
                <Shapes className="w-3.5 h-3.5" />
                Save Path / Route
              </h3>
              <button
                onClick={() => setIsSavingNewPathModal(false)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Path Name
                </label>
                <input
                  type="text"
                  value={pathEditName}
                  onChange={(e) => setPathEditName(e.target.value)}
                  placeholder="e.g. Ridge Travel Route"
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Path Classification
                </label>
                <AppSelect
                  value={pathEditType}
                  onChange={(e) => setPathEditType(e.target.value as PathType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600'
                  }`}
                >
                  {Object.entries(PATH_METADATA).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.label}
                    </option>
                  ))}
                </AppSelect>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scouting Notes
                </label>
                <textarea
                  value={pathEditNotes}
                  onChange={(e) => setPathEditNotes(e.target.value)}
                  placeholder="e.g. Deer travel between bedding and food plot..."
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveNewPath}
                  className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Path
                </button>
                <button
                  onClick={() => setIsSavingNewPathModal(false)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Existing Path Details */}
      {editingPathId && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setEditingPathId(null)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-sky-500 flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" />
                Edit Path Details
              </h3>
              <button
                onClick={() => setEditingPathId(null)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Path Name
                </label>
                <input
                  type="text"
                  value={pathEditName}
                  onChange={(e) => setPathEditName(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Path Classification
                </label>
                <AppSelect
                  value={pathEditType}
                  onChange={(e) => setPathEditType(e.target.value as PathType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600'
                  }`}
                >
                  {Object.entries(PATH_METADATA).map(([typeKey, meta]) => (
                    <option key={typeKey} value={typeKey}>
                      {meta.label}
                    </option>
                  ))}
                </AppSelect>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scouting Notes
                </label>
                <textarea
                  value={pathEditNotes}
                  onChange={(e) => setPathEditNotes(e.target.value)}
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSavePathEdit}
                  className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
                <button
                  onClick={() => setEditingPathId(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Configure Marker Details */}
      {editingPinId && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setEditingPinId(null)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl space-y-4 relative ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-white'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2 border-slate-800/20">
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Configure Marker Details
              </h3>
              <button
                onClick={() => setEditingPinId(null)}
                className="text-slate-400 hover:text-rose-400 font-extrabold text-sm p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Pin Location Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Oak Ridge Stand"
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Marker Category
                </label>
                <AppSelect
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as PinType)}
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs focus:outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                >
                  <option value="stand">Tree Stand</option>
                  <option value="trail_cam">Trail Camera</option>
                  <option value="bedding">Bedding Sanctuary</option>
                  <option value="food_plot">Primary Food Plot</option>
                  <option value="scrape">Scrapeline / Rubbing Tree</option>
                  <option value="home">Home / Cabin</option>
                  <option value="other">Other Marker</option>
                </AppSelect>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Preferred Wind Direction
                  </label>
                  <span className="text-xs font-black text-emerald-400">
                    {getWindDirectionText(editPreferredWindDeg)} ({Math.round(editPreferredWindDeg)}°)
                  </span>
                </div>

                {/* Interactive Wind Compass Dial & Scent Cone Arc Visualizer */}
                <div className={`flex items-center gap-3 p-2.5 rounded-xl border my-2 ${
                  isDark ? 'bg-slate-950/80 border-emerald-500/30' : 'bg-slate-50 border-emerald-200'
                }`}>
                  <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center bg-slate-900 rounded-full border border-slate-700 shadow-inner">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <circle cx="50" cy="50" r="46" fill="none" stroke="#334155" strokeWidth="2" />
                      {(() => {
                        const downwind = (editPreferredWindDeg + 180) % 360;
                        const startAngle = (downwind - 70 + 360) % 360;
                        const endAngle = (downwind + 70 + 360) % 360;
                        return (
                          <path
                            d={getSvgArcPath(50, 50, 42, startAngle, endAngle)}
                            fill="#10b981"
                            fillOpacity="0.4"
                            stroke="#34d399"
                            strokeWidth="2"
                          />
                        );
                      })()}
                      <text x="50" y="15" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">N</text>
                      <text x="88" y="53" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">E</text>
                      <text x="50" y="92" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">S</text>
                      <text x="12" y="53" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="900">W</text>
                      
                      <circle cx="50" cy="50" r="4" fill="#10b981" />
                      {(() => {
                        const rad = ((editPreferredWindDeg - 90) * Math.PI) / 180;
                        const ax = 50 + 28 * Math.cos(rad);
                        const ay = 50 + 28 * Math.sin(rad);
                        return (
                          <line x1="50" y1="50" x2={ax} y2={ay} stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="flex-1 text-xs space-y-0.5">
                    <div className="font-extrabold text-emerald-400">
                      Scent Sector: {getWindDirectionText(editPreferredWindDeg)}
                    </div>
                    <div className="text-xs text-slate-400 leading-tight">
                      Green arc displays the 140° safe wind angle sector blowing scent away from game trails.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 mb-2">
                  {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((dir) => {
                    const deg = DIRECTION_DEGREES[dir];
                    const isSelected = Math.abs((editPreferredWindDeg - deg + 360) % 360) < 15;
                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => setEditPreferredWindDeg(deg)}
                        className={`py-1 text-xs font-extrabold rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                            : isDark
                            ? 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                            : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {dir} ({deg}°)
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="355"
                    step="5"
                    value={editPreferredWindDeg}
                    onChange={(e) => setEditPreferredWindDeg(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Scout Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Scouting strategy notes..."
                  rows={3}
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none resize-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSavePinDetails}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
                <button
                  onClick={() => {
                    if (editingPinId) handleDeletePin(editingPinId);
                  }}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Delete
                </button>
                <button
                  onClick={() => setEditingPinId(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold uppercase transition-colors cursor-pointer ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
