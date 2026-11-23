import React, { useState, useEffect, useRef } from 'react';
import { Star, Trash2, MapPin, Calendar, Clock, Wind, Thermometer, CheckSquare, Square, FileText, ChevronLeft, ChevronRight, Crosshair, Save, ScanLine, AlertTriangle, Camera, SlidersHorizontal, Check } from 'lucide-react';
import { ThemeMode, ThemeVariantMode, TrailCameraPhoto, TrailCameraLocation, TrailCameraTarget } from '../types';
import { getThumbnailUrl, matchWeatherForPhoto, updatePhoto, reRunOcrOnPhotos } from '../services/trailCameraService';
import { TeachingEmptyState } from './TeachingEmptyState';
import { AppSelect } from './AppSelect';

interface TrailCameraGalleryProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  photos: TrailCameraPhoto[];
  onSelectPhoto: (photo: TrailCameraPhoto) => void;
  onToggleFavorite: (photo: TrailCameraPhoto) => void;
  onToggleTag: (photo: TrailCameraPhoto, targetId: string) => void;
  onUpdatePhoto: (id: string, updates: Partial<TrailCameraPhoto>) => void;
  onDeletePhotos: (ids: string[]) => void;
  onAssignLocation: (ids: string[], locationId: string) => void;
  onAssignTags: (ids: string[], targetId: string) => void;
  locations: TrailCameraLocation[];
  targets: TrailCameraTarget[];
  showToast: (msg: string) => void;
  units?: string;
  totalPhotosCount?: number;
  onGoToImport?: () => void;
  onClearFilters?: () => void;
}

const ITEMS_PER_PAGE = 36;
const NO_DATE_BADGE = '— No Date — OCR Failed —';

const getThemeClasses = (theme?: ThemeVariantMode, isDark = theme === 'dark') => {
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive';

  return {
    cardBg: isDark
      ? 'bg-slate-900/[calc(var(--card-opacity)*0.5)] backdrop-blur-md border border-slate-700/50'
      : isHunting
      ? 'bg-[#eae1cf]/80 border-[#d4c4a8]'
      : isOlive
      ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]'
      : 'bg-white/60 border-slate-200/50',
    cardBorder: isDark ? 'border-slate-700/50' : isHunting ? 'border-[#d4c4a8]' : isOlive ? 'border-[#d8d2c0]' : 'border-slate-200/50',
    selectModeBtn: isSelectMode => isSelectMode
      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold'
      : isDark
      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e] hover:bg-[#d8cbb8]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b] hover:bg-[#e8e4d5]'
      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200',
    selectAllBtn: isDark
      ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300'
      : isHunting
      ? 'bg-[#eae1cf] hover:bg-[#d8cbb8] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] hover:bg-[#e8e4d5] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',
    photoCard: isSelected => isSelected
      ? 'ring-4 ring-emerald-500 border-emerald-500 scale-[0.98]'
      : isDark
      ? 'bg-slate-900 border-slate-800 hover:border-slate-600'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] hover:border-[#c85a17]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] hover:border-[#556b2f]'
      : 'bg-white border-slate-200 hover:border-slate-400',
    loadingBg: isDark ? 'bg-slate-800' : isHunting ? 'bg-[#d4c4a8]' : isOlive ? 'bg-[#e8e4d5]' : 'bg-slate-200',
    paginationBg: isDark
      ? 'bg-slate-900/[calc(var(--card-opacity)*0.5)] backdrop-blur-md border border-slate-700/50'
      : isHunting
      ? 'bg-[#eae1cf]/80 border-[#d4c4a8]'
      : isOlive
      ? 'bg-[#f7f5ed]/80 border-[#d8d2c0]'
      : 'bg-white/60 border-slate-200/50',
    paginationButton: isDark
      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
      : isHunting
      ? 'bg-[#d4c4a8] hover:bg-[#c8b796] border-[#b9a47e] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#d8d2c0] hover:bg-[#cbc5b0] border-[#b8b19b] text-[#1e2e1b]'
      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',
    modalBg: isDark
      ? 'bg-slate-900 border border-slate-700 text-slate-100'
      : isHunting
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-white border-slate-200 text-slate-900',
    selectBg: isDark ? 'bg-slate-950 border-slate-700 text-white' : isHunting ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]' : isOlive ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]' : 'bg-slate-50 border-slate-300 text-slate-900',
    cancelBtn: isDark
      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
      : isHunting
      ? 'bg-[#eae1cf] hover:bg-[#d8cbb8] border-[#d4c4a8] text-[#2a1b0e]'
      : isOlive
      ? 'bg-[#f7f5ed] hover:bg-[#e8e4d5] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',
  };
};

export const TrailCameraGallery: React.FC<TrailCameraGalleryProps> = ({
  theme,
  isDark = theme === 'dark',
  photos,
  onSelectPhoto,
  onToggleFavorite,
  onToggleTag,
  onUpdatePhoto,
  onDeletePhotos,
  onAssignLocation,
  onAssignTags,
  locations,
  targets,
  showToast,
  units = 'imperial',
  totalPhotosCount = 0,
  onGoToImport,
  onClearFilters,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showTimeDefaultedOnly, setShowTimeDefaultedOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [assignLocationModalOpen, setAssignLocationModalOpen] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState('');
  const [assignTargetModalOpen, setAssignTargetModalOpen] = useState(false);
  const [targetAssignId, setTargetAssignId] = useState('');
  const [activeTagPhotoId, setActiveTagPhotoId] = useState<string | null>(null);

  // In-place date setter — opens when user taps the "OCR Failed" badge on a card.
  const [dateModalPhotoId, setDateModalPhotoId] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [dateModalThumb, setDateModalThumb] = useState<string | null>(null);
  const [bulkReOcrInProgress, setBulkReOcrInProgress] = useState(false);
  const [savingDate, setSavingDate] = useState(false);

  // Long-press refs for gallery multi-select
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const displayPhotos = showTimeDefaultedOnly ? photos.filter(p => p.timeDefaulted) : photos;
  const totalPages = Math.ceil(displayPhotos.length / ITEMS_PER_PAGE) || 1;
  const paginatedPhotos = displayPhotos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const tc = getThemeClasses(theme, isDark);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Close tag popup on click outside
  useEffect(() => {
    if (!activeTagPhotoId) return;
    const handler = () => setActiveTagPhotoId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [activeTagPhotoId]);

  // Load thumbnails for current page
  useEffect(() => {
    let active = true;
    const loadThumbnails = async () => {
      // Resolve the whole page at once. Awaiting one photo at a time made a
      // 24-photo page serialize 24 IndexedDB reads before the grid could show
      // a single image.
      const missing = paginatedPhotos.filter((p) => !thumbnails[p.id]);
      const entries = await Promise.all(
        missing.map(async (p) => [p.id, await getThumbnailUrl(p.id)] as const),
      );
      if (!active) return;
      const newThumbs: Record<string, string> = {};
      for (const [id, url] of entries) {
        if (url) newThumbs[id] = url;
      }
      if (Object.keys(newThumbs).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...newThumbs }));
      }
    };
    loadThumbnails();
    return () => { active = false; };
  }, [currentPage, photos]);

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedPhotos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedPhotos.map((p) => p.id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.length} photo(s)?`)) {
      onDeletePhotos(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleAssignSelectedLocation = () => {
    if (selectedIds.length === 0 || !targetLocationId) return;
    onAssignLocation(selectedIds, targetLocationId);
    setSelectedIds([]);
    setAssignLocationModalOpen(false);
  };

  const handleAssignSelectedTarget = () => {
    if (selectedIds.length === 0 || !targetAssignId) return;
    onAssignTags(selectedIds, targetAssignId);
    setSelectedIds([]);
    setAssignTargetModalOpen(false);
  };

  const openDateModal = (photoId: string) => {
    // Pre-fill with current local date/time so the user only has to correct it.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDateValue(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    );
    setDateModalPhotoId(photoId);
    // Reset to null so the placeholder shimmer shows until the thumb resolves,
    // preventing a stale thumbnail from a different photo flashing for an instant.
    setDateModalThumb(null);
    // Load a thumbnail so the user can see WHICH photo they're setting a date on.
    (async () => {
      try {
        const url = await getThumbnailUrl(photoId);
        if (url) {
          // Guard against the user closing/opening another photo mid-fetch.
          setDateModalThumb((current) => (current === null ? url : current));
        }
      } catch {/* ignore */}
    })();
  };

  const closeDateModal = () => {
    // Don't allow backdrop close while async save is in flight — prevents
    // tearing down state mid-update if the user clicks outside during the
    // weather fetch.
    if (savingDate) return;
    setDateModalPhotoId(null);
    setDateModalThumb(null);
  };

  const handleSaveDateFromGallery = async () => {
    if (!dateModalPhotoId || savingDate) return;
    setSavingDate(true);
    try {
      const d = new Date(editDateValue);
      if (isNaN(d.getTime())) {
        showToast('Invalid date / time chosen');
        return;
      }
      const photo = photos.find((p) => p.id === dateModalPhotoId);
      if (!photo) { setDateModalPhotoId(null); return; }

      const newDateTime = d.toISOString();

      // Resolve GPS from the photo first, fall back to its assigned spot.
      let lat = photo.latitude ?? undefined;
      let lon = photo.longitude ?? undefined;
      if ((lat == null || lon == null) && photo.cameraLocationId) {
        const loc = locations.find((l) => l.id === photo.cameraLocationId);
        if (loc && loc.latitude != null && loc.longitude != null) {
          lat = loc.latitude;
          lon = loc.longitude;
        }
      }

      // Fetch weather up front so we can write one atomic update —
      // no UI flash of weather: undefined, no double analytics re-compute.
      const weather = (lat != null && lon != null)
        ? ((await matchWeatherForPhoto({
            ...photo,
            dateTime: newDateTime,
            latitude: lat,
            longitude: lon,
            weather: undefined,
          })) ?? undefined)
        : undefined;

      onUpdatePhoto(photo.id, {
        dateTime: newDateTime,
        timeDefaulted: false,
        weather,
        latitude: lat,
        longitude: lon,
      });
      setDateModalPhotoId(null);
      showToast(
        weather
          ? 'Date and weather saved.'
          : 'Date saved. Assign a camera spot for weather data.'
      );
    } catch (e) {
      console.error('[save date]', e);
      showToast('Saving the date failed — check the console for details.');
    } finally {
      setSavingDate(false);
    }
  };

  const handleBulkReOcr = async () => {
    if (selectedIds.length === 0 || bulkReOcrInProgress) return;

    // SAFETY: only re-OCR photos that already failed (no dateTime). This
    // protects user-edited dates from being overwritten by an OCR pass.
    const failedIds = photos
      .filter((p) => selectedIds.includes(p.id) && !p.dateTime)
      .map((p) => p.id);

    if (failedIds.length === 0) {
      showToast('None of the selected photos are missing a date — nothing to re-OCR.');
      return;
    }

    setBulkReOcrInProgress(true);
    const skipped = selectedIds.length - failedIds.length;
    showToast(
      skipped > 0
        ? `Re-running OCR on ${failedIds.length} of ${selectedIds.length} selected (skipping ${skipped} with dates so manual edits aren't overwritten) — this can take a minute…`
        : `Re-running OCR on ${failedIds.length} photo(s) — this can take a minute…`
    );
    try {
      const result = await reRunOcrOnPhotos(failedIds);
      showToast(
        `Re-OCR complete: ${result.updated} recovered, ${result.stillFailed} still couldn't be read.`
      );
    } catch (e) {
      console.error('[re-OCR]', e);
      showToast('Re-OCR failed; check the console for details.');
    } finally {
      setBulkReOcrInProgress(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Gallery Action Bar */}
      <div className={`flex flex-col gap-3 p-3 sm:p-4 rounded-2xl ${tc.cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-60">Photo library</div>
            <div className="text-sm font-black mt-0.5">{photos.length} photo{photos.length === 1 ? '' : 's'} shown{totalPhotosCount > photos.length ? ` · ${totalPhotosCount} total` : ''}</div>
          </div>
          {showTimeDefaultedOnly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-500">
              <AlertTriangle className="w-3 h-3" /> Needs time review
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              setSelectedIds([]);
            }}
            className={`min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${tc.selectModeBtn(isSelectMode)}`}
          >
            {isSelectMode ? 'Cancel Selection' : 'Select Multiple'}
          </button>

          <button
            onClick={() => {
              setShowTimeDefaultedOnly(!showTimeDefaultedOnly);
              setCurrentPage(1);
            }}
            className={`min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
              showTimeDefaultedOnly
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                : tc.selectModeBtn(false)
            }`}
            title="Show only photos where OCR could read the date but not the time"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {showTimeDefaultedOnly ? 'Showing: Time Missing' : 'Time Missing'}
          </button>

          {isSelectMode && (
            <>
              <button
                onClick={handleSelectAll}
                className={`min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${tc.selectAllBtn}`}
              >
                {selectedIds.length === paginatedPhotos.length ? 'Deselect All' : 'Select All Page'}
              </button>

              <span className="text-xs font-bold opacity-80">
                {selectedIds.length} selected
              </span>
            </>
          )}
        </div>

        {isSelectMode && selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAssignLocationModalOpen(true)}
              className="min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <MapPin className="w-3.5 h-3.5" /> Assign Spot
            </button>

            <button
              onClick={() => { setTargetAssignId(''); setAssignTargetModalOpen(true); }}
              disabled={targets.length === 0}
              className="min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Crosshair className="w-3.5 h-3.5" /> Tag Target
            </button>

            <button
              onClick={handleBulkReOcr}
              disabled={bulkReOcrInProgress}
              className="min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <ScanLine className="w-3.5 h-3.5" />
              {bulkReOcrInProgress ? 'Re-OCR running…' : `Re-run OCR (${selectedIds.length})`}
            </button>

            <button
              onClick={handleDeleteSelected}
              className="min-h-11 px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Photos Grid */}
      {paginatedPhotos.length === 0 ? (
        totalPhotosCount > 0 ? (
          /* Photos exist but the active filters hide them all */
          <TeachingEmptyState
            theme={theme}
            isDark={isDark}
            icon={<SlidersHorizontal className="w-6 h-6" />}
            title="No Photos Match Your Filters"
            description="You have photos imported, but the current filter combination (or the 'Time Missing' toggle) doesn't match any of them."
            steps={[
              { title: 'Check the Time Missing toggle', description: "If it's on, only photos with unreadable times are shown — turn it off to see everything." },
              { title: 'Loosen the date range', description: 'Widen the start/end dates so the window includes your captures.' },
              { title: 'Clear all filters', description: 'One tap wipes every filter so you can see the full library again.' },
            ]}
            secondaryLabel="Clear All Filters"
            onSecondary={onClearFilters}
            compact
          />
        ) : (
          /* No photos imported yet at all */
          <TeachingEmptyState
            theme={theme}
            isDark={isDark}
            icon={<Camera className="w-6 h-6" />}
            title="Import Your First Trail Cam Photos"
            description="Turn raw camera captures into hunting intelligence — dates and times are read automatically from each photo's timestamp bar, no EXIF needed."
            steps={[
              { title: 'Select your photos', description: 'Use the import panel above — drag & drop or tap to pick hundreds of images at once.' },
              { title: 'We read the timestamps', description: 'OCR extracts the date & time burned into the info bar so every photo is sorted correctly.' },
              { title: 'Import straight to a Target', description: 'Choose a Target in the Targets row above, then press “Add photos to Target” to import and tag those photos in one step.' },
              { title: 'Match weather & analyze', description: 'Assign a camera spot and history weather is matched automatically for movement analytics.' },
            ]}
            ctaLabel="Import Photos"
            onCta={onGoToImport}
            compact
          />
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
          {paginatedPhotos.map((photo) => {
            const isSelected = selectedIds.includes(photo.id);
            const thumbUrl = thumbnails[photo.id];
            const ocrSucceeded = !!photo.dateTime;
            const timeWasDefaulted = photo.timeDefaulted === true;
            const dateStr = photo.dateTime ? new Date(photo.dateTime).toLocaleDateString() : 'No Date';
            const timeStr = photo.dateTime ? new Date(photo.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'OCR failed';
            const timeWarning = timeWasDefaulted ? 'Time not read — defaults to 12:00 PM' : '';

            return (
              <div
                key={photo.id}
                onClick={() => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }
                  if (isSelectMode) {
                    setSelectedIds((prev) =>
                      prev.includes(photo.id) ? prev.filter((i) => i !== photo.id) : [...prev, photo.id]
                    );
                  } else {
                    onSelectPhoto(photo);
                  }
                }}
                onTouchStart={() => {
                  longPressTriggeredRef.current = false;
                  longPressTimerRef.current = setTimeout(() => {
                    longPressTriggeredRef.current = true;
                    if (!isSelectMode) {
                      setIsSelectMode(true);
                      setSelectedIds([photo.id]);
                    } else {
                      setSelectedIds((prev) => prev.includes(photo.id) ? prev : [...prev, photo.id]);
                    }
                    if (navigator.vibrate) navigator.vibrate(15);
                  }, 500);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onTouchMove={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onMouseDown={() => {
                  longPressTriggeredRef.current = false;
                  longPressTimerRef.current = setTimeout(() => {
                    longPressTriggeredRef.current = true;
                    if (!isSelectMode) {
                      setIsSelectMode(true);
                      setSelectedIds([photo.id]);
                    } else {
                      setSelectedIds((prev) => prev.includes(photo.id) ? prev : [...prev, photo.id]);
                    }
                  }, 600);
                }}
                onMouseUp={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
                className={`group relative rounded-2xl overflow-visible border transition-all duration-200 cursor-pointer shadow-lg aspect-square flex flex-col justify-between select-none ${tc.photoCard(isSelected)}`}
                style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
              >
                {/* Keep the photo art clipped to the card while allowing controls
                    such as the target menu to escape the card bounds. */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                  {/* Image Background */}
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={photo.fileName}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className={`absolute inset-0 ${tc.loadingBg} animate-pulse flex items-center justify-center text-xs text-slate-500`}>
                      Loading...
                    </div>
                  )}

                  {/* Gradient Overlays */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
                </div>

                {/* Top Card Bar */}
                {/* NOTE: intentionally no z-index on this bar. A z-index here
                    would create a stacking context that traps the target
                    dropdown's z-50, letting the bottom info bar (also z-10,
                    later in the DOM) paint over it. Leaving the bar z-auto
                    lets the open dropdown's z-50 compete at the grid level,
                    above every thumbnail's overlay text. */}
                <div className="relative p-2 flex items-start justify-between">
                  <div className="flex items-center gap-1">
                    {isSelectMode ? (
                      <button
                        onClick={(e) => handleToggleSelect(photo.id, e)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-emerald-500 text-slate-950 shadow-md'
                            : 'bg-black/50 text-white/80 hover:bg-black/80'
                        }`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(photo);
                          }}
                          className={`p-1.5 rounded-lg flex items-center justify-center transition-all backdrop-blur-md touch-manipulation ${
                            photo.isFavorite
                              ? 'bg-amber-500 text-slate-950 shadow-md'
                              : 'bg-black/40 text-white/70 hover:text-amber-400 hover:bg-black/60 active:bg-amber-500/30'
                          }`}
                          style={{ minWidth: '36px', minHeight: '36px' }}
                        >
                          <Star className={`w-4 h-4 ${photo.isFavorite ? 'fill-slate-950' : ''}`} />
                        </button>
                        {targets.length > 0 && (
                          <div className={`relative ${activeTagPhotoId === photo.id ? 'z-50' : ''}`}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTagPhotoId(activeTagPhotoId === photo.id ? null : photo.id);
                              }}
                              className={`p-1.5 rounded-lg flex items-center justify-center transition-all backdrop-blur-md touch-manipulation ${
                                (photo.tags || []).length > 0
                                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                                  : 'bg-black/40 text-white/70 hover:text-emerald-400 hover:bg-black/60 active:bg-emerald-500/30'
                              }`}
                              style={{ minWidth: '36px', minHeight: '36px' }}
                            >
                              <Crosshair className="w-4 h-4" />
                            </button>
                            {activeTagPhotoId === photo.id && (
                              <div
                                className="absolute left-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl p-1 shadow-2xl z-50 min-w-[140px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {targets.map((t) => {
                                  const hasTag = (photo.tags || []).includes(t.id);
                                  return (
                                    <button
                                      key={t.id}
                                      onClick={() => {
                                        onToggleTag(photo, t.id);
                                      }}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all touch-manipulation ${
                                        hasTag ? 'text-white' : 'text-slate-300 hover:text-white'
                                      }`}
                                      style={{ backgroundColor: hasTag ? t.color : 'transparent' }}
                                    >
                                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                      {t.name}
                                      {hasTag && <Check className="w-3.5 h-3.5 ml-auto opacity-70" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {photo.notes && (
                    <span className="p-1 rounded-lg bg-black/50 text-emerald-400 backdrop-blur-md" title="Has notes">
                      <FileText className="w-3 h-3" />
                    </span>
                  )}
                </div>

                {/* Bottom Card Info */}
                <div className="relative p-2 text-white text-xs space-y-0.5 z-10 leading-tight">
                  {(photo.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {photo.tags!.map((tId) => {
                        const t = targets.find((x) => x.id === tId);
                        if (!t) return null;
                        return (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-bold shadow-sm"
                            style={{ backgroundColor: t.color, color: '#fff' }}
                          >
                            <Crosshair className="w-2 h-2" />
                            {t.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!ocrSucceeded ? (
                    <div className="space-y-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDateModal(photo.id);
                        }}
                        className="font-extrabold text-amber-300 drop-shadow underline decoration-dotted underline-offset-2 hover:text-amber-200 text-left w-full truncate text-[11px]"
                        title="OCR could not read the timestamp bar. Click to set the date manually."
                      >
                        {NO_DATE_BADGE}
                      </button>
                      {photo.rawOcrText && (
                        <div
                          className="text-[10px] text-slate-400/80 truncate leading-tight"
                          title={`Raw OCR output: ${photo.rawOcrText}`}
                        >
                          OCR: {photo.rawOcrText.slice(0, 60)}
                        </div>
                      )}
                    </div>
                  ) : timeWasDefaulted ? (
                    <div className="space-y-0.5">
                      <div
                        className="font-extrabold truncate drop-shadow flex items-center gap-1 text-[11px]"
                        title={timeWarning}
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-300 flex-shrink-0" />
                        <span className="text-sky-300">{dateStr}</span>
                        <span className="text-amber-300 text-xs font-bold">12:00 PM</span>
                      </div>
                      <div
                        className="text-[10px] text-amber-400/70 truncate leading-tight"
                        title={timeWarning}
                      >
                        Time not recognized
                      </div>
                    </div>
                  ) : (
                    <div
                      className="font-extrabold truncate drop-shadow text-sky-300 text-[11px]"
                      title={`OCR-extracted: ${new Date(photo.dateTime!).toISOString()}`}
                    >
                      {dateStr} {timeStr}
                    </div>
                  )}
                  {/* Camera spot + weather on one compact row. The spot name
                      truncates when long; temp/wind always stay visible. The
                      time is NOT repeated here — the timestamp line above
                      already carries the capture hour. */}
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    {photo.cameraLocationName && (
                      <span className="min-w-0 flex items-center gap-0.5 text-[11px] text-sky-300 font-bold truncate">
                        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{photo.cameraLocationName}</span>
                      </span>
                    )}
                    {photo.weather && photo.dateTime && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-300/90 shrink-0">
                        <span>{units === 'metric' ? Math.round((photo.weather.temperature - 32) * 5 / 9) : photo.weather.temperature}°{units === 'metric' ? 'C' : 'F'}</span>
                        <span>·</span>
                        <span>{photo.weather.windDirection} {units === 'metric' ? photo.weather.windSpeedKmh : photo.weather.windSpeedMph}{units === 'metric' ? 'km/h' : 'mph'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl ${tc.paginationBg} text-xs font-bold`}>
          <button
            disabled={currentPage === 1}
            onClick={() => goToPage(Math.max(1, currentPage - 1))}
            className={`shrink-0 px-3 py-1.5 rounded-xl border disabled:opacity-40 cursor-pointer flex items-center gap-1 ${tc.paginationButton}`}
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          <span className="min-w-[140px] flex-1 text-center">
            Page {currentPage} of {totalPages} ({displayPhotos.length} photos)
          </span>

          <button
            disabled={currentPage === totalPages}
            onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
            className={`shrink-0 px-3 py-1.5 rounded-xl border disabled:opacity-40 cursor-pointer flex items-center gap-1 ${tc.paginationButton}`}
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Assign Target Modal */}
      {assignTargetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${tc.modalBg} rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl`}>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-emerald-400" /> Tag With Target
            </h3>
            <p className="text-xs opacity-70">
              Tag {selectedIds.length} selected photo(s) with a target to track activity patterns for specific deer.
            </p>

            <AppSelect
              value={targetAssignId}
              onChange={(e) => setTargetAssignId(e.target.value)}
              className={`w-full p-2 text-xs rounded-xl border ${tc.selectBg}`}
            >
              <option value="">Select Target...</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </AppSelect>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignTargetModalOpen(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl ${tc.cancelBtn}`}
              >
                Cancel
              </button>
              <button
                disabled={!targetAssignId}
                onClick={handleAssignSelectedTarget}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                Tag Photos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-place Date Setter Modal — opens when user taps an OCR Failed badge */}
      {dateModalPhotoId && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeDateModal}
        >
          <div
            className={`${tc.modalBg} rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" /> Set Capture Date
            </h3>

            {/* Thumbnail preview — lets the user confirm visually which photo
                they're setting the date on, instead of trusting the filename. */}
            <div
              className={`w-full aspect-video rounded-xl overflow-hidden border flex items-center justify-center ${
                isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-200 border-slate-300'
              }`}
            >
              {dateModalThumb ? (
                <img
                  src={dateModalThumb}
                  alt={photos.find((p) => p.id === dateModalPhotoId)?.fileName || ''}
                  className="w-full h-full object-contain bg-black/40"
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-xs opacity-60 animate-pulse">
                  <Camera className="w-6 h-6" />
                  Loading preview…
                </div>
              )}
            </div>

            <p className="text-xs opacity-70 leading-snug">
              OCR couldn't read the timestamp on{' '}
              <span className="font-bold">{photos.find((p) => p.id === dateModalPhotoId)?.fileName}</span>.
              Enter the date/time the burned-in bar shows.
            </p>
            <input
              type="datetime-local"
              value={editDateValue}
              onChange={(e) => setEditDateValue(e.target.value)}
              className={`w-full p-2 text-xs rounded-xl border ${tc.selectBg}`}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeDateModal}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl ${tc.cancelBtn}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDateFromGallery}
                disabled={savingDate}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 disabled:cursor-wait flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> {savingDate ? 'Saving…' : 'Save Date'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Location Modal */}
      {assignLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${tc.modalBg} rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl`}>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-400" /> Assign Camera Spot
            </h3>
            <p className="text-xs opacity-70">
              Assign {selectedIds.length} selected photo(s) to a saved camera location to fetch historical weather.
            </p>

<AppSelect
                value={targetLocationId}
                onChange={(e) => setTargetLocationId(e.target.value)}
                className={`w-full p-2 text-xs rounded-xl border max-h-40 overflow-y-auto ${tc.selectBg}`}
              >
              <option value="">Select a Camera Location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </AppSelect>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignLocationModalOpen(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl ${tc.cancelBtn}`}
              >
                Cancel
              </button>
              <button
                disabled={!targetLocationId}
                onClick={handleAssignSelectedLocation}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};