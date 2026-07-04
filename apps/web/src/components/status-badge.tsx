import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

/** Inline status — a small dot + label for table/list density. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = statusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', s.text, className)}>
      <span className={cn('h-2 w-2 rounded-full', s.solid)} />
      {s.label}
    </span>
  );
}

/**
 * The big status pill — the single most important element in the product, readable from across a
 * room. Down is a solid red fill; up/degraded/paused are soft tinted pills. The dot pulses while
 * the status is live "up".
 */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = statusMeta(status);
  const solid = status === 'down';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold tracking-wide uppercase',
        s.pill,
        className,
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          solid ? 'bg-white' : s.solid,
          status === 'up' && 'pulse-ring',
        )}
      />
      {s.label}
    </span>
  );
}
