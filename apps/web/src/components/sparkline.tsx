import { beatColor } from '@/lib/status';
import { cn } from '@/lib/utils';

/**
 * Compact heartbeat sparkline driven by a list of beat codes (oldest→newest), for list rows.
 * Pads on the left with empty slots so every row's bar lines up to the same width.
 */
export function Sparkline({
  beats,
  slots = 32,
  className,
}: {
  beats: number[] | undefined;
  slots?: number;
  className?: string;
}) {
  const recent = (beats ?? []).slice(-slots);
  const pad = Math.max(0, slots - recent.length);
  return (
    <div className={cn('flex h-6 items-stretch gap-0.5', className)} aria-hidden>
      {Array.from({ length: pad }).map((_, i) => (
        <span key={`pad-${i}`} className="w-1 rounded-full bg-slate-100 dark:bg-slate-800" />
      ))}
      {recent.map((b, i) => (
        <span key={i} className={cn('w-1 rounded-full', beatColor(b))} />
      ))}
    </div>
  );
}
