'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MonitorHistoryRange } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface RangeOption {
  id: MonitorHistoryRange;
  label: string;
}

/** Kuma-style range choices; the server picks raw vs. rollup resolution per range. */
export const RANGE_OPTIONS: RangeOption[] = [
  { id: 'recent', label: 'Recent' },
  { id: '3h', label: '3h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '1w', label: '1w' },
];

/** Pill button + popover list, styled after a "Recent ▾" range selector. */
export function RangeDropdown({
  options,
  value,
  onChange,
}: {
  options: RangeOption[];
  value: MonitorHistoryRange;
  onChange: (id: MonitorHistoryRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {current?.label}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-1.5 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={cn(
                'block w-full px-3.5 py-1.5 text-left text-sm transition-colors',
                o.id === value
                  ? 'bg-emerald-500 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
