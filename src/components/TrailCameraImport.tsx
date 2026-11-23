import React, { useRef, useState } from 'react';
import { Upload, Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ThemeMode, ThemeVariantMode } from '../types';

interface TrailCameraImportProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  onImportComplete: () => void;
  importing: boolean;
  progress: { completed: number; total: number } | null;
  onStartImport: (files: FileList | File[]) => void;
}

export const TrailCameraImport: React.FC<TrailCameraImportProps> = ({
  theme,
  isDark = theme === 'dark',
  importing,
  progress,
  onStartImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onStartImport(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onStartImport(e.dataTransfer.files);
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {importing ? (
        <div
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center backdrop-blur-md shadow-xl transition-all ${
            isDark
              ? 'bg-slate-900/[var(--card-opacity)] border-emerald-500/50 text-slate-100'
              : theme === 'hunting'
              ? 'bg-[#eae1cf] border-[#c85a17] text-[#2a1b0e]'
              : (theme === 'olive' || theme === 'hunting')
              ? 'bg-[#f7f5ed] border-[#556b2f] text-[#1e2e1b]'
              : 'bg-white border-emerald-500 text-slate-900'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <Camera className="w-5 h-5 text-emerald-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                Importing Trail Cam Photos...
              </h3>
              <p className="text-xs opacity-70 mt-1">
                Running OCR date extraction and generating thumbnails ({progress?.completed || 0} / {progress?.total || 0})
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-md bg-slate-700/30 rounded-full h-3 overflow-hidden border border-slate-500/20">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs font-black text-emerald-500">{percent}% Complete</span>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 backdrop-blur-md shadow-xl ${
            isDragging
              ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
              : isDark
              ? 'bg-slate-900/[calc(var(--card-opacity)*0.7)] border-slate-700 hover:border-emerald-500/60 hover:bg-slate-900/[var(--card-opacity)]'
              : theme === 'hunting'
              ? 'bg-[#eae1cf]/80 border-[#d4c4a8] hover:border-[#c85a17] text-[#2a1b0e]'
              : (theme === 'olive' || theme === 'hunting')
              ? 'bg-[#f7f5ed]/80 border-[#d8d2c0] hover:border-[#556b2f] text-[#1e2e1b]'
              : 'bg-white/80 border-slate-300 hover:border-emerald-500 text-slate-900'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base tracking-wide">
                Import Trail Cam Photos
              </h3>
              <p className="text-xs opacity-70 mt-1 max-w-sm mx-auto">
                Drag & drop single or bulk photos (supports 100s to 1,000s of images). OCR extracts timestamps from the photo's info bar — no EXIF needed.
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 pointer-events-none"
            >
              <Camera className="w-4 h-4" /> Select Photos From Device
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
