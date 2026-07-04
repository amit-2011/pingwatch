/**
 * One source of truth for status presentation across the app — monitor statuses (strings) and
 * heartbeat beat codes (ints). Keep colors here so the badge, sparkline, heartbeat bar, and
 * overview cards never drift.
 */

export interface StatusMeta {
  label: string;
  /** Solid dot / bar background. */
  solid: string;
  /** Foreground text color. */
  text: string;
  /** Soft tinted surface (cards, chips). */
  soft: string;
  /**
   * The big, read-from-across-the-room status pill. Down is filled solid red (maximum alarm);
   * everything else is a soft tinted pill (design system: Status pill).
   */
  pill: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  up: {
    label: 'Up',
    solid: 'bg-primary',
    text: 'text-brand-600 dark:text-brand-400',
    soft: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
    pill: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  },
  down: {
    label: 'Down',
    solid: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    soft: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
    pill: 'bg-red-500 text-white',
  },
  pending: {
    label: 'Pending',
    solid: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    soft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  maintenance: {
    label: 'Maintenance',
    solid: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    soft: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  },
  paused: {
    label: 'Paused',
    solid: 'bg-slate-400',
    text: 'text-slate-500',
    soft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.pending!;
}

/** Heartbeat beat codes (1=up, 0=down, 2=pending, 3=maintenance) → bar color. */
const BEAT_COLOR: Record<number, string> = {
  1: 'bg-primary',
  0: 'bg-red-500',
  2: 'bg-amber-400',
  3: 'bg-blue-400',
};
export function beatColor(status: number): string {
  return BEAT_COLOR[status] ?? 'bg-slate-300 dark:bg-slate-700';
}

/** Heartbeat beat code → full status meta (label/colors), so the bar + its tooltip never drift. */
const BEAT_NAME: Record<number, string> = { 1: 'up', 0: 'down', 2: 'pending', 3: 'maintenance' };
export function beatMeta(status: number): StatusMeta {
  return statusMeta(BEAT_NAME[status] ?? 'pending');
}

/** Bright label color readable on the dark heartbeat tooltip surface. */
const BEAT_TIP_TEXT: Record<number, string> = {
  1: 'text-primary',
  0: 'text-red-400',
  2: 'text-amber-400',
  3: 'text-blue-400',
};
export function beatTipText(status: number): string {
  return BEAT_TIP_TEXT[status] ?? 'text-slate-300';
}
