import React from 'react';
import { ThemeMode, ThemeVariantMode } from '../types';
import { Check, ArrowRight } from 'lucide-react';

interface TeachingStep {
  title: string;
  description: string;
}

interface TeachingEmptyStateProps {
  theme?: ThemeVariantMode;
  isDark?: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  steps: TeachingStep[];
  ctaLabel?: string;
  onCta?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
}

/**
 * A friendly, instructive empty state. Instead of a bare "no data" line, it
 * explains what the feature does, walks the user through the first steps, and
 * offers a primary call-to-action so a brand-new section never feels dead.
 */
export const TeachingEmptyState: React.FC<TeachingEmptyStateProps> = ({
  theme,
  isDark = theme === 'dark',
  icon,
  title,
  description,
  steps,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  compact = false,
}) => {
  const isHunting = theme === 'hunting';
  const isOlive = theme === 'olive';

  const cardBg = isDark
    ? 'bg-slate-900/[var(--card-opacity)] backdrop-blur-md border-slate-800'
    : isHunting
    ? 'bg-[#eee6d6]/[var(--card-opacity)] backdrop-blur-md border-[#d4c4a8]'
    : isOlive
    ? 'bg-[#f7f5ed]/[var(--card-opacity)] backdrop-blur-md border-[#d8d2c0]'
    : 'bg-white/[var(--card-opacity)] backdrop-blur-md border-slate-200';

  const iconWrapBg = isDark
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : isHunting
    ? 'bg-[#c85a17]/10 border-[#c85a17]/30 text-[#c85a17]'
    : isOlive
    ? 'bg-[#556b2f]/10 border-[#556b2f]/30 text-[#556b2f]'
    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600';

  const titleColor = isDark ? 'text-white' : isHunting ? 'text-[#2a1b0e]' : isOlive ? 'text-[#1e2e1b]' : 'text-slate-900';
  const bodyColor = isDark ? 'text-slate-400' : isHunting ? 'text-[#8b7355]' : isOlive ? 'text-[#6e6a5e]' : 'text-slate-600';

  const ctaBg = isDark
    ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
    : isHunting
    ? 'bg-[#c85a17] hover:bg-[#b34e12] text-white'
    : isOlive
    ? 'bg-[#556b2f] hover:bg-[#4a5e27] text-white'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white';

  const stepNumBg = isDark ? 'bg-slate-800 text-emerald-400 border-slate-700' : isHunting ? 'bg-[#e0d6c0] text-[#c85a17] border-[#d4c4a8]' : isOlive ? 'bg-[#e8e4d5] text-[#556b2f] border-[#d8d2c0]' : 'bg-slate-100 text-emerald-600 border-slate-200';

  return (
    <div
      className={`w-full rounded-2xl border text-center flex flex-col items-center ${
        compact ? 'px-4 py-5 sm:px-6 sm:py-6' : 'px-5 py-8 sm:px-8 sm:py-10'
      } ${cardBg}`}
    >
      {/* Icon */}
      <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center ${iconWrapBg}`}>
        {icon}
      </div>

      <h3 className={`mt-3 font-black tracking-tight ${compact ? 'text-base' : 'text-lg'} ${titleColor}`}>
        {title}
      </h3>
      <p className={`mt-1.5 text-xs leading-relaxed max-w-md ${bodyColor}`}>{description}</p>

      {/* Step-by-step walkthrough */}
      <div className="w-full max-w-md mt-4 space-y-2 text-left">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 p-2.5 rounded-xl border ${
              isDark ? 'bg-slate-950/[var(--card-opacity)] border-slate-800' : isHunting ? 'bg-[#e0d6c0]/40 border-[#d4c4a8]/50' : isOlive ? 'bg-[#e8e4d5]/40 border-[#d8d2c0]/50' : 'bg-slate-50/[var(--card-opacity)] border-slate-200'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${stepNumBg}`}
            >
              {idx === steps.length - 1 ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="text-xs font-black leading-none">{idx + 1}</span>
              )}
            </span>
            <div className="min-w-0">
              <div className={`text-xs font-bold ${isDark ? 'text-slate-200' : isHunting ? 'text-[#2a1b0e]' : isOlive ? 'text-[#1e2e1b]' : 'text-slate-800'}`}>
                {step.title}
              </div>
              <div className={`text-xs leading-relaxed mt-0.5 ${bodyColor}`}>{step.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTAs */}
      {(ctaLabel || secondaryLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
          {ctaLabel && onCta && (
            <button
              onClick={onCta}
              className={`min-h-11 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${ctaBg}`}
            >
              {ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className={`min-h-11 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                isDark
                  ? 'bg-slate-900/[var(--card-opacity)] border-slate-700 text-slate-300 hover:bg-slate-800'
                  : isHunting
                  ? 'bg-[#eee6d6]/[var(--card-opacity)] border-[#d4c4a8] text-[#2a1b0e] hover:bg-[#e0d6c0]'
                  : isOlive
                  ? 'bg-[#f7f5ed]/[var(--card-opacity)] border-[#d8d2c0] text-[#1e2e1b] hover:bg-[#e8e4d5]'
                  : 'bg-white/[var(--card-opacity)] border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
