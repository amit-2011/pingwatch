import { cn } from '@/lib/utils';

/**
 * PingWatch mark — a single heartbeat/pulse line inside a green rounded square. Reads as
 * "watching a signal". Renders crisp from 16px favicon up to hero sizes.
 */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="PingWatch"
    >
      <rect width="48" height="48" rx="13" fill="#15B364" />
      <path
        d="M8 25h7l3.5-9 6 18 3.5-9h6.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full lockup: mark + wordmark. "Ping" in the foreground ink, "Watch" in signal green.
 * Set `light` on dark surfaces (dark sidebar, hero) so the wordmark is white.
 */
export function Logo({
  size = 26,
  className,
  light = false,
}: {
  size?: number;
  className?: string;
  light?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          'font-extrabold tracking-tight',
          light ? 'text-white' : 'text-slate-900 dark:text-white',
        )}
        style={{ fontSize: size * 0.72 }}
      >
        Ping<span className={light ? 'text-brand-300' : 'text-brand-600 dark:text-brand-300'}>Watch</span>
      </span>
    </span>
  );
}
