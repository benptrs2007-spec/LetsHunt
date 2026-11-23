import React, { useState, useEffect, useMemo, useRef } from 'react';
import { safeGetJSON, safeSetJSON } from '../utils/storage';
import { AppSelect } from './AppSelect';
import {
  Trophy,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Clock,
  MapPin,
  Camera,
  Search,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  X,
  Upload,
  Sparkles,
  Download,
  AlertCircle,
  FileSpreadsheet,
  Check,
  ChevronDown,
  Info,
  Layers,
  Award,
  Thermometer,
  Wind,
  RefreshCw,
  PawPrint,
  Sun,
  Moon,
  Compass
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { ThemeMode, ThemeVariantMode, UnitSystem, DeerKillLog, DeerGender, SavedPin, Location } from '../types';
import { fetchHistoricalWeather } from '../services/weatherService';
import { TeachingEmptyState } from './TeachingEmptyState';

interface LogsAndStatsViewProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  units: UnitSystem;
  showToast: (msg: string) => void;
  onNavigateToMap?: () => void;
  hasCustomBackground?: boolean;
}

const GENDER_COLORS: Record<string, string> = {
  Buck: '#10b981', // Emerald
  Doe: '#3b82f6', // Blue
  'Button Buck': '#f59e0b', // Amber
  'Shed Buck': '#a855f7', // Purple
  Other: '#64748b', // Slate
};

const AGE_OPTIONS = [
  '0.5 yrs',
  '1.5 yrs',
  '2.5 yrs',
  '3.5 yrs',
  '4.5 yrs',
  '5.5 yrs',
  '6.5 yrs',
  '7.5 yrs',
  '8.5 yrs',
  '9.5 yrs',
  '10.5 yrs',
  '11.5 yrs',
  '12.5 yrs',
  '13.5 yrs',
  '14.5 yrs',
  '15.5 yrs',
];

const WEIGHT_OPTIONS_LBS = Array.from({ length: 61 }, (_, i) => 50 + i * 5); // 50 to 350 lbs
const WEIGHT_OPTIONS_KG = Array.from({ length: 61 }, (_, i) => 20 + i * 2); // 20 to 140 kg

export const LogsAndStatsView: React.FC<LogsAndStatsViewProps> = ({
  theme,
  isDark = theme === 'dark',
  units,
  showToast,
  onNavigateToMap,
  hasCustomBackground = false,
}) => {
const cardBg = hasCustomBackground
  ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md'
  : 'bg-slate-900/90';
const cardBgLight = hasCustomBackground
  ? 'bg-white/[var(--card-opacity)] backdrop-blur-md'
  : 'bg-white/95';

  // State: Saved logs (filters out any old demo- logs)
  const [logs, setLogs] = useState<DeerKillLog[]>(() => {
    const parsed = safeGetJSON<DeerKillLog[]>('letshunt_deer_kill_logs', []);
    return Array.isArray(parsed) ? parsed.filter((l) => !l.id.startsWith('demo-')) : [];
  });

  // State: Map Pins from map page
  const [mapPins, setMapPins] = useState<SavedPin[]>([]);

  useEffect(() => {
    const parsed = safeGetJSON<SavedPin[]>('letshunt_saved_pins', []);
    setMapPins(parsed);
  }, []);

  // Save logs to localStorage
  const saveLogsToStorage = (updatedLogs: DeerKillLog[]) => {
    setLogs(updatedLogs);
    safeSetJSON('letshunt_deer_kill_logs', updatedLogs);
  };

  // Form Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  // Form Fields
  const [formDateTime, setFormDateTime] = useState('');
  const [formStandId, setFormStandId] = useState('');
  const [formStandName, setFormStandName] = useState('');
  const [formGender, setFormGender] = useState<DeerGender>('Buck');
  const [formAge, setFormAge] = useState('');
  const [formPoints, setFormPoints] = useState<string>('0');
  const [formWeight, setFormWeight] = useState<string>('');
  const [formWeapon, setFormWeapon] = useState('Compound Bow');
  const [formTemp, setFormTemp] = useState<string>('');
  const [formWindSpeed, setFormWindSpeed] = useState<string>('');
  const [formWindDir, setFormWindDir] = useState<string>('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState<string>('');
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-Fill Weather using Open-Meteo Historical Weather API
  const handleAutoFillWeather = async () => {
    if (!formDateTime) {
      showToast('Please select a harvest date and time first.');
      return;
    }

    setIsFetchingWeather(true);

    // Determine latitude & longitude (from selected stand pin or stored location)
    let lat = 43.0731;
    let lon = -89.4012;

    if (formStandId) {
      const selectedPin = mapPins.find((p) => p.id === formStandId);
      if (selectedPin && selectedPin.lat && selectedPin.lng) {
        lat = selectedPin.lat;
        lon = selectedPin.lng;
      }
    }

    if (lat === 43.0731 && lon === -89.4012) {
      // safeGetJSON validates type and never throws — corrupt storage degrades to default.
      const parsedLoc =
        safeGetJSON<Location | null>('letshunt_location', null) ||
        safeGetJSON<Location | null>('letshunt_default_location', null);
      if (parsedLoc && parsedLoc.latitude && parsedLoc.longitude) {
        lat = parsedLoc.latitude;
        lon = parsedLoc.longitude;
      }
    }

    const result = await fetchHistoricalWeather(lat, lon, formDateTime, units);

    setIsFetchingWeather(false);

    if (result) {
      setFormTemp(String(result.temperature));
      setFormWindSpeed(String(result.windSpeed));
      setFormWindDir(result.windDirection);
      showToast(`Auto-filled weather! ${result.temperature}°${units === 'metric' ? 'C' : 'F'}, ${result.windSpeed} ${units === 'metric' ? 'km/h' : 'mph'} ${result.windDirection}`);
    } else {
      showToast('Could not fetch historical weather for this date/time. Please enter manually.');
    }
  };

  // Filtering & View state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenderFilter, setSelectedGenderFilter] = useState<string>('All');
  const [selectedStandFilter, setSelectedStandFilter] = useState<string>('All');
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('All');
  // Open on the practical logbook; the full analytics dashboard remains one tap away.
  const [activeTab, setActiveTab] = useState<'analytics' | 'logs'>('logs');
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Auto populate default datetime in form
  const resetForm = () => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    setFormDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
    setFormStandId('');
    setFormStandName(mapPins.length > 0 ? mapPins[0].name : '');
    setFormGender('Buck');
    setFormAge('');
    setFormPoints('0');
    setFormWeight('');
    setFormWeapon('Compound Bow');
    setFormTemp('');
    setFormWindSpeed('');
    setFormWindDir('');
    setFormNotes('');
    setFormPhotoUrl('');
    setEditingLogId(null);
  };

  const handleOpenNewLogModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleEditLog = (log: DeerKillLog) => {
    setEditingLogId(log.id);
    setFormDateTime(log.dateTime);
    setFormStandId(log.standId || '');
    setFormStandName(log.standName);
    setFormGender(log.gender);
    setFormAge(log.age || '');
    setFormPoints(log.points !== undefined ? String(log.points) : '');
    setFormWeight(log.weightLbs !== undefined ? String(log.weightLbs) : '');
    setFormWeapon(log.weapon || 'Compound Bow');
    setFormTemp(log.temperature !== undefined ? String(log.temperature) : '');
    setFormWindSpeed(log.windSpeed !== undefined ? String(log.windSpeed) : '');
    setFormWindDir(log.windDirection || '');
    setFormNotes(log.notes || '');
    setFormPhotoUrl(log.photoUrl || '');
    setIsFormOpen(true);
  };

  // Compress & convert photo file to Base64
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('Photo file size should be less than 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress image using canvas
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
          setFormPhotoUrl(compressedBase64);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLog = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formDateTime) {
      alert('Please specify the date and time of the harvest.');
      return;
    }

    const finalStandName = formStandName.trim() || 'Unspecified Hunting Spot';

    if (editingLogId) {
      // Update existing
      const updated = logs.map((l) => {
        if (l.id === editingLogId) {
          return {
            ...l,
            dateTime: formDateTime,
            standId: formStandId || undefined,
            standName: finalStandName,
            gender: formGender,
            age: formAge || undefined,
            points: formPoints ? parseInt(formPoints, 10) : undefined,
            weightLbs: formWeight ? parseFloat(formWeight) : undefined,
            weapon: formWeapon,
            temperature: formTemp !== '' ? parseFloat(formTemp) : undefined,
            windSpeed: formWindSpeed !== '' ? parseFloat(formWindSpeed) : undefined,
            windDirection: formWindDir || undefined,
            photoUrl: formPhotoUrl || undefined,
            notes: formNotes.trim(),
          };
        }
        return l;
      });
      saveLogsToStorage(updated);
      showToast('Harvest log updated successfully!');
    } else {
      // Add new
      const newLog: DeerKillLog = {
        id: `log-${Date.now()}`,
        dateTime: formDateTime,
        standId: formStandId || undefined,
        standName: finalStandName,
        gender: formGender,
        age: formAge || undefined,
        points: formPoints ? parseInt(formPoints, 10) : undefined,
        weightLbs: formWeight ? parseFloat(formWeight) : undefined,
        weapon: formWeapon,
        temperature: formTemp !== '' ? parseFloat(formTemp) : undefined,
        windSpeed: formWindSpeed !== '' ? parseFloat(formWindSpeed) : undefined,
        windDirection: formWindDir || undefined,
        photoUrl: formPhotoUrl || undefined,
        notes: formNotes.trim(),
        createdAt: Date.now(),
      };
      const updated = [newLog, ...logs];
      saveLogsToStorage(updated);
      showToast('New harvest log saved!');
    }

    setIsFormOpen(false);
  };

  const handleDeleteLog = (logOrId: string | DeerKillLog) => {
    const logId = typeof logOrId === 'string' ? logOrId : logOrId.id;
    if (confirm('Are you sure you want to delete this harvest log?')) {
      const updated = logs.filter((l) => l.id !== logId);
      saveLogsToStorage(updated);
      showToast('Harvest log deleted.');
    }
  };

  const handleClearAllLogs = () => {
    if (confirm('Clear all harvest logs? This action cannot be undone.')) {
      saveLogsToStorage([]);
      showToast('All logs cleared.');
    }
  };

  // Dynamic filter lists
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    logs.forEach((l) => {
      const y = new Date(l.dateTime).getFullYear();
      if (!isNaN(y)) yearsSet.add(String(y));
    });
    return Array.from(yearsSet).sort().reverse();
  }, [logs]);

  const availableStands = useMemo(() => {
    const standSet = new Set<string>();
    logs.forEach((l) => {
      if (l.standName) standSet.add(l.standName);
    });
    return Array.from(standSet).sort();
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (selectedGenderFilter !== 'All' && l.gender !== selectedGenderFilter) return false;
      if (selectedStandFilter !== 'All' && l.standName !== selectedStandFilter) return false;
      if (selectedYearFilter !== 'All') {
        const y = new Date(l.dateTime).getFullYear();
        if (String(y) !== selectedYearFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNotes = l.notes?.toLowerCase().includes(q);
        const matchStand = l.standName.toLowerCase().includes(q);
        const matchGender = l.gender.toLowerCase().includes(q);
        const matchWeapon = l.weapon?.toLowerCase().includes(q);
        if (!matchNotes && !matchStand && !matchGender && !matchWeapon) return false;
      }
      return true;
    });
  }, [logs, selectedGenderFilter, selectedStandFilter, selectedYearFilter, searchQuery]);

  // ==========================================
  // CHART DATA GENERATORS
  // ==========================================

  // 1. Time of Day Shot Distribution (Hourly 0-23)
  const timeDistributionData = useMemo(() => {
    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }

    logs.forEach((l) => {
      const d = new Date(l.dateTime);
      if (!isNaN(d.getTime())) {
        const hr = d.getHours();
        hourCounts[hr] = (hourCounts[hr] || 0) + 1;
      }
    });

    // Format for Chart (Focus on hunting hours 5:00 AM - 9:00 PM for readability, or full day)
    return Object.keys(hourCounts).map((hrStr) => {
      const hr = parseInt(hrStr, 10);
      const ampm = hr >= 12 ? 'PM' : 'AM';
      const formattedHr = hr % 12 === 0 ? 12 : hr % 12;
      const label = `${formattedHr}${ampm}`;
      return {
        hour: hr,
        label,
        count: hourCounts[hr],
        isMorningPrime: hr >= 6 && hr <= 9,
        isEveningPrime: hr >= 16 && hr <= 19,
      };
    });
  }, [logs]);

  // Identify peak hunting hour
  const peakTimeInfo = useMemo(() => {
    let maxHr = 7;
    let maxVal = 0;
    timeDistributionData.forEach((item) => {
      if (item.count > maxVal) {
        maxVal = item.count;
        maxHr = item.hour;
      }
    });
    const ampm = maxHr >= 12 ? 'PM' : 'AM';
    const formattedHr = maxHr % 12 === 0 ? 12 : maxHr % 12;
    return {
      timeStr: `${formattedHr}:00 ${ampm}`,
      count: maxVal,
    };
  }, [timeDistributionData]);

  // 2. Dates / Seasonal Timeline Distribution (By Month or Rut Phase)
  const dateDistributionData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthCounts: Record<string, { total: number; bucks: number; does: number }> = {};

    monthNames.forEach((m) => {
      monthCounts[m] = { total: 0, bucks: 0, does: 0 };
    });

    logs.forEach((l) => {
      const d = new Date(l.dateTime);
      if (!isNaN(d.getTime())) {
        const mName = monthNames[d.getMonth()];
        monthCounts[mName].total += 1;
        if (l.gender === 'Buck') {
          monthCounts[mName].bucks += 1;
        } else {
          monthCounts[mName].does += 1;
        }
      }
    });

    // Filter months that typically have deer hunting seasons (Sep, Oct, Nov, Dec, Jan)
    return ['Sep', 'Oct', 'Nov', 'Dec', 'Jan'].map((m) => ({
      month: m,
      Harvests: monthCounts[m].total,
      Bucks: monthCounts[m].bucks,
      Does: monthCounts[m].does,
    }));
  }, [logs]);

  // 3. Gender Pie / Donut Chart Data
  const genderChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      const g = l.gender || 'Buck';
      counts[g] = (counts[g] || 0) + 1;
    });

    return Object.keys(counts).map((gender) => ({
      name: gender,
      value: counts[gender],
      color: GENDER_COLORS[gender] || '#10b981',
      percentage: logs.length > 0 ? ((counts[gender] / logs.length) * 100).toFixed(1) : '0',
    }));
  }, [logs]);

  // 4. Stand / Hunting Spot Ranking Chart Data
  const standRankingData = useMemo(() => {
    const standMap: Record<string, { count: number; bucks: number; pointsMax: number }> = {};

    logs.forEach((l) => {
      const name = l.standName || 'Unspecified Spot';
      if (!standMap[name]) {
        standMap[name] = { count: 0, bucks: 0, pointsMax: 0 };
      }
      standMap[name].count += 1;
      if (l.gender === 'Buck') standMap[name].bucks += 1;
      if (l.points && l.points > standMap[name].pointsMax) {
        standMap[name].pointsMax = l.points;
      }
    });

    return Object.keys(standMap)
      .map((name) => ({
        stand: name,
        kills: standMap[name].count,
        bucks: standMap[name].bucks,
        topPoints: standMap[name].pointsMax,
      }))
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 8); // Top 8 stands
  }, [logs]);

  // 5. Temperature Distribution Chart Data
  const temperatureChartData = useMemo(() => {
    const isMetric = units === 'metric';
    const brackets = isMetric
      ? [
          { key: 'freezing', label: '< -1°C', min: -Infinity, max: -1, count: 0 },
          { key: 'cold', label: '-1 to 6°C', min: -1, max: 6, count: 0 },
          { key: 'cool', label: '7 to 15°C', min: 7, max: 15, count: 0 },
          { key: 'mild', label: '16 to 23°C', min: 16, max: 23, count: 0 },
          { key: 'warm', label: '24°C+', min: 24, max: Infinity, count: 0 },
        ]
      : [
          { key: 'freezing', label: '< 30°F', min: -Infinity, max: 29.9, count: 0 },
          { key: 'cold', label: '30 - 44°F', min: 30, max: 44.9, count: 0 },
          { key: 'cool', label: '45 - 59°F', min: 45, max: 59.9, count: 0 },
          { key: 'mild', label: '60 - 74°F', min: 60, max: 74.9, count: 0 },
          { key: 'warm', label: '75°F+', min: 75, max: Infinity, count: 0 },
        ];

    let recordedCount = 0;
    logs.forEach((l) => {
      if (l.temperature !== undefined) {
        recordedCount += 1;
        const temp = l.temperature;
        for (const b of brackets) {
          if (temp >= b.min && temp <= b.max) {
            b.count += 1;
            break;
          }
        }
      }
    });

    return {
      brackets,
      recordedCount,
    };
  }, [logs, units]);

  // 6. Specific Calendar Date Chart Data (exact date frequency e.g. Oct 24, Nov 8)
  const specificDateChartData = useMemo(() => {
    const dateMap: Record<string, { monthDay: string; sortKey: number; count: number; bucks: number; does: number; datesList: string[] }> = {};

    logs.forEach((l) => {
      const d = new Date(l.dateTime);
      if (!isNaN(d.getTime())) {
        const month = d.getMonth(); // 0-11
        const day = d.getDate(); // 1-31
        const monthName = d.toLocaleDateString(undefined, { month: 'short' });
        const monthDayLabel = `${monthName} ${day}`;
        const sortKey = (month + 1) * 100 + day; // e.g. Oct 24 = 1024, Nov 8 = 1108

        if (!dateMap[monthDayLabel]) {
          dateMap[monthDayLabel] = {
            monthDay: monthDayLabel,
            sortKey,
            count: 0,
            bucks: 0,
            does: 0,
            datesList: [],
          };
        }

        dateMap[monthDayLabel].count += 1;
        if (l.gender === 'Buck') dateMap[monthDayLabel].bucks += 1;
        else dateMap[monthDayLabel].does += 1;
        
        const fullDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        if (!dateMap[monthDayLabel].datesList.includes(fullDate)) {
          dateMap[monthDayLabel].datesList.push(fullDate);
        }
      }
    });

    return Object.values(dateMap)
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [logs]);

  // 7. Wind Speed & Wind Direction Chart Data
  const windAnalyticsData = useMemo(() => {
    const speedBrackets = [
      { label: 'Calm (0-4)', min: 0, max: 4, count: 0 },
      { label: 'Light (5-9)', min: 5, max: 9, count: 0 },
      { label: 'Moderate (10-14)', min: 10, max: 14, count: 0 },
      { label: 'Breezy (15+)', min: 15, max: Infinity, count: 0 },
    ];

    const dirCounts: Record<string, number> = {
      N: 0,
      NE: 0,
      E: 0,
      SE: 0,
      S: 0,
      SW: 0,
      W: 0,
      NW: 0,
      Calm: 0,
    };

    let speedRecordedCount = 0;
    let dirRecordedCount = 0;

    logs.forEach((l) => {
      if (l.windSpeed !== undefined) {
        speedRecordedCount += 1;
        const spd = l.windSpeed;
        for (const b of speedBrackets) {
          if (spd >= b.min && spd <= b.max) {
            b.count += 1;
            break;
          }
        }
      }

      if (l.windDirection) {
        dirRecordedCount += 1;
        let d = l.windDirection.toUpperCase().trim();
        // Normalize cardinal directions
        if (d.includes('NNE') || d.includes('ENE')) d = 'NE';
        if (d.includes('ESE') || d.includes('SSE')) d = 'SE';
        if (d.includes('SSW') || d.includes('WSW')) d = 'SW';
        if (d.includes('WNW') || d.includes('NNW')) d = 'NW';
        if (d.includes('VAR') || d.includes('VARIABLE')) d = 'Calm';

        if (dirCounts[d] !== undefined) {
          dirCounts[d] += 1;
        } else if (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'CALM'].includes(d)) {
          dirCounts[d] = (dirCounts[d] || 0) + 1;
        } else {
          dirCounts['Calm'] += 1;
        }
      }
    });

    const dirData = Object.keys(dirCounts).map((k) => ({
      direction: k,
      count: dirCounts[k],
    }));

    return {
      speedBrackets,
      speedRecordedCount,
      dirData,
      dirRecordedCount,
    };
  }, [logs]);

  // Overview stats
  const totalHarvests = logs.length;
  const totalBucks = logs.filter((l) => l.gender === 'Buck').length;
  const totalDoes = logs.filter((l) => l.gender === 'Doe').length;
  const topStand = standRankingData.length > 0 ? standRankingData[0].stand : 'N/A';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Banner Header & Primary Action Controls */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border shadow-xl relative overflow-hidden transition-all ${
          isDark
            ? `${cardBg} border-slate-800 text-slate-100`
            : theme === 'hunting'
            ? 'bg-[#eae1cf]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8] text-[#2a1b0e]'
            : (theme === 'olive' || theme === 'hunting')
            ? 'bg-[#f7f5ed] border-[#d8d2c0] text-[#1e2e1b]'
            : `${cardBgLight} border-slate-200 text-slate-900`
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Harvest journal
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black mt-1.5 tracking-tight flex items-center gap-2">
              Harvest logs
            </h1>
            <p className={`text-xs mt-1 max-w-2xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Record each harvest once, then use your field data to spot better times, stands, and weather patterns.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleOpenNewLogModal}
              className="min-h-11 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add harvest</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Stat Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Total Harvests
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-500 mt-0.5">{totalHarvests}</div>
          </div>

          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Bucks / Does Ratio
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-500 mt-0.5">
              {totalBucks}B / {totalDoes}D
            </div>
          </div>

          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Best Harvest Hour
            </span>
            <div className="text-base sm:text-lg font-black text-emerald-500 mt-1">{peakTimeInfo.timeStr}</div>
          </div>

          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'}`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              #1 Stand Spot
            </span>
            <div className="text-xs sm:text-sm font-black text-emerald-500 mt-1 truncate">{topStand}</div>
          </div>
        </div>

        {/* Inner Sub-Navigation Tabs: Analytics vs All Logs List */}
        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-emerald-600 text-white shadow-md'
                : isDark
                ? 'bg-slate-950/[var(--card-opacity)] text-slate-400 hover:text-slate-200 border border-slate-800'
                : 'bg-slate-100/[var(--card-opacity)] text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`min-h-11 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-emerald-600 text-white shadow-md'
                : isDark
                ? 'bg-slate-950/[var(--card-opacity)] text-slate-400 hover:text-slate-200 border border-slate-800'
                : 'bg-slate-100/[var(--card-opacity)] text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Harvest logs ({logs.length})</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {logs.length === 0 ? (
        /* Empty State — teaches the value and the 3-step flow instead of a bare "no logs" line */
        <div className="max-w-xl mx-auto my-8">
          <TeachingEmptyState
            theme={theme}
            isDark={isDark}
            icon={<Trophy className="w-8 h-8" />}
            title="Log Your First Harvest"
            description="Every deer you log turns into a data point. Over a season, these logs reveal your best stands, peak times, and the weather that moved deer."
            steps={[
              { title: 'Add a harvest', description: 'Pick the date & time, gender, points, weight, and weapon — takes under a minute.' },
              { title: 'Auto-fill the weather', description: 'Tap the weather button and the exact temp, wind speed & direction at your harvest are fetched from history.' },
              { title: 'Unlock the analytics', description: 'Best harvest-hour graphs, buck/doe ratios, top stand rankings, and seasonal charts fill in automatically.' },
            ]}
            ctaLabel="Log First Harvest"
            onCta={handleOpenNewLogModal}
          />
        </div>
      ) : activeTab === 'analytics' ? (
        /* ================= GRAPH & ANALYTICS VIEW ================= */
        <div className="space-y-6">
          {/* Top Row: Graph 1 (Shot Time Distribution) & Graph 3 (Gender Pie Chart) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* GRAPH 1: Time of Day Shot Distribution */}
            <div
              className={`lg:col-span-2 p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-base font-black tracking-tight">
                      Shot Time Distribution (Hour of Harvest)
                    </h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    24h Movement
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Shows what hour of the day most deer were harvested, including the best morning (6–9 AM) and evening (4–7 PM) windows.
                </p>
              </div>

              <div className="h-64 sm:h-72 w-full mt-2 outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }}
                      interval={1}
                    />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-extrabold text-emerald-400">{data.label} (Hour {data.hour}:00)</p>
                              <p className="mt-1 font-bold">{data.count} Deer Shot</p>
                              {data.isMorningPrime && <span className="text-xs text-amber-300 inline-flex items-center gap-1"><Sun className="w-3 h-3" /> Morning Best Window</span>}
                              {data.isEveningPrime && <span className="text-xs text-purple-300 inline-flex items-center gap-1"><Moon className="w-3 h-3" /> Evening Best Window</span>}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {timeDistributionData.map((entry, index) => {
                        let barColor = isDark ? '#3b82f6' : '#2563eb'; // standard blue
                        if (entry.isMorningPrime) barColor = '#10b981'; // emerald green
                        if (entry.isEveningPrime) barColor = '#8b5cf6'; // purple
                        if (entry.count > 0 && entry.hour === parseInt(peakTimeInfo.timeStr, 10)) barColor = '#f59e0b'; // amber peak
                        return <Cell key={`cell-${index}`} fill={barColor} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Morning (6-9 AM)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Evening (4-7 PM)
                  </span>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Best Hour: {peakTimeInfo.timeStr} ({peakTimeInfo.count} kills)
                </span>
              </div>
            </div>

            {/* GRAPH 3: Gender Breakdown Pie Chart */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-base font-black tracking-tight">Bucks vs. Does Ratio</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    Gender
                  </span>
                </div>
                <p className={`text-xs mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Percentage distribution of antlered bucks vs antlerless does & button bucks harvested.
                </p>
              </div>

              <div className="h-56 sm:h-60 w-full relative flex items-center justify-center my-2 outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {genderChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-bold" style={{ color: data.color }}>
                                {data.name}
                              </p>
                              <p className="text-sm font-black mt-0.5">
                                {data.value} Deer ({data.percentage}%)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                {genderChartData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>{item.name}</span>
                    </div>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {item.value} ({item.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Row: Graph 2 (Seasonal Dates Distribution) & Graph 4 (Stand Ranking) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* GRAPH 2: Dates / Seasonal Distribution */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-base font-black tracking-tight">Seasonal Date Distribution</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    By Month
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Harvests by hunting month, from early season through the rut and late season.
                </p>
              </div>

              <div className="h-60 w-full outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dateDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="harvestGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                    <XAxis dataKey="month" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '3 3' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-extrabold text-emerald-400">{data.month} Season</p>
                              <p className="font-bold mt-1">{data.Harvests} Total Harvests</p>
                              <p className="text-xs text-slate-300 flex items-center gap-1.5 flex-wrap">
                                <PawPrint className="w-3.5 h-3.5 text-emerald-400" /> {data.Bucks} Bucks
                                <span className="opacity-40">|</span>
                                <PawPrint className="w-3.5 h-3.5 text-sky-300" /> {data.Does} Does
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Harvests"
                      stroke="#10b981"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#harvestGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Peak Rut: November usually holds highest buck activity</span>
                <span className="font-bold text-emerald-500">{logs.length} Total Logged Kills</span>
              </div>
            </div>

            {/* GRAPH 4: Stand / Hunting Spot Ranking */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-base font-black tracking-tight">Top Stand / Spot Rankings</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    Map Locations
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Ranks tree stands and hunting markers by the number of deer harvested at each location.
                </p>
              </div>

              <div className="h-60 w-full outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={standRankingData}
                    margin={{ top: 0, right: 20, left: 30, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                    <XAxis type="number" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      dataKey="stand"
                      type="category"
                      tick={{ fill: isDark ? '#cbd5e1' : '#334155', fontSize: 10, fontWeight: 700 }}
                      width={100}
                    />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-extrabold text-emerald-400">{data.stand}</p>
                              <p className="font-bold mt-1">{data.kills} Deer Harvested</p>
                              {data.bucks > 0 && <p className="text-emerald-300 flex items-center gap-1"><PawPrint className="w-3.5 h-3.5" /> {data.bucks} Bucks</p>}
                              {data.topPoints > 0 && (
                                <p className="text-amber-300 font-semibold">Max Points: {data.topPoints} Pts</p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="kills" fill="#10b981" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Map Markers Linked: {mapPins.length} Active Stands</span>
                {onNavigateToMap && (
                  <button
                    onClick={onNavigateToMap}
                    className="text-emerald-500 hover:underline font-bold flex items-center gap-1"
                  >
                    View Stand Map →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Middle Row: GRAPH 5 (Specific Calendar Harvest Dates) & GRAPH 6 (Temperature Distribution) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* GRAPH 5: Specific Calendar Harvest Dates */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-base font-black tracking-tight">Specific Harvest Dates</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    Day Calendar
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Shows exact calendar days when harvests occurred. Identifies recurring power days across your hunting seasons.
                </p>
              </div>

              <div className="h-64 w-full outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                {specificDateChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={specificDateChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                      <XAxis
                        dataKey="monthDay"
                        tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 700 }}
                        angle={-25}
                        textAnchor="end"
                      />
                      <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                        wrapperStyle={{ outline: 'none' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                                <p className="font-extrabold text-emerald-400 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {data.monthDay}</p>
                                <p className="font-bold mt-1 text-sm">{data.count} Deer Harvested</p>
                                <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <PawPrint className="w-3.5 h-3.5 text-emerald-400" /> {data.bucks} Bucks
                                  <span className="opacity-40">|</span>
                                  <PawPrint className="w-3.5 h-3.5 text-sky-300" /> {data.does} Does
                                </p>
                                {data.datesList && data.datesList.length > 0 && (
                                  <p className="text-xs text-slate-400 mt-1 border-t border-slate-800 pt-1">
                                    Logged on: {data.datesList.join(', ')}
                                  </p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]}>
                        {specificDateChartData.map((entry, index) => (
                          <Cell
                            key={`date-cell-${index}`}
                            fill={entry.count > 1 ? '#f59e0b' : '#10b981'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No date logs recorded yet.
                  </div>
                )}
              </div>

              <div className="text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Gold bars highlight dates with multiple harvests</span>
                <span className="font-bold text-emerald-500">{specificDateChartData.length} Unique Harvest Days</span>
              </div>
            </div>

            {/* GRAPH 6: Temperature Distribution Chart */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-5 h-5 text-sky-500" />
                    <h3 className="text-base font-black tracking-tight">Temperature Range Distribution</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-sky-500/10 text-sky-500 border border-sky-500/20">
                    Weather
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Shows harvest frequency across temperature brackets. Helps identify sweet-spot temperatures for deer activity.
                </p>
              </div>

              <div className="h-64 w-full outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={temperatureChartData.brackets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 700 }} />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-extrabold text-sky-400 flex items-center gap-1"><Thermometer className="w-3.5 h-3.5" /> Temp Bracket: {data.label}</p>
                              <p className="font-bold mt-1 text-sm">{data.count} Deer Harvested</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]}>
                      {temperatureChartData.brackets.map((entry, index) => {
                        const colors = ['#0284c7', '#0369a1', '#10b981', '#f59e0b', '#ef4444'];
                        return <Cell key={`temp-cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>
                  {temperatureChartData.recordedCount > 0
                    ? `Logged in ${temperatureChartData.recordedCount} of ${logs.length} harvest logs`
                    : 'Log temperatures on your harvests to build precise weather trends'}
                </span>
                <span className="font-bold text-sky-400">
                  Unit: °{units === 'metric' ? 'C' : 'F'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Row: GRAPH 7 (Wind Speed Distribution) & GRAPH 8 (Wind Direction Distribution) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* GRAPH 7: Wind Speed Distribution */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wind className="w-5 h-5 text-teal-500" />
                    <h3 className="text-base font-black tracking-tight">Wind Speed Distribution</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-teal-500/10 text-teal-500 border border-teal-500/20">
                    Wind Velocity
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Harvest count across wind speed intensity brackets ({units === 'metric' ? 'km/h' : 'mph'}).
                </p>
              </div>

              <div className="h-60 w-full outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={windAnalyticsData.speedBrackets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 700 }} />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-extrabold text-teal-400 flex items-center gap-1"><Wind className="w-3.5 h-3.5" /> Wind Speed: {data.label} {units === 'metric' ? 'km/h' : 'mph'}</p>
                              <p className="font-bold mt-1 text-sm">{data.count} Deer Harvested</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Light-to-moderate winds usually provide steady deer movement</span>
                <span className="font-bold text-teal-400">{windAnalyticsData.speedRecordedCount} Logs Recorded</span>
              </div>
            </div>

            {/* GRAPH 8: Wind Direction Distribution */}
            <div
              className={`p-5 sm:p-6 rounded-2xl border shadow-xl flex flex-col justify-between ${
                isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wind className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-base font-black tracking-tight">Harvest Wind Direction</h3>
                  </div>
                  <span className="text-xs font-bold uppercase px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    Wind Direction
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Harvests grouped by wind direction (N, NE, E, SE, S, SW, W, NW).
                </p>
              </div>

              <div className="h-60 w-full outline-none focus:outline-none [&_*]:outline-none [&_*]:focus:outline-none">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={windAnalyticsData.dirData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                    <XAxis dataKey="direction" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: 800 }} />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' }}
                      wrapperStyle={{ outline: 'none' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs">
                              <p className="font-extrabold text-indigo-400 flex items-center gap-1"><Compass className="w-3.5 h-3.5" /> Wind Direction: {data.direction}</p>
                              <p className="font-bold mt-1 text-sm">{data.count} Deer Harvested</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="text-xs pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Helps evaluate wind direction strategy for stand placements</span>
                <span className="font-bold text-indigo-400">{windAnalyticsData.dirRecordedCount} Direction Logs</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= ALL LOGS LIST VIEW ================= */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div
            className={`p-3 sm:p-4 rounded-2xl border shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`
            }`}
          >
            {/* Search input */}
            <div className="flex-1 min-w-[200px] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider opacity-70">
                  <Filter className="w-3.5 h-3.5 text-emerald-500" /> Harvest library
                </div>
                <span className="text-xs font-bold opacity-60 tabular-nums">{filteredLogs.length} shown of {logs.length}</span>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes, stands, weapons..."
                  aria-label="Search harvest logs"
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-semibold focus:outline-none border transition-all ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Gender Filter */}
              <AppSelect
                value={selectedGenderFilter}
                onChange={(e) => setSelectedGenderFilter(e.target.value)}
                className={`px-3 py-2 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="All">All Genders</option>
                <option value="Buck">Bucks Only</option>
                <option value="Doe">Does Only</option>
                <option value="Button Buck">Button Bucks</option>
              </AppSelect>

              {/* Stand Filter */}
              <AppSelect
                value={selectedStandFilter}
                onChange={(e) => setSelectedStandFilter(e.target.value)}
                className={`px-3 py-2 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer max-w-[150px] truncate ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="All">All Stands</option>
                {availableStands.map((st, i) => (
                  <option key={i} value={st}>
                    {st}
                  </option>
                ))}
              </AppSelect>

              {/* Year Filter */}
              <AppSelect
                value={selectedYearFilter}
                onChange={(e) => setSelectedYearFilter(e.target.value)}
                className={`px-3 py-2 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="All">All Years</option>
                {availableYears.map((y, i) => (
                  <option key={i} value={y}>
                    {y}
                  </option>
                ))}
              </AppSelect>

              {(searchQuery || selectedGenderFilter !== 'All' || selectedStandFilter !== 'All' || selectedYearFilter !== 'All') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedGenderFilter('All');
                    setSelectedStandFilter('All');
                    setSelectedYearFilter('All');
                  }}
                  className="p-2 text-rose-500 hover:text-rose-400 font-bold text-xs"
                  title="Reset Filters"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Logs Cards Grid */}
          {filteredLogs.length === 0 && (
            <div className={`rounded-2xl border p-8 text-center shadow-lg ${isDark ? `${cardBg} border-slate-800` : `${cardBgLight} border-slate-200`}`}>
              <Filter className="w-8 h-8 mx-auto text-emerald-500 mb-3" />
              <h3 className="text-sm font-black">No harvests match these filters</h3>
              <p className="text-xs opacity-65 mt-1 max-w-sm mx-auto">Try a different search or clear the filters to see your full harvest library.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedGenderFilter('All');
                  setSelectedStandFilter('All');
                  setSelectedYearFilter('All');
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Clear filters
              </button>
            </div>
          )}
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${filteredLogs.length === 0 ? 'hidden' : ''}`}>
            {filteredLogs.map((log) => {
              const dateObj = new Date(log.dateTime);
              const formattedDate = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : log.dateTime;

              const formattedTime = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '';

              return (
                <div
                  key={log.id}
                  className={`rounded-2xl border shadow-lg overflow-hidden flex flex-col justify-between transition-all hover:scale-[1.01] ${
                    isDark ? `${cardBg} border-slate-800 text-slate-100` : `${cardBgLight} border-slate-200 text-slate-900`
                  }`}
                >
                  {/* Card Image Banner if present */}
                  {log.photoUrl ? (
                    <div
                      className="h-44 w-full relative bg-slate-950 cursor-pointer overflow-hidden group"
                      onClick={() => setPreviewPhotoUrl(log.photoUrl || null)}
                    >
                      <img
                        src={log.photoUrl}
                        alt="Harvest Photo"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-black">
                        <span className="px-2.5 py-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/10 flex items-center gap-1">
                          <Camera className="w-3 h-3 text-emerald-400" /> Photo Attached
                        </span>
                        {log.gender === 'Buck' && log.points && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black">
                            {log.points} Points
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* Card Main Body */}
                  <div className="p-5 space-y-3 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-extrabold uppercase tracking-wider">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formattedDate}</span>
                          {formattedTime && <span>• {formattedTime}</span>}
                        </div>
                        <h4 className="text-base font-black mt-1 line-clamp-1">{log.standName}</h4>
                      </div>

                      <span
                        className="px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex-shrink-0"
                        style={{
                          backgroundColor: `${GENDER_COLORS[log.gender] || '#10b981'}20`,
                          color: GENDER_COLORS[log.gender] || '#10b981',
                          border: `1px solid ${GENDER_COLORS[log.gender] || '#10b981'}40`,
                        }}
                      >
                        {log.gender}
                      </span>
                    </div>

                    {/* Metadata Chips */}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {log.age && (
                        <span className={`px-2 py-1 rounded-xl text-xs font-semibold border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                          Age: {log.age}
                        </span>
                      )}
                      {log.points !== undefined && (
                        <span className={`px-2 py-1 rounded-xl text-xs font-semibold border ${isDark ? 'bg-slate-950 border-slate-800 text-amber-300' : 'bg-slate-100 border-slate-200 text-amber-700'}`}>
                          {log.points} Antler Points
                        </span>
                      )}
                      {log.weightLbs !== undefined && (
                        <span className={`px-2 py-1 rounded-xl text-xs font-semibold border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                          {log.weightLbs} lbs
                        </span>
                      )}
                      {log.weapon && (
                        <span className={`px-2 py-1 rounded-xl text-xs font-semibold border ${isDark ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-slate-100 border-slate-200 text-emerald-700'}`}>
                          {log.weapon}
                        </span>
                      )}
                      {log.temperature !== undefined && (
                        <span className={`px-2 py-1 rounded-xl text-xs font-semibold border ${isDark ? 'bg-slate-950 border-slate-800 text-sky-300' : 'bg-slate-100 border-slate-200 text-sky-700'}`}>
                          <Thermometer className="w-3.5 h-3.5" /> {log.temperature}°{units === 'metric' ? 'C' : 'F'}
                        </span>
                      )}
                      {(log.windSpeed !== undefined || log.windDirection) && (
                        <span className={`px-2 py-1 rounded-xl text-xs font-semibold border ${isDark ? 'bg-slate-950 border-slate-800 text-teal-300' : 'bg-slate-100 border-slate-200 text-teal-700'}`}>
                          <Wind className="w-3.5 h-3.5" /> {log.windDirection ? `${log.windDirection} ` : ''}{log.windSpeed !== undefined ? `${log.windSpeed} ${units === 'metric' ? 'km/h' : 'mph'}` : ''}
                        </span>
                      )}
                    </div>

                    {log.notes && (
                      <p className={`text-xs italic line-clamp-2 pt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        "{log.notes}"
                      </p>
                    )}
                  </div>

                  {/* Card Bottom Actions */}
                  <div className={`px-5 py-3 border-t flex items-center justify-between text-xs ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-xs text-slate-400 font-mono">ID: #{log.id.slice(-6)}</span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditLog(log)}
                        className={`p-1.5 rounded-xl border transition-colors ${
                          isDark
                            ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Edit Log"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="p-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-colors"
                        title="Delete Log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= MODAL 1: ADD / EDIT HARVEST LOG FORM ================= */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div
            className={`w-full max-w-xl my-8 p-6 sm:p-8 rounded-2xl border shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-black uppercase text-emerald-500 tracking-wider">
                  Deer Harvest Log
                </span>
                <h3 className="text-xl font-black mt-0.5">
                  {editingLogId ? 'Edit Deer Harvest Log' : 'Log New Deer Harvest'}
                </h3>
              </div>

              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLog} className="space-y-4">
              {/* Date & Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Date & Shot Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formDateTime}
                  onChange={(e) => setFormDateTime(e.target.value)}
                  className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none transition-all ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              {/* Stand / Marker Location Choice */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Stand / Hunting Spot *</span>
                  {mapPins.length > 0 && (
                    <span className="text-xs text-emerald-500 font-bold">
                      {mapPins.length} Map Markers Available
                    </span>
                  )}
                </label>

                {mapPins.length > 0 ? (
                  <div className="space-y-2">
                    <AppSelect
                      value={formStandId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormStandId(val);
                        if (val) {
                          const matched = mapPins.find((p) => p.id === val);
                          if (matched) setFormStandName(matched.name);
                        }
                      }}
                      className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                      }`}
                    >
                      <option value="">-- Custom Stand Name --</option>
                      {mapPins.map((pin) => (
                        <option key={pin.id} value={pin.id}>
                          {pin.name} ({pin.type})
                        </option>
                      ))}
                    </AppSelect>

                    <input
                      type="text"
                      value={formStandName}
                      onChange={(e) => setFormStandName(e.target.value)}
                      placeholder="Or enter custom stand/location name..."
                      className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none transition-all ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                      }`}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    value={formStandName}
                    onChange={(e) => setFormStandName(e.target.value)}
                    placeholder="e.g., North Ridge Tree Stand, Oak Creek Blind..."
                    className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none transition-all ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                    }`}
                  />
                )}
              </div>

              {/* Gender & Age Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Gender *</label>
                  <AppSelect
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as DeerGender)}
                    className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                    }`}
                  >
                    <option value="Buck">Buck (Antlered)</option>
                    <option value="Doe">Doe</option>
                    <option value="Button Buck">Button Buck</option>
                    <option value="Shed Buck">Shed Buck</option>
                    <option value="Other">Other</option>
                  </AppSelect>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Age (Optional)</label>
                  <AppSelect
                    value={formAge}
                    onChange={(e) => setFormAge(e.target.value)}
                    className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                    }`}
                  >
                    <option value="">-- Unspecified / Unknown --</option>
                    {AGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </AppSelect>
                </div>
              </div>

              {/* Points & Weight Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Antler Points (Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={formPoints}
                    onChange={(e) => setFormPoints(e.target.value)}
                    placeholder="e.g. 8, 10, 12"
                    className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none transition-all ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Weight ({units === 'metric' ? 'kg' : 'lbs'}) (Optional)
                  </label>
                  <AppSelect
                    value={formWeight}
                    onChange={(e) => setFormWeight(e.target.value)}
                    className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                    }`}
                  >
                    <option value="">-- Unspecified / Unknown --</option>
                    {(units === 'metric' ? WEIGHT_OPTIONS_KG : WEIGHT_OPTIONS_LBS).map((w) => (
                      <option key={w} value={String(w)}>
                        {w} {units === 'metric' ? 'kg' : 'lbs'}
                      </option>
                    ))}
                  </AppSelect>
                </div>
              </div>

              {/* Weapon Used */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Weapon Used</label>
                <AppSelect
                  value={formWeapon}
                  onChange={(e) => setFormWeapon(e.target.value)}
                  className={`w-full p-3 rounded-2xl text-xs font-bold border focus:outline-none cursor-pointer ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                >
                  <option value="Compound Bow">Compound Bow</option>
                  <option value="Crossbow">Crossbow</option>
                  <option value="Rifle (.30-06)">Rifle (.30-06)</option>
                  <option value="Rifle (.270)">Rifle (.270)</option>
                  <option value="Rifle (6.5 Creedmoor)">Rifle (6.5 Creedmoor)</option>
                  <option value="Muzzleloader">Muzzleloader</option>
                  <option value="Shotgun Slug">Shotgun Slug</option>
                  <option value="Handgun">Handgun</option>
                  <option value="Traditional Bow / Recurve">Traditional Bow / Recurve</option>
                </AppSelect>
              </div>

              {/* Weather Conditions Row (Temp, Wind Speed, Wind Dir) */}
              <div className="p-3.5 rounded-2xl border border-slate-700/50 bg-slate-900/40 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Weather & Wind Conditions</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFillWeather}
                    disabled={isFetchingWeather}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                    title="Auto-fill temperature and wind data based on selected harvest date and time"
                  >
                    {isFetchingWeather ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Auto-Fill Weather</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Temperature */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Temp ({units === 'metric' ? '°C' : '°F'})
                    </label>
                    <input
                      type="number"
                      value={formTemp}
                      onChange={(e) => setFormTemp(e.target.value)}
                      placeholder={units === 'metric' ? 'e.g. 5' : 'e.g. 38'}
                      className={`w-full p-2.5 rounded-xl text-xs font-bold border focus:outline-none transition-all ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  {/* Wind Speed */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Wind Speed ({units === 'metric' ? 'km/h' : 'mph'})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formWindSpeed}
                      onChange={(e) => setFormWindSpeed(e.target.value)}
                      placeholder={units === 'metric' ? 'e.g. 12' : 'e.g. 8'}
                      className={`w-full p-2.5 rounded-xl text-xs font-bold border focus:outline-none transition-all ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                      }`}
                    />
                  </div>

                  {/* Wind Direction */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Wind Direction
                    </label>
                    <AppSelect
                      value={formWindDir}
                      onChange={(e) => setFormWindDir(e.target.value)}
                      className={`w-full p-2.5 rounded-xl text-xs font-bold border focus:outline-none cursor-pointer ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                      }`}
                    >
                      <option value="">Unspecified</option>
                      <option value="N">North (N)</option>
                      <option value="NNE">NNE</option>
                      <option value="NE">North-East (NE)</option>
                      <option value="ENE">ENE</option>
                      <option value="E">East (E)</option>
                      <option value="ESE">ESE</option>
                      <option value="SE">South-East (SE)</option>
                      <option value="SSE">SSE</option>
                      <option value="S">South (S)</option>
                      <option value="SSW">SSW</option>
                      <option value="SW">South-West (SW)</option>
                      <option value="WSW">WSW</option>
                      <option value="W">West (W)</option>
                      <option value="WNW">WNW</option>
                      <option value="NW">North-West (NW)</option>
                      <option value="NNW">NNW</option>
                      <option value="Calm">Calm / Variable</option>
                    </AppSelect>
                  </div>
                </div>
              </div>

              {/* Photo Upload Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Harvest Photo (Optional)
                </label>

                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {formPhotoUrl ? (
                  <div className="relative rounded-2xl overflow-hidden h-40 border border-slate-700 bg-slate-950">
                    <img src={formPhotoUrl} alt="Upload Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormPhotoUrl('')}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-500 transition-colors shadow-lg cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full p-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                      isDark
                        ? 'border-slate-800 hover:border-emerald-500 bg-slate-950/50 text-slate-400'
                        : 'border-slate-200 hover:border-emerald-600 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Upload className="w-6 h-6 text-emerald-500" />
                    <span className="text-xs font-bold">Click to Upload Deer Photo</span>
                    <span className="text-xs text-slate-500">Supports JPEG, PNG, WEBP (Saved locally)</span>
                  </button>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Notes & Field Observations
                </label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g., Grunted in from 80 yards away. Cold front drop of 15 degrees, North wind."
                  className={`w-full p-3 rounded-2xl text-xs font-semibold border focus:outline-none transition-all ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer"
                >
                  {editingLogId ? 'Update Log' : 'Save Harvest Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: FULL PHOTO PREVIEW ================= */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in cursor-pointer"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center">
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Full Harvest Photo"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
};
