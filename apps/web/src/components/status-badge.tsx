import { statusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = statusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', s.text, className)}>
      <span className={cn('h-2 w-2 rounded-full', s.solid)} />
      {s.label}
    </span>
  );
}

/** A filled pill version for prominent placements (detail header, overview). */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = statusMeta(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        s.soft,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.solid)} />
      {s.label}
    </span>
  );
}
