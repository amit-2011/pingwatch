import { cn } from '@/lib/utils';

const STYLES: Record<string, { label: string; dot: string; text: string }> = {
  up: { label: 'Up', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  down: { label: 'Down', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  pending: { label: 'Pending', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  paused: { label: 'Paused', dot: 'bg-slate-400', text: 'text-slate-500' },
  maintenance: { label: 'Maintenance', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? STYLES.pending!;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', s.text)}>
      <span className={cn('h-2 w-2 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}
