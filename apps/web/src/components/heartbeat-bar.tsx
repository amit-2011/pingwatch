import type { Heartbeat } from '@/lib/api';
import { cn } from '@/lib/utils';

const COLOR: Record<number, string> = {
  1: 'bg-emerald-500',
  0: 'bg-red-500',
  2: 'bg-amber-400',
  3: 'bg-blue-400',
};

/** Renders recent beats oldest→newest (API returns newest-first). */
export function HeartbeatBar({ beats }: { beats: Heartbeat[] }) {
  if (beats.length === 0) {
    return <span className="text-xs text-slate-400">No checks yet</span>;
  }
  return (
    <div className="flex items-end gap-[3px]">
      {[...beats].reverse().map((b, i) => (
        <span
          key={i}
          title={`${b.statusCode ?? ''} ${b.message ?? ''}`.trim()}
          className={cn('h-7 w-[5px] rounded-sm', COLOR[b.status] ?? 'bg-slate-300')}
        />
      ))}
    </div>
  );
}
