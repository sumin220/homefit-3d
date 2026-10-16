import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export interface HoverTooltipProps {
  title: string;
  description: string;
  tip?: string;
  badge?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end' | 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

/**
 * Accessible UX Hover Explanation Popover (Tooltip Card).
 * Displays a structured English guide card when a user hovers or focuses on a UI control.
 */
export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  title,
  description,
  tip,
  badge,
  position = 'top',
  align = 'center',
  children,
  className = '',
  showIcon = false,
}) => {
  const [open, setOpen] = useState(false);

  const posClass =
    position === 'bottom'
      ? 'top-full mt-2'
      : position === 'left'
      ? 'right-full mr-2.5 top-1/2 -translate-y-1/2'
      : position === 'right'
      ? 'left-full ml-2.5 top-1/2 -translate-y-1/2'
      : 'bottom-full mb-2';

  const alignClass =
    position === 'left' || position === 'right'
      ? ''
      : align === 'start' || align === 'left'
      ? 'left-0'
      : align === 'end' || align === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {showIcon && (
        <HelpCircle className="w-3.5 h-3.5 ml-1 text-slate-400 hover:text-sky-300 transition shrink-0" />
      )}

      {open && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute z-50 w-64 sm:w-72 rounded-2xl bg-slate-950/95 backdrop-blur-md border border-sky-400/50 p-3 shadow-2xl shadow-slate-950/90 text-left animate-in fade-in duration-150 ${posClass} ${alignClass}`}
        >
          <div className="flex items-center justify-between gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-sky-300 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
              <span>{title}</span>
            </div>
            {badge && (
              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[9px] font-mono">
                {badge}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-200 leading-relaxed font-normal">
            {description}
          </p>
          {tip && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[10px] font-mono text-emerald-300">
              Tip: {tip}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
