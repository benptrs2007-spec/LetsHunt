import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Wind, Thermometer, CloudRain, Gauge, Moon, Calendar, Clock, BarChart3, Crosshair } from 'lucide-react';
import { ThemeMode, ThemeVariantMode, TrailCameraPhoto, TrailCameraTarget, TrailCameraFilterState } from '../types';
import { AnalyticsData, computeAnalytics } from '../services/trailCameraService';

interface TrailCameraAnalyticsProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  analytics: AnalyticsData;
  photos?: TrailCameraPhoto[];
  targets?: TrailCameraTarget[];
  filter?: TrailCameraFilterState;
  onFilterChange?: (filter: TrailCameraFilterState) => void;
  units?: string;
  pressureUnit?: string;
}

const BAR_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

export const TrailCameraAnalytics: React.FC<TrailCameraAnalyticsProps> = ({
  theme,
  isDark = theme === 'dark',
  analytics: initialAnalytics,
  photos,
  targets = [],
  filter,
  onFilterChange,
  units = 'imperial',
  pressureUnit = 'inHg',
}) => {
  const targetId = filter?.targetId;

  const currentPhotos = useMemo(() => {
    if (!photos) return [];
    if (!targetId) return photos;
    return photos.filter((p) => (p.tags || []).includes(targetId));
  }, [photos, targetId]);

  const activeAnalytics = useMemo(() => {
    if (photos && photos.length > 0) {
      return computeAnalytics(currentPhotos, units, pressureUnit);
    }
    return initialAnalytics;
  }, [photos, currentPhotos, initialAnalytics, units, pressureUnit]);

  const selectedTarget = targets.find((t) => t.id === targetId);

  const cardStyle = `rounded-2xl border p-4 sm:p-5 backdrop-blur-xl shadow-xl space-y-3 ${
    isDark
      ? 'bg-slate-900/[var(--card-opacity)] border-slate-800 text-slate-100'
      : theme === 'hunting'
      ? 'bg-[#eae1cf] border-[#d4c4a8] text-[#2a1b0e]'
      : (theme === 'olive' || theme === 'hunting')
      ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
      : 'bg-white border-slate-200 text-slate-900'
  }`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950 text-white border border-slate-700 p-2 rounded-xl text-xs font-bold shadow-2xl">
          <div>{label || payload[0].name}</div>
          <div className="text-emerald-400">{payload[0].value} photos</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Target Filtering Bar */}
      {targets.length > 0 && (
        <div className={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <h3 className="font-extrabold text-xs uppercase tracking-wider">Filter Analytics by Target</h3>
            </div>

            {targetId && (
              <button
                onClick={() => onFilterChange?.({ ...filter, targetId: undefined })}
                className="px-2.5 py-1 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                Show All Targets
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => onFilterChange?.({ ...filter, targetId: undefined })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                !targetId
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                  : isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              All Targets ({photos?.length || 0})
            </button>

            {targets.map((target) => {
              const count = photos?.filter((p) => (p.tags || []).includes(target.id)).length || 0;
              const isSelected = targetId === target.id;
              return (
                <button
                  key={target.id}
                  onClick={() => onFilterChange?.({ ...filter, targetId: isSelected ? undefined : target.id })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'text-white border-white ring-2 ring-emerald-500 shadow-lg font-black scale-105'
                      : isDark
                      ? 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-600'
                      : 'bg-slate-100/90 border-slate-300 text-slate-800 hover:bg-slate-200'
                  }`}
                  style={isSelected ? { backgroundColor: target.color } : {}}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: target.color }}
                  />
                  {target.name} ({count})
                </button>
              );
            })}
          </div>

          {selectedTarget && (
            <div className="text-xs pt-1 text-emerald-400 font-extrabold flex items-center gap-2">
              <span>Showing target-specific pattern analytics for: <strong>{selectedTarget.name}</strong></span>
              <span className="opacity-70 font-normal">({activeAnalytics.totalPhotos} photo{activeAnalytics.totalPhotos === 1 ? '' : 's'} tagged)</span>
            </div>
          )}
        </div>
      )}

      {activeAnalytics.totalPhotos === 0 ? (
        <div className="text-center py-16 space-y-3 opacity-60">
          <BarChart3 className="w-12 h-12 mx-auto text-emerald-500" />
          <h3 className="text-base font-extrabold">
            {selectedTarget ? `No Analytics Found for Target "${selectedTarget.name}"` : 'No Analytics Available Yet'}
          </h3>
          <p className="text-xs max-w-sm mx-auto">
            {selectedTarget
              ? `No photos are currently tagged as "${selectedTarget.name}". Tag photos in the Gallery to analyze this target's specific movement windows and weather preferences.`
              : 'Import trail camera photos to automatically unlock historical weather analytics, activity charts, and hunting patterns.'}
          </p>
        </div>
      ) : (
        <>
          {/* Top Overview Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={cardStyle}>
              <div className="text-xs font-bold opacity-70">
                {selectedTarget ? `${selectedTarget.name} Photos` : 'Total Photos'}
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-500">{activeAnalytics.totalPhotos}</div>
            </div>
            <div className={cardStyle}>
              <div className="text-xs font-bold opacity-70">Weather Matched</div>
              <div className="text-xl sm:text-2xl font-black text-sky-400">{activeAnalytics.withWeather}</div>
            </div>
            <div className={cardStyle}>
              <div className="text-xs font-bold opacity-70">Top Active Hour</div>
              <div className="text-base sm:text-lg font-black text-amber-400 truncate">
                {activeAnalytics.byHourOfDay.slice().sort((a, b) => b.count - a.count)[0]?.name || 'N/A'}
              </div>
            </div>
            <div className={cardStyle}>
              <div className="text-xs font-bold opacity-70">Top Active Month</div>
              <div className="text-base sm:text-lg font-black text-purple-400 truncate">
                {activeAnalytics.byMonth.slice().sort((a, b) => b.count - a.count)[0]?.name || 'N/A'}
              </div>
            </div>
          </div>

          {/* Grid of Visual Summary Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Hour of Day Activity */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Activity by Hour of Day</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byHourOfDay} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={9} interval={3} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Wind Direction */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-sky-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Wind Direction</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byWindDirection} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={9} interval={1} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Wind Speed */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-cyan-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Wind Speed</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byWindSpeed} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={9} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Temperature Range */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-rose-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Temperature Range</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byTemperatureRange} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={9} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Barometric Pressure Range */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Barometric Pressure</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byPressureRange} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={8} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 5. Moon Phase */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-purple-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Moon Phase</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byMoonPhase} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={8} interval={0} angle={-20} textAnchor="end" height={35} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 6. Activity by Month */}
            <div className={cardStyle}>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Month</h3>
              </div>
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byMonth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={9} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 7. Weather Condition Breakdown */}
            <div className={`${cardStyle} md:col-span-2`}>
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-blue-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Photos by Weather Condition</h3>
              </div>
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeAnalytics.byWeatherCondition.slice(0, 8)} margin={{ top: 5, right: 10, left: -10, bottom: 15 }}>
                    <XAxis dataKey="name" stroke="rgb(var(--ui-muted-rgb))" fontSize={9} angle={-15} textAnchor="end" interval={0} />
                    <YAxis stroke="rgb(var(--ui-muted-rgb))" fontSize={10} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {activeAnalytics.byWeatherCondition.slice(0, 8).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

